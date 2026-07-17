from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.db.models.usuario import Usuario
from app.schemas.seguimiento import (
    SeguimientoCreate,
    SeguimientoRead,
    SeguimientoSolucionCreate,
    SeguimientoUpdate,
)
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
    tipo: str | None = Query(None),
    estado: str | None = Query(None),
    fecha_desde: str | None = Query(None),
    fecha_hasta: str | None = Query(None),
    fecha_creacion_desde: str | None = Query(None),
    fecha_creacion_hasta: str | None = Query(None),
    fecha_rapida: str | None = Query(None),
    texto: str | None = Query(None),
    solo_pendientes: bool = Query(False),
    skip: int = Query(0, ge=0),
    limit: int = Query(15, ge=1, le=100),
    response: Response = None,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    total = seguimiento_service.contar_seguimientos(
        db=db,
        usuario_actual=usuario_actual,
        pensionado_id=pensionado_id,
        oficina_id=oficina_id,
        usuario_id=usuario_id,
        tipo=tipo,
        estado=estado,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        fecha_creacion_desde=fecha_creacion_desde,
        fecha_creacion_hasta=fecha_creacion_hasta,
        fecha_rapida=fecha_rapida,
        texto=texto,
        solo_pendientes=solo_pendientes,
    )
    if response is not None:
        response.headers["X-Total-Count"] = str(total)

    return seguimiento_service.listar_seguimientos(
        db=db,
        usuario_actual=usuario_actual,
        pensionado_id=pensionado_id,
        oficina_id=oficina_id,
        usuario_id=usuario_id,
        tipo=tipo,
        estado=estado,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        fecha_creacion_desde=fecha_creacion_desde,
        fecha_creacion_hasta=fecha_creacion_hasta,
        fecha_rapida=fecha_rapida,
        texto=texto,
        solo_pendientes=solo_pendientes,
        skip=skip,
        limit=limit,
    )


@router.get("/{seguimiento_id}", response_model=SeguimientoRead)
def obtener_seguimiento(
    seguimiento_id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return seguimiento_service.obtener_seguimiento(db, seguimiento_id, usuario_actual)


@router.patch("/{seguimiento_id}", response_model=SeguimientoRead)
def actualizar_seguimiento(
    seguimiento_id: int,
    data: SeguimientoUpdate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return seguimiento_service.actualizar_seguimiento(db, seguimiento_id, data, usuario_actual)


@router.post("/{seguimiento_id}/soluciones", response_model=SeguimientoRead, status_code=201)
def agregar_solucion(
    seguimiento_id: int,
    data: SeguimientoSolucionCreate,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return seguimiento_service.agregar_solucion(db, seguimiento_id, data, usuario_actual)
