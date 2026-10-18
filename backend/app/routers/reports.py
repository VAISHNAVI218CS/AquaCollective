import csv
import io
import math
from datetime import timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlmodel import select

from app.models import Report, User
from app.schemas import ReportCreate, ReportPublic
from app.services.report_service import report_to_public, reports_to_public
from app.utils.auth import SessionDep, get_current_user, require_researcher

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("/", response_model=ReportPublic, status_code=status.HTTP_201_CREATED)
async def create_report(
    payload: ReportCreate,
    session: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> ReportPublic:
    values = payload.model_dump()
    if values["photo_url"] is not None:
        values["photo_url"] = str(values["photo_url"])
    report = Report(user_id=user.id, **values)
    session.add(report)
    session.commit()
    session.refresh(report)
    return report_to_public(session, report)


@router.get("/", response_model=list[ReportPublic])
async def list_reports(
    session: SessionDep,
    lat: float | None = Query(default=None, ge=-90, le=90),
    lng: float | None = Query(default=None, ge=-180, le=180),
    radius_km: float = Query(default=25, gt=0, le=500),
    limit: int = Query(default=250, ge=1, le=1000),
) -> list[ReportPublic]:
    reports = session.exec(select(Report).order_by(Report.created_at.desc()).limit(1000)).all()
    if (lat is None) != (lng is None):
        raise HTTPException(status_code=422, detail="Provide both lat and lng for a distance filter.")
    if lat is not None and lng is not None:
        reports = [
            report for report in reports
            if _distance_km(lat, lng, report.lat, report.lng) <= radius_km
        ]
    return reports_to_public(session, reports[:limit])


@router.get("/mine", response_model=list[ReportPublic])
async def my_reports(
    session: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> list[ReportPublic]:
    reports = session.exec(
        select(Report).where(Report.user_id == user.id).order_by(Report.created_at.desc())
    ).all()
    return reports_to_public(session, reports)


@router.get("/export")
async def export_reports(
    session: SessionDep,
    _researcher: Annotated[User, Depends(require_researcher)],
) -> Response:
    reports = session.exec(select(Report).order_by(Report.created_at.desc())).all()
    return _csv_response(reports, "aquacollective-observations.csv")


@router.get("/{report_id}", response_model=ReportPublic)
async def get_report(report_id: int, session: SessionDep) -> ReportPublic:
    report = session.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Observation not found.")
    return report_to_public(session, report)


def _distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371
    dlat, dlng = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    value = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def _csv_response(reports: list[Report], filename: str) -> Response:
    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow(["Date", "Time", "Latitude", "Longitude", "Location", "Color", "Smell", "Taste", "Turbidity", "Algae / Green growth", "Unusual insects", "Source type", "Other source", "Notes", "Trust Score", "Status"])
    for report in reports:
        created = report.created_at
        created = created.replace(tzinfo=timezone.utc) if created.tzinfo is None else created.astimezone(timezone.utc)
        writer.writerow([
            created.strftime("%Y-%m-%d"), created.strftime("%H:%M:%S UTC"),
            report.lat, report.lng, _safe_cell(report.location_name or ""), report.color, report.smell,
            report.taste, report.turbidity, report.algae, report.insects, report.source_type,
            _safe_cell(report.other_source or ""), _safe_cell(report.notes or ""),
            report.trust_score, report.status,
        ])
    return Response(
        content="\ufeff" + stream.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _safe_cell(value: str) -> str:
    return f"'{value}" if value.lstrip().startswith(("=", "+", "-", "@")) else value
