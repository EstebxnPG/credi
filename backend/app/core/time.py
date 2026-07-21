from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo


BUSINESS_TIMEZONE = ZoneInfo("America/Bogota")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_business() -> datetime:
    return datetime.now(BUSINESS_TIMEZONE)


def today_business() -> date:
    return now_business().date()


def business_date(value: datetime) -> date:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(BUSINESS_TIMEZONE).date()
