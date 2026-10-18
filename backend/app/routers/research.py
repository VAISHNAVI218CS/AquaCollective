import csv
import io
import json
import re
from datetime import datetime, time, timezone
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from app.models import CollaborationRequest, PublishedResearch, Report, User
from app.schemas import (
    CollaborationRequestCreate,
    CollaborationRequestPublic,
    ResearchPublicationCreate,
    ResearchPublicationPublic,
)
from app.utils.auth import SessionDep, require_researcher

router = APIRouter(prefix="/research", tags=["research"])
UPLOAD_DIRECTORY = Path(__file__).resolve().parents[2] / "uploads"
MAX_PDF_BYTES = 10 * 1024 * 1024


@router.get("/stats")
async def stats(
    session: SessionDep,
    _researcher: Annotated[User, Depends(require_researcher)],
) -> dict[str, object]:
    reports = session.exec(select(Report)).all()
    return {
        "total_reports": len(reports),
        "verified_reports": sum(report.status == "validated" for report in reports),
        "high_risk_reports": sum(report.status != "rejected" and report_risk(report) >= 0.7 for report in reports),
        "average_trust": round(sum(report.trust_score for report in reports) / len(reports), 2) if reports else 0,
        "locations": len({(round(report.lat, 2), round(report.lng, 2)) for report in reports}),
    }


@router.get("/export")
async def export(
    session: SessionDep,
    _researcher: Annotated[User, Depends(require_researcher)],
    q: str | None = Query(default=None, max_length=100),
    status: str | None = Query(default=None, pattern="^(pending|validated|rejected)$"),
    risk: str | None = Query(default=None, pattern="^(low|medium|high)$"),
) -> Response:
    reports = session.exec(select(Report).order_by(Report.created_at.desc())).all()
    if status:
        reports = [report for report in reports if report.status == status]
    if risk:
        reports = [report for report in reports if report_risk_level(report) == risk]
    if q:
        needle = q.casefold()
        reports = [
            report for report in reports
            if needle in " ".join(filter(None, [
                report.location_name, report.color, report.smell, report.turbidity,
                report.algae, report.insects, report.source_type, report.other_source, report.notes,
            ])).casefold()
        ]
    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow(["Date", "Time", "Latitude", "Longitude", "Location", "Color", "Smell", "Taste", "Turbidity", "Algae / Green growth", "Unusual insects", "Source type", "Other source", "Notes", "Trust Score", "Status"])
    for report in reports:
        created = report.created_at
        created = created.replace(tzinfo=timezone.utc) if created.tzinfo is None else created.astimezone(timezone.utc)
        writer.writerow([
            created.strftime("%Y-%m-%d"), "", round(report.lat, 2),
            round(report.lng, 2), "", report.color, report.smell, report.taste,
            report.turbidity, report.algae, report.insects, report.source_type,
            _safe_cell(report.other_source or ""), "", report.trust_score, report.status,
        ])
    return Response(
        content="\ufeff" + stream.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="aquacollective-anonymized.csv"'},
    )


@router.get("/export/json")
async def export_json(
    session: SessionDep,
    _researcher: Annotated[User, Depends(require_researcher)],
    q: str | None = Query(default=None, max_length=100),
    status: str | None = Query(default=None, pattern="^(pending|validated|rejected)$"),
    risk: str | None = Query(default=None, pattern="^(low|medium|high)$"),
) -> Response:
    reports = _filtered_reports(session, q, status, risk)
    dataset = [
        {
            "date": _utc_datetime(report.created_at).date().isoformat(),
            "latitude": round(report.lat, 2),
            "longitude": round(report.lng, 2),
            "color": report.color,
            "smell": report.smell,
            "taste": report.taste,
            "turbidity": report.turbidity,
            "algae": report.algae,
            "insects": report.insects,
            "source_type": report.source_type,
            "trust_score": report.trust_score,
            "status": report.status,
        }
        for report in reports
    ]
    return Response(
        content=json.dumps(dataset, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="aquacollective-anonymized.json"'},
    )


@router.get("/summary")
async def research_summary(
    session: SessionDep,
    _researcher: Annotated[User, Depends(require_researcher)],
) -> dict[str, object]:
    reports = session.exec(select(Report)).all()
    if not reports:
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_observations": 0,
            "insights": ["There are no community observations to summarize yet."],
        }

    high_concern = [report for report in reports if report.status != "rejected" and report_risk(report) >= 0.7]
    verified = [report for report in reports if report.status == "validated"]
    locations = {report.location_name.strip() for report in reports if report.location_name and report.location_name.strip()}
    source_counts: dict[str, int] = {}
    for report in reports:
        source_counts[report.source_type] = source_counts.get(report.source_type, 0) + 1
    most_reported_source = max(source_counts, key=source_counts.get)
    insights = [
        f"{len(reports)} community observation(s) are in the dataset.",
        f"{len(verified)} observation(s) are community-validated.",
        f"{len(high_concern)} observation(s) have a higher concern score based on reported sensory signals.",
        f"{len(locations)} distinct named location(s) are represented.",
        f"The most frequently reported source type is {most_reported_source} ({source_counts[most_reported_source]} observation(s)).",
    ]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_observations": len(reports),
        "insights": insights,
        "caveat": "Automatically generated descriptive statistics, not laboratory findings or a water-safety assessment.",
    }


