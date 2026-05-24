from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "计件生产管理系统"
    database_url: str = "sqlite:///./dev.db"
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 60 * 12
    default_domain: str = "erp.hanshuniu.top"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
