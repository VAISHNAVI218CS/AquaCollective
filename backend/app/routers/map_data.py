from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlmodel import select

from app.models import Report
from app.schemas import ReportPublic
from app.services.report_service import reports_to_public
from app.services.risk_service import observation_risk
from app.utils.auth import SessionDep

router = APIRouter(prefix="/map", tags=["map"])


@router.get("/markers", response_model=list[ReportPublic])
async def markers(
    session: SessionDep,
    limit: int = Query(default=1000, ge=1, le=2000),
) -> list[ReportPublic]:
    reports = session.exec(select(Report).order_by(Report.created_at.desc()).limit(limit)).all()
    return reports_to_public(session, reports)


@router.get("/heatmap")
async def heatmap(session: SessionDep) -> list[list[float]]:
    reports = session.exec(select(Report)).all()
    return [[report.lat, report.lng, max(0.15, observation_risk(report))] for report in reports]
