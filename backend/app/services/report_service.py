from sqlmodel import Session, func, select

from app.models import Report, Validation
from app.services.risk_service import observation_risk, risk_level, update_trust
from app.schemas import ReportPublic


def report_to_public(session: Session, report: Report) -> ReportPublic:
    return reports_to_public(session, [report])[0]


def reports_to_public(session: Session, reports: list[Report]) -> list[ReportPublic]:
    if not reports:
        return []
    report_ids = [report.id for report in reports]
    counts = dict(
        session.exec(
            select(Validation.report_id, func.count(Validation.id))
            .where(Validation.report_id.in_(report_ids))
            .group_by(Validation.report_id)
        ).all()
    )
    return [
        ReportPublic(
            id=report.id or 0,
            lat=report.lat,
            lng=report.lng,
            location_name=report.location_name,
            color=report.color,
            smell=report.smell,
            taste=report.taste,
            turbidity=report.turbidity,
            algae=report.algae,
            insects=report.insects,
            source_type=report.source_type,
            other_source=report.other_source,
            notes=report.notes,
            photo_url=report.photo_url,
            trust_score=report.trust_score,
            status=report.status,
            risk_level=risk_level(observation_risk(report)),
            validation_count=counts.get(report.id, 0),
            created_at=report.created_at,
        )
        for report in reports
    ]


def refresh_report_trust(session: Session, report: Report) -> None:
    votes = session.exec(select(Validation).where(Validation.report_id == report.id)).all()
    update_trust(report, votes)
    session.add(report)