@router.get("/compare")
async def compare_locations(
    session: SessionDep,
    _researcher: Annotated[User, Depends(require_researcher)],
    location_a: str = Query(min_length=2, max_length=160),
    location_b: str = Query(min_length=2, max_length=160),
) -> dict[str, object]:
    reports = session.exec(select(Report)).all()
    return {
        "location_a": _location_summary(reports, location_a),
        "location_b": _location_summary(reports, location_b),
        "caveat": "Comparison is based on community-reported observations and does not establish water safety or causation.",
    }


@router.post("/publish/file", status_code=status.HTTP_201_CREATED)
async def upload_research_pdf(
    _researcher: Annotated[User, Depends(require_researcher)],
    file: UploadFile = File(...),
) -> dict[str, str]:
    if Path(file.filename or "").suffix.lower() != ".pdf":
        raise HTTPException(status_code=415, detail="Upload a PDF file.")
    if file.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status_code=415, detail="The uploaded file must be a PDF.")

    UPLOAD_DIRECTORY.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4()}.pdf"
    path = UPLOAD_DIRECTORY / filename
    total = 0
    first_chunk = b""
    try:
        with path.open("wb") as destination:
            while chunk := await file.read(64 * 1024):
                if not first_chunk:
                    first_chunk = chunk[:5]
                total += len(chunk)
                if total > MAX_PDF_BYTES:
                    raise HTTPException(status_code=413, detail="PDF files must be 10 MB or smaller.")
                destination.write(chunk)
        if first_chunk != b"%PDF-":
            raise HTTPException(status_code=415, detail="The uploaded file does not have a valid PDF signature.")
        return {"file_url": f"/research/files/{filename}"}
    except Exception:
        path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()


@router.get("/files/{filename}")
async def download_research_pdf(
    filename: str,
    _researcher: Annotated[User, Depends(require_researcher)],
) -> FileResponse:
    if not re.fullmatch(r"[0-9a-f-]{36}\.pdf", filename):
        raise HTTPException(status_code=404, detail="Research PDF not found.")
    path = UPLOAD_DIRECTORY / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Research PDF not found.")
    return FileResponse(path, media_type="application/pdf", filename=filename)


@router.post("/publish", response_model=ResearchPublicationPublic, status_code=status.HTTP_201_CREATED)
async def publish_research(
    payload: ResearchPublicationCreate,
    session: SessionDep,
    researcher: Annotated[User, Depends(require_researcher)],
) -> ResearchPublicationPublic:
    publication = PublishedResearch(
        user_id=researcher.id,
        title=payload.title,
        abstract=payload.abstract,
        content=payload.content,
        location=payload.location,
        tags=payload.tags,
        file_url=payload.file_url,
        link=str(payload.link) if payload.link else None,
        research_date=datetime.combine(payload.research_date, time.min, tzinfo=timezone.utc),
    )
    session.add(publication)
    session.commit()
    session.refresh(publication)
    return _publication_response(researcher, publication)


@router.get("/published", response_model=list[ResearchPublicationPublic])
async def published_research(
    session: SessionDep,
    _researcher: Annotated[User, Depends(require_researcher)],
    q: str | None = Query(default=None, max_length=100),
    tag: str | None = Query(default=None, max_length=40),
) -> list[ResearchPublicationPublic]:
    statement = select(PublishedResearch, User).join(User, PublishedResearch.user_id == User.id).order_by(
        PublishedResearch.research_date.desc(), PublishedResearch.created_at.desc()
    )
    publications = session.exec(statement).all()
    if q:
        needle = q.casefold()
        publications = [
            (publication, author) for publication, author in publications
            if needle in " ".join([publication.title, publication.abstract, publication.content, publication.location or "", *publication.tags, author.name]).casefold()
        ]
    if tag:
        needle = tag.casefold()
        publications = [
            (publication, author) for publication, author in publications
            if any(needle in item.casefold() for item in publication.tags)
        ]
    return [_publication_response(author, publication) for publication, author in publications]


@router.get("/published/my", response_model=list[ResearchPublicationPublic])
async def my_published_research(
    session: SessionDep,
    researcher: Annotated[User, Depends(require_researcher)],
) -> list[ResearchPublicationPublic]:
    publications = session.exec(
        select(PublishedResearch)
        .where(PublishedResearch.user_id == researcher.id)
        .order_by(PublishedResearch.research_date.desc(), PublishedResearch.created_at.desc())
    ).all()
    return [_publication_response(researcher, publication) for publication in publications]


