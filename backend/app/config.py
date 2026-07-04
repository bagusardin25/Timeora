from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/timeora"
    SUPABASE_DB_PASSWORD: str = ""
    SUPABASE_DB_REGION: str = ""

    SUPABASE_URL: str = ""
    SUPABASE_JWT_SECRET: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    OPENROUTE_API_KEY: str = ""
    OPENROUTER_MODEL: str = "google/gemma-4-31b-it:free"
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"

    INTEGRATION_ENCRYPTION_KEY: str = ""
    INTEGRATION_SIGNING_KEY: str = ""
    INTEGRATION_DEFAULT_TIMEZONE: str = "Asia/Jakarta"
    INTEGRATION_ALLOW_HTTP_WEBHOOKS: bool = False
    INTEGRATION_WEBHOOK_MAX_PER_USER: int = 10
    INTEGRATION_WEBHOOK_TIMEOUT_SECONDS: float = 10.0
    INTEGRATION_RESEND_API_KEY: str = ""
    INTEGRATION_RESEND_FROM_EMAIL: str = ""
    INTEGRATION_EMAIL_NOTIFICATIONS_ENABLED: bool = False

    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"


settings = Settings()


def cors_origins() -> list[str]:
    return [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
