import re
from urllib.parse import quote, unquote, urlparse, urlunparse

from app.config import settings

_POOLER_REGIONS = (
    "ap-southeast-1",
    "us-east-1",
    "eu-west-1",
    "ap-northeast-1",
)


def _project_ref() -> str | None:
    supabase_url = settings.SUPABASE_URL.strip().rstrip("/")
    if not supabase_url:
        return None
    match = re.search(r"https?://([^.]+)\.supabase\.co", supabase_url)
    return match.group(1) if match else None


def _normalize_scheme(dsn: str) -> str:
    if dsn.startswith("postgres://"):
        return "postgresql://" + dsn[len("postgres://") :]
    return dsn


def _pooler_dsn(password: str, project_ref: str, region: str, port: int = 6543) -> str:
    encoded_password = quote(unquote(password), safe="")
    return (
        f"postgresql://postgres.{project_ref}:{encoded_password}"
        f"@aws-0-{region}.pooler.supabase.com:{port}/postgres"
    )


def _parse_direct_supabase(dsn: str) -> tuple[str, str] | None:
    normalized = _normalize_scheme(dsn.strip())
    parsed = urlparse(normalized)
    host = parsed.hostname or ""
    match = re.match(r"db\.([^.]+)\.supabase\.co$", host)
    if not match:
        return None
    password = unquote(parsed.password or "")
    if not password:
        return None
    return match.group(1), password


def candidate_database_dsns() -> list[str]:
    candidates: list[str] = []
    raw = settings.DATABASE_URL.strip()

    if raw and "localhost" not in raw and "127.0.0.1" not in raw:
        candidates.append(_normalize_scheme(raw))

        direct = _parse_direct_supabase(raw)
        if direct:
            project_ref, password = direct
            regions = [settings.SUPABASE_DB_REGION] if settings.SUPABASE_DB_REGION else []
            regions.extend(_POOLER_REGIONS)
            for region in dict.fromkeys(regions):
                if region:
                    candidates.append(_pooler_dsn(password, project_ref, region, 6543))
                    candidates.append(_pooler_dsn(password, project_ref, region, 5432))

    project_ref = _project_ref()
    if project_ref and settings.SUPABASE_DB_PASSWORD:
        regions = [settings.SUPABASE_DB_REGION] if settings.SUPABASE_DB_REGION else []
        regions.extend(_POOLER_REGIONS)
        for region in dict.fromkeys(regions):
            if region:
                candidates.append(
                    _pooler_dsn(settings.SUPABASE_DB_PASSWORD, project_ref, region, 6543)
                )

    return list(dict.fromkeys(candidates))