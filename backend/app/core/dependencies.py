from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import JWTError
from app.db.session import get_db
from app.db.models.usuario import Usuario
from app.core.security import decode_token
from sqlalchemy import select

bearer_scheme = HTTPBearer()

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db)
) -> Usuario:
    """
    Esta función se inyecta en cualquier endpoint que requiera autenticación.
    FastAPI la ejecuta automáticamente antes de llegar al endpoint.
    """
    token = credentials.credentials
    try:
        payload = decode_token(token)
        usuario_id: str = payload.get("sub")
        if not usuario_id:
            raise HTTPException(status_code=401, detail="Token inválido")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

    stmt = select(Usuario).where(
        Usuario.id == int(usuario_id),
        Usuario.is_active == True
    )
    usuario = db.execute(stmt).scalar_one_or_none()
    if not usuario:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")

    return usuario

def solo_admin(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    """Dependencia que además exige rol administrador"""
    if current_user.rol != "administrador":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo administradores pueden realizar esta acción"
        )
    return current_user