from datetime import datetime, timezone

from sqlalchemy import JSON, UniqueConstraint
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(max_length=80)
    email: str = Field(index=True, unique=True, max_length=254)
    hashed_password: str
    role: str = Field(default="citizen", max_length=20)
    is_active: bool = True
    created_at: datetime = Field(default_factory=utc_now)


class Report(SQLModel, table=True):
    __tablename__ = "reports"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    lat: float
    lng: float
    location_name: str | None = Field(default=None, max_length=160)
    color: str = Field(max_length=40)
    smell: str = Field(max_length=40)
    taste: str = Field(max_length=40)
    turbidity: str = Field(max_length=40)
    algae: str = Field(default="None", max_length=20)
    insects: str = Field(default="None", max_length=20)
    source_type: str = Field(default="Tap", max_length=40)
    other_source: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=2000)
    photo_url: str | None = Field(default=None, max_length=500)
    trust_score: float = 0.5
    status: str = Field(default="pending", max_length=20)
    created_at: datetime = Field(default_factory=utc_now, index=True)


class Validation(SQLModel, table=True):
    __tablename__ = "validations"
    __table_args__ = (UniqueConstraint("report_id", "user_id", name="uq_validation_report_user"),)

    id: int | None = Field(default=None, primary_key=True)
    report_id: int = Field(foreign_key="reports.id", index=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    vote: str = Field(max_length=10)
    comment: str | None = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=utc_now)


class PublishedResearch(SQLModel, table=True):
    __tablename__ = "published_research"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    title: str = Field(max_length=200)
    abstract: str = Field(max_length=1000)
    content: str = Field(max_length=20000)
    location: str | None = Field(default=None, max_length=160)
    tags: list[str] = Field(default_factory=list, sa_type=JSON)
    file_url: str | None = Field(default=None, max_length=300)
    link: str | None = Field(default=None, max_length=500)
    research_date: datetime
    created_at: datetime = Field(default_factory=utc_now, index=True)


class CollaborationRequest(SQLModel, table=True):
    __tablename__ = "collaboration_requests"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    recipient: str | None = Field(default=None, max_length=254)
    subject: str = Field(max_length=160)
    message: str = Field(max_length=3000)
    created_at: datetime = Field(default_factory=utc_now, index=True)
