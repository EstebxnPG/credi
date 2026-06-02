from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.db.models.usuario import Usuario
from app.schemas.pendiente_credito import (
    PendienteCreditoCreate,
    PendienteCreditoRead,
    PendienteCreditoResolve,
    PendienteCreditoUpdate,
)
from app.services import pendiente_credito_service


router = APIRouter(prefix="/pendientes-credito", tags=["Pendientes de credito"])


@router.post("/", response_model=PendienteCreditoRead, status_code=201)
def crear_pendiente(
    data: PendienteCreditoCreate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return pendiente_credito_service.crear_pendiente(db, data, usuario_actual)


@router.get("/", response_model=list[PendienteCreditoRead])
def listar_pendientes(
    credito_id: Optional[int] = Query(None),
    estado: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return pendiente_credito_service.listar_pendientes(db, credito_id, estado)


@router.patch("/{pendiente_id}", response_model=PendienteCreditoRead)
def actualizar_pendiente(
    pendiente_id: int,
    data: PendienteCreditoUpdate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return pendiente_credito_service.actualizar_pendiente(
        db, pendiente_id, data, usuario_actual
    )


@router.patch("/{pendiente_id}/resolver", response_model=PendienteCreditoRead)
def resolver_pendiente(
    pendiente_id: int,
    data: PendienteCreditoResolve,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return pendiente_credito_service.resolver_pendiente(
        db, pendiente_id, data, usuario_actual
    )