@router.put("/published/{publication_id}", response_model=ResearchPublicationPublic)
async def update_published_research(
    publication_id: int,
    payload: ResearchPublicationCreate,
    session: SessionDep,
    researcher: Annotated[User, Depends(require_researcher)],
) -> ResearchPublicationPublic:
    publication = session.get(PublishedResearch, publication_id)
    if publication is None:
        raise HTTPException(status_code=404, detail="Published research not found.")
    if publication.user_id != researcher.id and researcher.role != "admin":
        raise HTTPException(status_code=403, detail="You can only edit your own published research.")
    publication.title = payload.title
    publication.abstract = payload.abstract
    publication.content = payload.content
    publication.location = payload.location
    publication.tags = payload.tags
    publication.file_url = payload.file_url
    publication.link = str(payload.link) if payload.link else None
    publication.research_date = datetime.combine(payload.research_date, time.min, tzinfo=timezone.utc)
    session.add(publication)
    session.commit()
    session.refresh(publication)
    return _publication_response(researcher, publication)


@router.delete("/published/{publication_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_published_research(
    publication_id: int,
    session: SessionDep,
    researcher: Annotated[User, Depends(require_researcher)],
) -> Response:
    publication = session.get(PublishedResearch, publication_id)
    if publication is None:
        raise HTTPException(status_code=404, detail="Published research not found.")
    if publication.user_id != researcher.id and researcher.role != "admin":
        raise HTTPException(status_code=403, detail="You can only delete your own published research.")
    session.delete(publication)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/collaborations", response_model=CollaborationRequestPublic, status_code=status.HTTP_201_CREATED)
async def request_collaboration(
    payload: CollaborationRequestCreate,
    session: SessionDep,
    researcher: Annotated[User, Depends(require_researcher)],
) -> CollaborationRequest:
    request = CollaborationRequest(
        user_id=researcher.id,
        recipient=str(payload.recipient) if payload.recipient else None,
        subject=payload.subject,
        message=payload.message,
    )
    session.add(request)
    session.commit()
    session.refresh(request)
    return request


@router.get("/collaborations/my", response_model=list[CollaborationRequestPublic])
async def my_collaboration_requests(
    session: SessionDep,
    researcher: Annotated[User, Depends(require_researcher)],
) -> list[CollaborationRequest]:
    return session.exec(
        select(CollaborationRequest)
        .where(CollaborationRequest.user_id == researcher.id)
        .order_by(CollaborationRequest.created_at.desc())
    ).all()


def _filtered_reports(session: Session, q: str | None, status: str | None, risk: str | None) -> list[Report]:
    reports = session.exec(select(Report).order_by(Report.created_at.desc())).all()
    if status:
        reports = [report for report in reports if report.status == status]
    if risk:
        reports = [report for report in reports if report_risk_level(report) == risk]
    if q:
        needle = q.casefold()
        reports = [
            report for report in reports
            if needle in " ".join(filter(None, [
                report.location_name, report.color, report.smell, report.turbidity,
                report.algae, report.insects, report.source_type, report.other_source, report.notes,
            ])).casefold()
        ]
    return reports


def _location_summary(reports: list[Report], location: str) -> dict[str, object]:
    needle = location.casefold()
    matched = [
        report for report in reports
        if needle in " ".join(filter(None, [report.location_name, report.source_type, report.other_source])).casefold()
    ]
    return {
        "query": location,
        "observation_count": len(matched),
        "average_trust": round(sum(report.trust_score for report in matched) / len(matched), 3) if matched else 0,
        "high_concern_count": sum(report.status != "rejected" and report_risk(report) >= 0.7 for report in matched),
        "validated_count": sum(report.status == "validated" for report in matched),
        "source_types": dict((source, sum(report.source_type == source for report in matched)) for source in {report.source_type for report in matched}),
    }


def _publication_response(author: User, publication: PublishedResearch) -> ResearchPublicationPublic:
    research_date = publication.research_date
    return ResearchPublicationPublic(
        id=publication.id or 0,
        user_id=publication.user_id,
        author_name=author.name,
        title=publication.title,
        abstract=publication.abstract,
        content=publication.content,
        location=publication.location,
        tags=publication.tags,
        file_url=publication.file_url,
        link=publication.link,
        research_date=research_date.date() if isinstance(research_date, datetime) else research_date,
        created_at=publication.created_at,
    )


def _utc_datetime(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _safe_cell(value: str) -> str:
    return f"'{value}" if value.lstrip().startswith(("=", "+", "-", "@")) else value


def report_risk(report: Report) -> float:
    from app.services.risk_service import observation_risk

    return observation_risk(report)


def report_risk_level(report: Report) -> str:
    from app.services.risk_service import risk_level

    return risk_level(report_risk(report))
