"""
api/v1/creditos.py
Router de Créditos — sin lógica, solo delega al servicio.
"""
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date

from app.core.dependencies import get_db, get_current_user, solo_admin
from app.db.models.usuario import Usuario
from app.schemas.credito import (
    CreditoCambioEstado,
    CreditoCreate,
    CreditoObservacionesUpdate,
    CreditoRead,
    CreditoUpdate,
)
from app.schemas.historial_credito import HistorialCreditoRead
from app.services import credito_service

router = APIRouter(prefix="/creditos", tags=["Créditos"])


@router.post("/", response_model=CreditoRead, status_code=201)
def crear_credito(
    data: CreditoCreate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),  # asesora o admin
):
    return credito_service.crear_credito(db, data, usuario_actual)


@router.get("/", response_model=list[CreditoRead])
def listar_creditos(
    pensionado_id: Optional[int] = Query(None),
    asesor_id: Optional[int] = Query(None),
    oficina_id: Optional[int] = Query(None),
    estado: Optional[str] = Query(None),
    tipo_credito: Optional[str] = Query(None),
    refinanciacion: Optional[str] = Query(None),
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    texto: Optional[str] = Query(None),
    orden_registro: str = Query("desc", pattern="^(asc|desc)$"),
    skip: int = Query(0, ge=0),
    limit: int = Query(15, ge=1, le=100),
    response: Response = None,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    total = credito_service.contar_creditos(
        db,
        pensionado_id,
        asesor_id,
        oficina_id,
        estado,
        tipo_credito,
        refinanciacion,
        fecha_desde,
        fecha_hasta,
        texto,
        usuario_actual,
    )
    if response is not None:
        response.headers["X-Total-Count"] = str(total)

    return credito_service.listar_creditos(
        db,
        pensionado_id,
        asesor_id,
        oficina_id,
        estado,
        tipo_credito,
        refinanciacion,
        fecha_desde,
        fecha_hasta,
        texto,
        usuario_actual,
        skip,
        limit,
        orden_registro,
    )


@router.get("/{credito_id}/historial", response_model=list[HistorialCreditoRead])
def obtener_historial_credito(
    credito_id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return credito_service.obtener_historial_credito(db, credito_id, usuario_actual)


@router.get("/{credito_id}", response_model=CreditoRead)
def obtener_credito(
    credito_id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return credito_service.obtener_credito(db, credito_id, usuario_actual)


@router.patch("/{credito_id}", response_model=CreditoRead)
def actualizar_credito(
    credito_id: int,
    data: CreditoUpdate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return credito_service.actualizar_credito(db, credito_id, data, usuario_actual)


@router.patch("/{credito_id}/estado", response_model=CreditoRead)
def cambiar_estado(
    credito_id: int,
    data: CreditoCambioEstado,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    """
    Endpoint dedicado para cambiar el estado de un crédito.
    Valida que la transición sea permitida según la máquina de estados.
    """
    return credito_service.cambiar_estado(db, credito_id, data, usuario_actual)


@router.patch("/{credito_id}/observaciones", response_model=CreditoRead)
def actualizar_observaciones(
    credito_id: int,
    data: CreditoObservacionesUpdate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return credito_service.actualizar_observaciones_credito(
        db,
        credito_id,
        data,
        usuario_actual,
    )


@router.delete("/{credito_id}", response_model=CreditoRead)
def desactivar_credito(
    credito_id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(solo_admin),
):
    """Soft delete. Solo administrador."""
    return credito_service.desactivar_credito(db, credito_id, usuario_actual)
