"""
api/v1/refinanciaciones.py
Router de Refinanciaciones.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.db.models.usuario import Usuario
from app.schemas.refinanciacion import (
    RefinanciacionCreate,
    RefinanciacionElegibleRead,
    RefinanciacionRead,
    RefinanciacionUpdate,
    OportunidadEstadoUpdate,
)
from app.services import refinanciacion_service

router = APIRouter(prefix="/refinanciaciones", tags=["Refinanciaciones"])


@router.post("/", response_model=RefinanciacionRead, status_code=201)
def crear_refinanciacion(
    data: RefinanciacionCreate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return refinanciacion_service.crear_refinanciacion(db, data, usuario_actual)


@router.get("/", response_model=list[RefinanciacionRead])
def listar_refinanciaciones(
    credito_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    return refinanciacion_service.listar_refinanciaciones(db, credito_id, usuario)


@router.get("/elegibles/", response_model=list[RefinanciacionElegibleRead])
def listar_creditos_elegibles(
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    return refinanciacion_service.listar_creditos_elegibles(db, usuario)


@router.patch("/oportunidades/{oportunidad_id}/estado")
def cambiar_estado_oportunidad(oportunidad_id: int, data: OportunidadEstadoUpdate, db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)):
    return refinanciacion_service.cambiar_estado_oportunidad(db, oportunidad_id, data, usuario)


@router.get("/{refinanciacion_id}", response_model=RefinanciacionRead)
def obtener_refinanciacion(
    refinanciacion_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    return refinanciacion_service.obtener_refinanciacion(db, refinanciacion_id, usuario)


@router.patch("/{refinanciacion_id}", response_model=RefinanciacionRead)
def actualizar_refinanciacion(
    refinanciacion_id: int,
    data: RefinanciacionUpdate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return refinanciacion_service.actualizar_refinanciacion(
        db, refinanciacion_id, data, usuario_actual
    )
