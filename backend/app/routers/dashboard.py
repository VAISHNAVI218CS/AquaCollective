from typing import Annotated

from fastapi import APIRouter, Depends
from sqlmodel import Session, func, select

from app.models import Report, User
from app.utils.auth import SessionDep, get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
async def dashboard_stats(
    session: SessionDep,
    user: Annotated[User, Depends(get_current_user)],
) -> dict[str, int]:
    personal = session.exec(select(func.count(Report.id)).where(Report.user_id == user.id)).one()
    community = session.exec(select(func.count(Report.id))).one()
    validated = session.exec(select(func.count(Report.id)).where(Report.status == "validated")).one()
    return {"personal_reports": personal, "community_reports": community, "validated_reports": validated}
