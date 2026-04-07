"""
oficina_service.py
Toda la lógica de negocio de Oficinas vive aquí.
Los routers solo llaman funciones de este módulo.
"""
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.db.models.oficina import Oficina
from app.schemas.oficina import OficinaCreate, OficinaUpdate


# ─── Helpers internos ────────────────────────────────────────────────────────

def _get_or_404(db: Session, oficina_id: int) -> Oficina:
    """Busca una oficina o lanza 404. Reutilizable en el módulo."""
    oficina = db.query(Oficina).filter(Oficina.id == oficina_id).first()
    if not oficina:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Oficina con id {oficina_id} no encontrada",
        )
    return oficina


def _nombre_duplicado(db: Session, nombre: str, exclude_id: int | None = None) -> bool:
    """Valida que no exista otra oficina con el mismo nombre (case-insensitive)."""
    query = db.query(Oficina).filter(Oficina.nombre.ilike(nombre.strip()))
    if exclude_id:
        query = query.filter(Oficina.id != exclude_id)
    return query.first() is not None


# ─── CRUD ────────────────────────────────────────────────────────────────────

def crear_oficina(db: Session, data: OficinaCreate) -> Oficina:
    if _nombre_duplicado(db, data.nombre):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe una oficina con el nombre '{data.nombre}'",
        )
    oficina = Oficina(**data.model_dump())
    db.add(oficina)
    db.commit()
    db.refresh(oficina)
    return oficina


def listar_oficinas(db: Session, solo_activas: bool = True) -> list[Oficina]:
    query = db.query(Oficina)
    if solo_activas:
        query = query.filter(Oficina.is_active == True)  # noqa: E712
    return query.order_by(Oficina.nombre).all()


def obtener_oficina(db: Session, oficina_id: int) -> Oficina:
    return _get_or_404(db, oficina_id)


def actualizar_oficina(db: Session, oficina_id: int, data: OficinaUpdate) -> Oficina:
    oficina = _get_or_404(db, oficina_id)

    # Solo actualiza los campos que llegaron (exclude_unset)
    cambios = data.model_dump(exclude_unset=True)

    if "nombre" in cambios and _nombre_duplicado(db, cambios["nombre"], exclude_id=oficina_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe otra oficina con el nombre '{cambios['nombre']}'",
        )

    for campo, valor in cambios.items():
        setattr(oficina, campo, valor)

    db.commit()
    db.refresh(oficina)
    return oficina


def desactivar_oficina(db: Session, oficina_id: int) -> Oficina:
    """Soft delete: is_active = False. Nunca eliminación física."""
    oficina = _get_or_404(db, oficina_id)
    if not oficina.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La oficina ya está desactivada",
        )
    oficina.is_active = False
    db.commit()
    db.refresh(oficina)
    return oficina
