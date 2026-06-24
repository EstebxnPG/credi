"""
api/v1/logs.py
Router de Logs. Solo lectura para administradores.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, solo_admin
from app.schemas.log import LogPage
from app.services import log_service

router = APIRouter(prefix="/logs", tags=["Logs"])


@router.get("/", response_model=LogPage)
def listar_logs(
    usuario_id: Optional[int] = Query(None),
    tabla_afectada: Optional[str] = Query(None),
    tipo_accion: Optional[str] = Query(None),
    fecha_desde: Optional[datetime] = Query(None),
    fecha_hasta: Optional[datetime] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    _: object = Depends(solo_admin),
):
    return log_service.listar_logs(
        db=db,
        usuario_id=usuario_id,
        tabla_afectada=tabla_afectada,
        tipo_accion=tipo_accion,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        page=page,
        page_size=page_size,
    )
