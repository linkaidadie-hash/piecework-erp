import os
import threading
import webbrowser
from pathlib import Path

import uvicorn


def configure_environment() -> None:
    data_root = Path(os.getenv("LOCALAPPDATA", Path.home())) / "PieceworkERP"
    data_root.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("DATABASE_URL", f"sqlite:///{(data_root / 'piecework.db').as_posix()}")
    os.environ.setdefault("LICENSE_FILE", str(data_root / "license.dat"))
    os.environ.setdefault("SECRET_KEY", "piecework-erp-local-installer-secret")
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
