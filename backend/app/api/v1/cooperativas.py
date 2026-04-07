"""
api/v1/cooperativas.py
Router de Cooperativas — sin lógica, solo delega al servicio.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_current_user, solo_admin
from app.db.models.usuario import Usuario
from app.schemas.cooperativa import CooperativaCreate, CooperativaUpdate, CooperativaRead
from app.services import cooperativa_service

router = APIRouter(prefix="/cooperativas", tags=["Cooperativas"])


@router.post("/", response_model=CooperativaRead, status_code=201)
def crear_cooperativa(
    data: CooperativaCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(solo_admin),
):
    return cooperativa_service.crear_cooperativa(db, data)


@router.get("/", response_model=list[CooperativaRead])
def listar_cooperativas(
    solo_activas: bool = Query(True, description="Filtrar solo cooperativas activas"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return cooperativa_service.listar_cooperativas(db, solo_activas)


@router.get("/{cooperativa_id}", response_model=CooperativaRead)
def obtener_cooperativa(
    cooperativa_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return cooperativa_service.obtener_cooperativa(db, cooperativa_id)


@router.patch("/{cooperativa_id}", response_model=CooperativaRead)
def actualizar_cooperativa(
    cooperativa_id: int,
    data: CooperativaUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(solo_admin),
):
    return cooperativa_service.actualizar_cooperativa(db, cooperativa_id, data)


@router.delete("/{cooperativa_id}", response_model=CooperativaRead)
def desactivar_cooperativa(
    cooperativa_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(solo_admin),
):
    """Soft delete. Los créditos existentes con esta cooperativa NO se ven afectados."""
    return cooperativa_service.desactivar_cooperativa(db, cooperativa_id)