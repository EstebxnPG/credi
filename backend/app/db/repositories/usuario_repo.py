from sqlalchemy.orm import Session
from sqlalchemy import func, select
from app.db.models.usuario import Usuario
from app.schemas.usuario import UsuarioCreate, UsuarioUpdate
from typing import Optional

class UsuarioRepository:

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, usuario_id: int) -> Optional[Usuario]:
        stmt = select(Usuario).where(
            Usuario.id == usuario_id,
            Usuario.is_active == True
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def get_by_correo(self, correo: str) -> Optional[Usuario]:
        stmt = select(Usuario).where(Usuario.correo == correo)
        return self.db.execute(stmt).scalar_one_or_none()

    def get_by_documento(self, documento: str) -> Optional[Usuario]:
        stmt = select(Usuario).where(Usuario.documento == documento)
        return self.db.execute(stmt).scalar_one_or_none()

    def get_all(self, skip: int = 0, limit: int = 100) -> list[Usuario]:
        stmt = (
            select(Usuario)
            .where(Usuario.is_active == True)
            .offset(skip).limit(limit)
        )
        return list(self.db.execute(stmt).scalars().all())

    def count_all(self) -> int:
        stmt = select(func.count()).select_from(Usuario).where(Usuario.is_active == True)
        return int(self.db.execute(stmt).scalar_one())

    def create(self, data: dict) -> Usuario:
        # data ya viene con contrasena hasheada desde el servicio
        usuario = Usuario(**data)
        self.db.add(usuario)
        self.db.commit()
        self.db.refresh(usuario)
        return usuario

    def update(self, usuario: Usuario, data: UsuarioUpdate) -> Usuario:
        cambios = data.model_dump(exclude_unset=True)
        for campo, valor in cambios.items():
            setattr(usuario, campo, valor)
        self.db.commit()
        self.db.refresh(usuario)
        return usuario

    def incrementar_intentos(self, usuario: Usuario) -> None:
        usuario.intentos_fallidos += 1
        self.db.commit()

    def resetear_intentos(self, usuario: Usuario) -> None:
        usuario.intentos_fallidos = 0
        self.db.commit()

    def desbloquear(self, usuario: Usuario) -> Usuario:
        usuario.intentos_fallidos = 0
        self.db.commit()
        self.db.refresh(usuario)
        return usuario

    def soft_delete(self, usuario: Usuario) -> Usuario:
        usuario.is_active = False
        self.db.commit()
        return usuario
