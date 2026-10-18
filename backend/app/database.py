from collections.abc import Generator

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
    if "reports" not in inspect(engine).get_table_names():
        return

    existing_columns = {column["name"] for column in inspect(engine).get_columns("reports")}
    migrations = {
        "algae": "VARCHAR(20) NOT NULL DEFAULT 'None'",
        "insects": "VARCHAR(20) NOT NULL DEFAULT 'None'",
        "source_type": "VARCHAR(40) NOT NULL DEFAULT 'Tap'",
        "other_source": "VARCHAR(120)",
    }
    with engine.begin() as connection:
        for column, definition in migrations.items():
            if column not in existing_columns:
                connection.execute(text(f"ALTER TABLE reports ADD COLUMN {column} {definition}"))


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
