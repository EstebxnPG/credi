from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.core.dependencies import get_current_user, get_db
from app.db.models.usuario import Usuario
from app.schemas.notificacion import NotificacionAsignar, NotificacionEstadoUpdate, NotificacionPage, NotificacionRead
from app.services import notificacion_service as service

router = APIRouter(prefix="/notificaciones", tags=["Notificaciones"])

@router.get("/", response_model=NotificacionPage)
def obtener(page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), estado: str | None = None, clase: str | None = None, tipo: str | None = None, prioridad: str | None = None, responsable_id: int | None = None, oficina_id: int | None = None, texto: str | None = None, incluir_resueltas: bool = False, db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)):
    return service.listar(db, usuario, page, page_size, estado, clase, tipo, prioridad, responsable_id, oficina_id, texto, incluir_resueltas)

@router.patch("/leer-todas", status_code=204)
def leer_todas(db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)): service.marcar_todas_leidas(db, usuario)

@router.patch("/{item_id}/leer", status_code=204)
def leer(item_id: int, db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)): service.marcar_leida(db, usuario, item_id)

@router.patch("/{item_id}/estado", response_model=NotificacionRead)
def estado(item_id: int, data: NotificacionEstadoUpdate, db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)): return service.cambiar_estado(db, usuario, item_id, data)

@router.patch("/{item_id}/responsable", response_model=NotificacionRead)
def responsable(item_id: int, data: NotificacionAsignar, db: Session = Depends(get_db), usuario: Usuario = Depends(get_current_user)): return service.asignar(db, usuario, item_id, data)
