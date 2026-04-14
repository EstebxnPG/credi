"""
pagaduria_service.py
Toda la lógica de negocio de Pagadurías vive aquí.
Los routers solo llaman funciones de este módulo.
"""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models.pagaduria import Pagaduria
from app.schemas.pagaduria import PagaduriaCreate, PagaduriaUpdate


def _get_or_404(db: Session, pagaduria_id: int) -> Pagaduria:
    """Busca una pagaduría o lanza 404. Reutilizable en el módulo."""
    pagaduria = db.query(Pagaduria).filter(Pagaduria.id == pagaduria_id).first()
    if not pagaduria:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pagaduría con id {pagaduria_id} no encontrada",
        )
    return pagaduria


def _nombre_duplicado(db: Session, nombre: str, exclude_id: int | None = None) -> bool:
    """Valida que no exista otra pagaduría con el mismo nombre (case-insensitive)."""
    query = db.query(Pagaduria).filter(Pagaduria.nombre.ilike(nombre.strip()))
    if exclude_id:
        query = query.filter(Pagaduria.id != exclude_id)
    return query.first() is not None


def crear_pagaduria(db: Session, data: PagaduriaCreate) -> Pagaduria:
    if _nombre_duplicado(db, data.nombre):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe una pagaduría con el nombre '{data.nombre}'",
        )
    pagaduria = Pagaduria(**data.model_dump())
    db.add(pagaduria)
    db.commit()
    db.refresh(pagaduria)
    return pagaduria


def listar_pagadurias(db: Session, solo_activas: bool = True) -> list[Pagaduria]:
    query = db.query(Pagaduria)
    if solo_activas:
        query = query.filter(Pagaduria.is_active == True)  # noqa: E712
    return query.order_by(Pagaduria.nombre).all()


def obtener_pagaduria(db: Session, pagaduria_id: int) -> Pagaduria:
    return _get_or_404(db, pagaduria_id)


def actualizar_pagaduria(
    db: Session, pagaduria_id: int, data: PagaduriaUpdate
) -> Pagaduria:
    pagaduria = _get_or_404(db, pagaduria_id)
    cambios = data.model_dump(exclude_unset=True)

    if "nombre" in cambios and _nombre_duplicado(
        db, cambios["nombre"], exclude_id=pagaduria_id
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe otra pagaduría con el nombre '{cambios['nombre']}'",
        )

    for campo, valor in cambios.items():
        setattr(pagaduria, campo, valor)

    db.commit()
    db.refresh(pagaduria)
    return pagaduria


def desactivar_pagaduria(db: Session, pagaduria_id: int) -> Pagaduria:
    """Soft delete: is_active = False. Nunca eliminación física."""
    pagaduria = _get_or_404(db, pagaduria_id)
    if not pagaduria.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La pagaduría ya está desactivada",
        )
    pagaduria.is_active = False
    db.commit()
    db.refresh(pagaduria)
    return pagaduria
