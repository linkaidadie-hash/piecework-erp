import base64
import hashlib
import json
import os
import platform
import re
import socket
import subprocess
import uuid
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization

from app.core.config import settings


VENDOR_ID = "yinmi"
PRODUCT_ID = "sme-production-system"
PRODUCT_NAME = "中小企业生产系统"
SIGNED_FIELDS = (
    "vendorId",
    "productId",
    "productName",
    "customerName",
    "licenseCode",
    "machineId",
    "edition",
    "expireAt",
    "maxUsers",
    "issuedAt",
)
MIN_FEATURE_MATCHES = 3


def _run(command: list[str]) -> str:
    try:
        startupinfo = None
        creationflags = 0
        if platform.system().lower() == "windows":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            creationflags = subprocess.CREATE_NO_WINDOW
        return subprocess.check_output(
            command,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=3,
            startupinfo=startupinfo,
            creationflags=creationflags,
        ).strip()
    except Exception:
        return ""


def _clean(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip().lower()


def _feature_hash(name: str, value: str) -> str | None:
    value = _clean(value)
    if not value or value in {"none", "unknown", "to be filled by o.e.m.", "default string"}:
        return None
    return hashlib.sha256(f"{name}:{value}".encode("utf-8")).hexdigest()


def _windows_features() -> dict[str, str]:
    return {
        "board": _run(["wmic", "baseboard", "get", "serialnumber", "/value"]),
        "cpu": _run(["wmic", "cpu", "get", "processorid", "/value"]),
        "disk": _run(["wmic", "diskdrive", "get", "serialnumber", "/value"]),
        "uuid": _run(["wmic", "csproduct", "get", "uuid", "/value"]),
        "mac": ":".join(re.findall("..", f"{uuid.getnode():012x}")),
    }


def _linux_features() -> dict[str, str]:
    machine_id = ""
    for path in ("/etc/machine-id", "/var/lib/dbus/machine-id"):
        if os.path.exists(path):
            machine_id = Path(path).read_text(encoding="utf-8", errors="ignore")
            break
    return {
        "board": _run(["cat", "/sys/class/dmi/id/board_serial"]),
        "cpu": _run(["sh", "-c", "grep -m1 'Serial\\|model name' /proc/cpuinfo"]),
        "disk": _run(["sh", "-c", "lsblk -ndo SERIAL 2>/dev/null | head -n1"]),
        "uuid": machine_id or socket.gethostname(),
        "mac": ":".join(re.findall("..", f"{uuid.getnode():012x}")),
    }


@lru_cache(maxsize=1)
def hardware_feature_hashes() -> tuple[str, ...]:
    raw = _windows_features() if platform.system().lower() == "windows" else _linux_features()
    hashes = [_feature_hash(name, value) for name, value in raw.items()]
    return tuple(sorted(x for x in hashes if x))


def current_machine_id() -> str:
    payload = {"v": 1, "features": hardware_feature_hashes()}
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return "MID-v1." + base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_machine_id(machine_id: str) -> list[str]:
    if not machine_id.startswith("MID-v1."):
        return []
    encoded = machine_id.split(".", 1)[1]
    encoded += "=" * (-len(encoded) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(encoded.encode("ascii")).decode("utf-8"))
    except Exception:
        return []
    features = payload.get("features")
    return sorted(x for x in features if isinstance(x, str)) if isinstance(features, list) else []


def canonical_license_payload(license_data: dict[str, Any]) -> bytes:
    payload = {field: license_data.get(field) for field in SIGNED_FIELDS}
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")


def verify_license_data(license_data: dict[str, Any]) -> tuple[bool, str]:
    license_data.setdefault("vendorId", VENDOR_ID)
    license_data.setdefault("productId", PRODUCT_ID)
    license_data.setdefault("productName", PRODUCT_NAME)
    signature = license_data.get("signature")
    if not isinstance(signature, str):
        return False, "授权文件缺少签名"
    try:
        public_key = serialization.load_pem_public_key(settings.license_public_key.encode("utf-8"))
        public_key.verify(base64.b64decode(signature), canonical_license_payload(license_data))
    except (InvalidSignature, ValueError):
        return False, "授权文件签名无效"
    except Exception:
        return False, "授权公钥配置错误"

    if license_data.get("vendorId") != VENDOR_ID or license_data.get("productId") != PRODUCT_ID:
        return False, "授权文件不属于当前软件，请确认产品类型是否正确"

    expire_at = license_data.get("expireAt")
    try:
        if expire_at and date.fromisoformat(expire_at) < date.today():
            return False, "授权已到期"
    except ValueError:
        return False, "授权到期日期无效"

    licensed_machine = str(license_data.get("machineId") or "")
    current_machine = current_machine_id()
    licensed_features = _decode_machine_id(licensed_machine)
    current_features = _decode_machine_id(current_machine)
    if licensed_features and current_features:
        matches = len(set(licensed_features) & set(current_features))
        enough_features = len(licensed_features) >= MIN_FEATURE_MATCHES and len(current_features) >= MIN_FEATURE_MATCHES
        if enough_features and matches < MIN_FEATURE_MATCHES:
            return False, "授权文件不属于本机"
        if not enough_features and licensed_machine != current_machine:
            return False, "授权文件不属于本机"
    elif licensed_machine != current_machine:
        return False, "授权文件不属于本机"
    return True, "授权有效"


def read_license() -> dict[str, Any] | None:
    path = Path(settings.license_file)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def write_license(license_data: dict[str, Any]) -> None:
    Path(settings.license_file).write_text(json.dumps(license_data, ensure_ascii=False, indent=2), encoding="utf-8")


def license_status() -> dict[str, Any]:
    machine_id = current_machine_id()
    try:
        license_data = read_license()
    except Exception:
        return {"machineId": machine_id, "valid": False, "message": "授权文件格式错误", "license": None}
    if not license_data:
        return {"machineId": machine_id, "valid": False, "message": "未导入授权文件", "license": None}
    valid, message = verify_license_data(license_data)
    public_license = {key: license_data.get(key) for key in SIGNED_FIELDS}
    return {"machineId": machine_id, "valid": valid, "message": message, "license": public_license}


def require_valid_license() -> None:
    status = license_status()
    if not status["valid"]:
        from fastapi import HTTPException

        raise HTTPException(status_code=403, detail=status["message"])
