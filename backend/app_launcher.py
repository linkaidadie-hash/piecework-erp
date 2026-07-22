import os
import secrets
import sys
import threading
import webbrowser
from pathlib import Path

import uvicorn


def configure_environment() -> None:
    data_root = Path(os.getenv("LOCALAPPDATA", Path.home())) / "PieceworkERP"
    data_root.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("DATABASE_URL", f"sqlite:///{(data_root / 'piecework.db').as_posix()}")
    os.environ.setdefault("LICENSE_FILE", str(data_root / "license.dat"))

    # P0 2026-07-23: SECRET_KEY 不能再硬编码 fallback
    # 缺 SECRET_KEY 时, 本地 dev 用 secrets.token_urlsafe 生成 (仅本进程有效, 重启后失效)
    # 生产部署必须通过 .env 或环境变量显式提供
    if not os.environ.get("SECRET_KEY"):
        is_dev = "--reload" in sys.argv or os.environ.get("PIECEWORK_DEV") == "1"
        if is_dev:
            os.environ["SECRET_KEY"] = secrets.token_urlsafe(48)
            print("[dev] SECRET_KEY 未设置, 已生成临时 dev key (重启失效, 不能用于生产)", file=sys.stderr)
        else:
            print("[FATAL] SECRET_KEY 未设置. 生产部署必须通过 .env 或环境变量提供.", file=sys.stderr)
            print("        dev 环境可用 PIECEWORK_DEV=1 启动以自动生成临时 key.", file=sys.stderr)
            sys.exit(2)
    os.environ.setdefault("CORS_ORIGINS", "http://127.0.0.1:8000,http://localhost:8000")


def open_browser() -> None:
    webbrowser.open("http://127.0.0.1:8000")


def main() -> None:
    configure_environment()
    from app.main import app

    threading.Timer(1.5, open_browser).start()
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")


if __name__ == "__main__":
    main()
