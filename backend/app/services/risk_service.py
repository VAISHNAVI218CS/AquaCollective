from collections.abc import Iterable

from app.models import Report, Validation


def observation_risk(report: Report) -> float:
    signals = {
        "color": {"Clear": 0.0, "Yellow": 0.45, "Brown": 0.75, "Green": 0.8, "Other": 0.35},
        "smell": {"None": 0.0, "Chemical": 1.0, "Sewage": 0.95, "Fishy": 0.55, "Other": 0.4},
        "taste": {"Not tested": 0.0, "Normal": 0.0, "Metallic": 0.75, "Bitter": 0.65, "Salty": 0.55, "Other": 0.35},
        "turbidity": {"Clear": 0.0, "Slightly cloudy": 0.35, "Very cloudy": 0.8},
    }
    values = [
        signals["color"].get(report.color, 0.35),
        signals["smell"].get(report.smell, 0.35),
        signals["taste"].get(report.taste, 0.0),
        signals["turbidity"].get(report.turbidity, 0.35),
    ]
    return round(sum(values) / len(values), 3)


def risk_level(score: float) -> str:
    if score >= 0.7:
        return "high"
    if score >= 0.35:
        return "medium"
    return "low"


def update_trust(report: Report, validations: Iterable[Validation]) -> None:
    votes = list(validations)
    if not votes:
        report.trust_score = 0.5
        report.status = "pending"
        return
    agrees = sum(vote.vote == "agree" for vote in votes)
    report.trust_score = round((agrees + 1) / (len(votes) + 2), 3)
    if len(votes) >= 3 and report.trust_score >= 0.75:
        report.status = "validated"
    elif len(votes) >= 3 and report.trust_score <= 0.25:
        report.status = "rejected"
    else:
        report.status = "pending"
