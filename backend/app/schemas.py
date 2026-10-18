from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl, ValidationInfo, field_validator, model_validator

Role = Literal["citizen", "researcher", "admin"]


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    role: Literal["citizen", "researcher"] = "citizen"

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Name must contain at least two non-space characters.")
        return value


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: EmailStr
    role: Role
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    role: Role


class ReportCreate(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    location_name: str | None = Field(default=None, max_length=160)
    color: Literal["Clear", "Yellow", "Brown", "Green", "Other"]
    smell: Literal["None", "Chemical", "Sewage", "Fishy", "Other"]
    taste: Literal["Not tested", "Normal", "Metallic", "Bitter", "Salty", "Other"]
    turbidity: Literal["Clear", "Slightly cloudy", "Very cloudy"]
    algae: Literal["None", "Little", "Moderate", "A lot"] = "None"
    insects: Literal["None", "Yes – few", "Yes – many"] = "None"
    source_type: Literal["Tap", "Borewell", "Open Well", "Lake", "River", "Pond", "Canal", "Other"] = "Tap"
    other_source: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=2000)
    photo_url: HttpUrl | None = None

    @field_validator("other_source")
    @classmethod
    def normalize_other_source(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def require_other_source_for_other(self) -> "ReportCreate":
        if self.source_type == "Other" and self.other_source is None:
            raise ValueError("Please enter the other water source type.")
        if self.source_type != "Other":
            self.other_source = None
        return self


class ReportPublic(BaseModel):
    id: int
    lat: float
    lng: float
    location_name: str | None
    color: str
    smell: str
    taste: str
    turbidity: str
    algae: str
    insects: str
    source_type: str
    other_source: str | None
    notes: str | None
    photo_url: str | None
    trust_score: float
    status: str
    risk_level: str
    validation_count: int = 0
    created_at: datetime


class ValidationCreate(BaseModel):
    report_id: int = Field(gt=0)
    vote: Literal["agree", "disagree"]
    comment: str | None = Field(default=None, max_length=500)


class ValidationPublic(BaseModel):
    id: int
    report_id: int
    vote: str
    comment: str | None
    created_at: datetime


class RiskPrediction(BaseModel):
    latitude: float
    longitude: float
    risk_score: float
    risk_level: str
    nearby_reports: int
    explanation: str


class ResearchPublicationCreate(BaseModel):
    title: str = Field(min_length=4, max_length=200)
    abstract: str = Field(min_length=20, max_length=1000)
    content: str = Field(min_length=30, max_length=20000)
    location: str | None = Field(default=None, max_length=160)
    tags: list[str] = Field(default_factory=list, max_length=12)
    file_url: str | None = Field(
        default=None,
        max_length=300,
        pattern=r"^/research/files/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$",
    )
    link: HttpUrl | None = None
    research_date: date

    @field_validator("title", "abstract", "content")
    @classmethod
    def trim_required_text(cls, value: str, info: ValidationInfo) -> str:
        normalized = value.strip()
        minimums = {"title": 4, "abstract": 20, "content": 30}
        if len(normalized) < minimums[info.field_name or "title"]:
            raise ValueError(f"{info.field_name} must contain at least {minimums[info.field_name or 'title']} non-space characters.")
        return normalized

    @field_validator("location")
    @classmethod
    def trim_location(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None

    @field_validator("tags")
    @classmethod
    def clean_tags(cls, tags: list[str]) -> list[str]:
        normalized = list(dict.fromkeys(tag.strip()[:40] for tag in tags if tag.strip()))
        if len(normalized) > 12:
            raise ValueError("Provide no more than 12 tags.")
        return normalized

class ResearchPublicationPublic(BaseModel):
    id: int
    user_id: int
    author_name: str
    title: str
    abstract: str
    content: str
    location: str | None
    tags: list[str]
    file_url: str | None
    link: str | None
    research_date: date
    created_at: datetime


class CollaborationRequestCreate(BaseModel):
    recipient: EmailStr | None = None
    subject: str = Field(min_length=4, max_length=160)
    message: str = Field(min_length=20, max_length=3000)

    @field_validator("subject", "message")
    @classmethod
    def trim_collaboration_text(cls, value: str, info: ValidationInfo) -> str:
        normalized = value.strip()
        minimum = 4 if info.field_name == "subject" else 20
        if len(normalized) < minimum:
            raise ValueError(f"{info.field_name} must contain at least {minimum} non-space characters.")
        return normalized


class CollaborationRequestPublic(BaseModel):
    id: int
    user_id: int
    recipient: EmailStr | None
    subject: str
    message: str
    created_at: datetime
