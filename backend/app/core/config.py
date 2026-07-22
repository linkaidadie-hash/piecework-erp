from pydantic_settings import BaseSettings


# 当前受信任的公钥 (kid -> PEM)
# 维护规则 (user 2026-07-23 P0):
#   - 旧 keypair ed25519-2026-05-20 已从仓库移除 (私钥公开泄露, 公钥一并作废)
#   - 新 keypair ed25519-2026-07-23 已生成, 私钥只在 vault
#   - 这里只列公钥; 添加新 keypair 时只追加新行, 旧 kid 必须保留到所有 license 迁移完毕
TRUSTED_LICENSE_KEYS: dict[str, str] = {
    # kid ed25519-2026-07-23 — 新 keypair, sha256(public_key_DER)=f45286dead8d5ef177dec4847f9c280be221bd4dc7b0c381e9c1a40a93f58235
    "ed25519-2026-07-23": """-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEASKvWuHNASJ7xRYs5CUBc1QE4UdcxKpS4Kd2rhtuFV3I=
-----END PUBLIC KEY-----""",
    # 旧 kid 已删除 (P0 安全事件 2026-07-23: 私钥曾公开泄露, 公钥一并作废, 任何旧 license 视作无效)
}


class Settings(BaseSettings):
    app_name: str = "中小企业生产系统"
    database_url: str = "sqlite:///./dev.db"
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 60 * 12
    default_domain: str = "erp.hanshuniu.top"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    license_file: str = "license.dat"
    # 兼容字段: 留作 license 文件无 kid 时的兜底, 但建议 license 带 kid 并从 TRUSTED_LICENSE_KEYS 取
    license_public_key: str = TRUSTED_LICENSE_KEYS["ed25519-2026-07-23"]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
