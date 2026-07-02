import re
from urllib.parse import quote, unquote, urlparse

from app.config import settings

_POOLER_REGIONS = (
    "ap-southeast-1",
    "us-east-1",
    "eu-west-1",
    "ap-northeast-1",
)


def _project_ref_from_supabase_url() -> str | None:
    supabase_url = settings.SUPABASE_URL.strip().rstrip("/")
    if not supabase_url:
        return None
    match = re.search(r"https?://([^.]+)\.supabase\.co", supabase_url)
    return match.group(1) if match else None


def _normalize_scheme(dsn: str) -> str:
    if dsn.startswith("postgres://"):
        return "postgresql://" + dsn[len("postgres://") :]
    return dsn


def _pooler_dsn(password: str, project_ref: str, host: str, port: int) -> str:
    encoded_password = quote(unquote(password), safe="")
    return (
        f"postgresql://postgres.{project_ref}:{encoded_password}@{host}:{port}/postgres"
    )


def _extract_credentials(dsn: str) -> tuple[str | None, str | None]:
    parsed = urlparse(_normalize_scheme(dsn.strip()))
    password = unquote(parsed.password or "") or None
    username = parsed.username or ""

    project_ref = None
    host = parsed.hostname or ""
    db_match = re.match(r"db\.([^.]+)\.supabase\.co$", host)
    if db_match:
        project_ref = db_match.group(1)
    elif username.startswith("postgres."):
        project_ref = username.split(".", 1)[1]

    return project_ref, password


def candidate_database_dsns() -> list[str]:
    candidates: list[str] = []
    raw = settings.DATABASE_URL.strip()

    project_ref = _project_ref_from_supabase_url()
    password = settings.SUPABASE_DB_PASSWORD or None

    if raw and "localhost" not in raw and "127.0.0.1" not in raw:
        candidates.append(_normalize_scheme(raw))
        url_ref, url_password = _extract_credentials(raw)
        project_ref = project_ref or url_ref
        password = password or url_password

    if project_ref and password:
        regions = [settings.SUPABASE_DB_REGION] if settings.SUPABASE_DB_REGION else []
        regions.extend(_POOLER_REGIONS)

        for region in dict.fromkeys(r for r in regions if r):
            hosts = [
                f"aws-0-{region}.pooler.supabase.com",
                f"{project_ref}.pooler.supabase.com",
            ]
            for host in hosts:
                for port in (6543, 5432):
                    candidates.append(_pooler_dsn(password, project_ref, host, port))

    return list(dict.fromkeys(candidates))