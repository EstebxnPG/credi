from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.db.models.usuario import Usuario
from app.schemas.seguimiento import SeguimientoCreate, SeguimientoRead
from app.services import seguimiento_service

router = APIRouter(prefix="/seguimientos", tags=["Seguimientos"])


@router.post("/", response_model=SeguimientoRead, status_code=201)
def crear_seguimiento(
    data: SeguimientoCreate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return seguimiento_service.crear_seguimiento(db, data, usuario_actual)


@router.get("/", response_model=list[SeguimientoRead])
def listar_seguimientos(
    pensionado_id: int | None = Query(None),
    oficina_id: int | None = Query(None),
    usuario_id: int | None = Query(None),
    solo_pendientes: bool = Query(False),
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return seguimiento_service.listar_seguimientos(
        db=db,
        usuario_actual=usuario_actual,
        pensionado_id=pensionado_id,
        oficina_id=oficina_id,
        usuario_id=usuario_id,
        solo_pendientes=solo_pendientes,
    )


@router.get("/{seguimiento_id}", response_model=SeguimientoRead)
def obtener_seguimiento(
    seguimiento_id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return seguimiento_service.obtener_seguimiento(db, seguimiento_id, usuario_actual)
