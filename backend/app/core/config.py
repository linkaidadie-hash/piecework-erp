from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "中小企业生产系统"
    database_url: str = "sqlite:///./dev.db"
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 60 * 12
    default_domain: str = "erp.hanshuniu.top"
    license_file: str = "license.dat"
    license_public_key: str = """-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA5TK2h59mGvvYb+S8+PzRfRMTSi3Y70tHhXrVedOlVxQ=
-----END PUBLIC KEY-----"""

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
