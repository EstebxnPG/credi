"""
api/v1/oficinas.py
Router de Oficinas — sin lógica, solo delega al servicio.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_current_user, solo_admin
from app.db.models.usuario import Usuario
from app.schemas.oficina import OficinaCreate, OficinaUpdate, OficinaRead
from app.services import oficina_service

router = APIRouter(prefix="/oficinas", tags=["Oficinas"])


@router.post("/", response_model=OficinaRead, status_code=201)
def crear_oficina(
    data: OficinaCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(solo_admin),          # solo admin puede crear
):
    return oficina_service.crear_oficina(db, data)


@router.get("/", response_model=list[OficinaRead])
def listar_oficinas(
    solo_activas: bool = Query(True, description="Filtrar solo oficinas activas"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),    # cualquier usuario autenticado
):
    return oficina_service.listar_oficinas(db, solo_activas)


@router.get("/{oficina_id}", response_model=OficinaRead)
def obtener_oficina(
    oficina_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return oficina_service.obtener_oficina(db, oficina_id)


@router.patch("/{oficina_id}", response_model=OficinaRead)
def actualizar_oficina(
    oficina_id: int,
    data: OficinaUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(solo_admin),
):
    return oficina_service.actualizar_oficina(db, oficina_id, data)


@router.delete("/{oficina_id}", response_model=OficinaRead)
def desactivar_oficina(
    oficina_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(solo_admin),
):
    """Soft delete: marca is_active=False. No elimina el registro."""
    return oficina_service.desactivar_oficina(db, oficina_id)
