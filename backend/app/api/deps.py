from datetime import date

from fastapi import Depends, Header, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.license import require_valid_license
from app.core.security import ALGORITHM
from app.db import get_db
from app.models import Tenant, User


def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    require_valid_license()
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未登录")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录已失效") from exc

    user = db.get(User, int(payload["sub"]))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在")

    tenant = db.get(Tenant, user.tenant_id)
    host = request.headers.get("host", "").split(":")[0]
    client_ip = request.client.host if request.client else ""
    if not tenant or tenant.disabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="企业账号已停用")
    if tenant.expires_at and tenant.expires_at < date.today():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="授权已到期")
    if tenant.bound_domain and host and host not in {"localhost", "127.0.0.1"} and host != tenant.bound_domain:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="域名未授权")
    if tenant.bound_ip and client_ip and client_ip != tenant.bound_ip:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="IP 未授权")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role.value != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")
    return user
