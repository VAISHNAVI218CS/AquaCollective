from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session

from app.database import get_session
from app.models import User
from app.utils.security import decode_subject

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)
SessionDep = Annotated[Session, Depends(get_session)]


def get_current_user(
    session: SessionDep,
    token: Annotated[str | None, Depends(oauth2_scheme)],
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sign in to continue.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if token is None:
        raise credentials_error
    subject = decode_subject(token)
    if subject is None or not subject.isdigit():
        raise credentials_error
    user = session.get(User, int(subject))
    if user is None or not user.is_active:
        raise credentials_error
    return user


def require_researcher(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role not in {"researcher", "admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Researcher access required.")
    return user
