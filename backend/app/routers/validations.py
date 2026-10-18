from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select

from app.models import Report, User, Validation
from app.schemas import ValidationCreate, ValidationPublic
from app.services.report_service import refresh_report_trust
from app.utils.auth import SessionDep, get_current_user

router = APIRouter(prefix="/validations", tags=["community validation"])


@router.post("/", response_model=ValidationPublic)
async def cast_vote(
    payload: ValidationCreate,
    session: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> Validation:
    report = session.get(Report, payload.report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Observation not found.")
    if report.user_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot validate your own observation.")
    validation = session.exec(
        select(Validation).where(
            Validation.report_id == report.id,
            Validation.user_id == user.id,
        )
    ).first()
    if validation is None:
        validation = Validation(report_id=report.id, user_id=user.id, vote=payload.vote, comment=payload.comment)
    else:
        validation.vote = payload.vote
        validation.comment = payload.comment
    session.add(validation)
    session.flush()
    refresh_report_trust(session, report)
    session.commit()
    session.refresh(validation)
    return validation


@router.get("/report/{report_id}", response_model=list[ValidationPublic])
async def report_votes(report_id: int, session: SessionDep) -> list[Validation]:
    if session.get(Report, report_id) is None:
        raise HTTPException(status_code=404, detail="Observation not found.")
    return session.exec(select(Validation).where(Validation.report_id == report_id)).all()
