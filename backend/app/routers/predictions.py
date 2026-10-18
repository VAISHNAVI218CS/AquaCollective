import math

from fastapi import APIRouter, Query
from sqlmodel import select

from app.models import Report
from app.schemas import RiskPrediction
from app.services.risk_service import observation_risk, risk_level
from app.utils.auth import SessionDep

router = APIRouter(prefix="/predictions", tags=["risk estimates"])


@router.get("/risk", response_model=RiskPrediction)
async def predict_risk(
    session: SessionDep,
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    radius_km: float = Query(default=10, gt=0, le=100),
) -> RiskPrediction:
    reports = session.exec(select(Report)).all()
    nearby: list[tuple[Report, float]] = []
    for report in reports:
        distance = _distance_km(lat, lng, report.lat, report.lng)
        if distance <= radius_km:
            nearby.append((report, distance))
    if not nearby:
        return RiskPrediction(
            latitude=lat,
            longitude=lng,
            risk_score=0,
            risk_level="low",
            nearby_reports=0,
            explanation="No community observations are available within this radius; there is not enough local data to estimate a concern level.",
        )
    weighted = [
        (observation_risk(report), max(0.05, report.trust_score) * math.exp(-distance / radius_km))
        for report, distance in nearby
    ]
    score = round(sum(value * weight for value, weight in weighted) / sum(weight for _, weight in weighted), 3)
    return RiskPrediction(
        latitude=lat,
        longitude=lng,
        risk_score=score,
        risk_level=risk_level(score),
        nearby_reports=len(nearby),
        explanation=f"Estimate based on {len(nearby)} community observation(s) within {radius_km:g} km. This is not a water safety test.",
    )


def _distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    delta_lat, delta_lng = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    value = math.sin(delta_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(delta_lng / 2) ** 2
    return 6371 * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))
