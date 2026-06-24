from sqlalchemy.orm import Session
from sqlalchemy import select, desc
from app.db.models.pensionado import Pensionado
from app.schemas.pensionado import PensionadoCreate, PensionadoUpdate
from typing import Optional

class PensionadoRepository:

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, pensionado_id: int, oficina_id: int | None = None) -> Optional[Pensionado]:
        stmt = select(Pensionado).where(Pensionado.id == pensionado_id)
        if oficina_id is not None:
            stmt = stmt.where(Pensionado.oficina_id == oficina_id)
        return self.db.execute(stmt).scalar_one_or_none()

    def get_by_documento(self, documento: str) -> Optional[Pensionado]:
        stmt = select(Pensionado).where(Pensionado.documento == documento)
        return self.db.execute(stmt).scalar_one_or_none()

    def get_all(
        self, skip: int = 0, limit: int = 100, solo_activos: bool = False, oficina_id: int | None = None
    ) -> list[Pensionado]:
        stmt = (
            select(Pensionado)
            .order_by(desc(Pensionado.is_active), Pensionado.id.desc())
            .offset(skip)
            .limit(limit)
        )
        if solo_activos:
            stmt = stmt.where(Pensionado.is_active == True)
        if oficina_id is not None:
            stmt = stmt.where(Pensionado.oficina_id == oficina_id)
        return list(self.db.execute(stmt).scalars().all())

    def create(self, data: PensionadoCreate, oficina_id: int, usuario_id: int) -> Pensionado:
        pensionado = Pensionado(**data.model_dump(), oficina_id=oficina_id, created_by=usuario_id)
        self.db.add(pensionado)
        self.db.commit()
        self.db.refresh(pensionado)
        return pensionado

    def update(self, pensionado: Pensionado, data: PensionadoUpdate) -> Pensionado:
        cambios = data.model_dump(exclude_unset=True)  # solo campos enviados
        for campo, valor in cambios.items():
            setattr(pensionado, campo, valor)
        self.db.commit()
        self.db.refresh(pensionado)
        return pensionado

    def soft_delete(self, pensionado: Pensionado) -> Pensionado:
        pensionado.is_active = False
        self.db.commit()
        return pensionado
