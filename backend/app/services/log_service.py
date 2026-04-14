"""
log_service.py
Funciones de apoyo para registrar y consultar logs del sistema.
"""
from datetime import datetime

from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from app.db.models.log import Log


def registrar_log(
    db: Session,
    usuario_id: int,
    tabla_afectada: str,
    registro_afectado: int,
    tipo_accion: str,
    valores_antes: dict | None = None,
    valores_despues: dict | None = None,
) -> Log:
    log = Log(
        usuario_id=usuario_id,
        tabla_afectada=tabla_afectada,
        registro_afectado=registro_afectado,
        tipo_accion=tipo_accion,
        valores_antes=jsonable_encoder(valores_antes) if valores_antes else None,
        valores_despues=jsonable_encoder(valores_despues) if valores_despues else None,
    )
    db.add(log)
    return log


def listar_logs(
    db: Session,
    usuario_id: int | None = None,
    tabla_afectada: str | None = None,
    tipo_accion: str | None = None,
    fecha_desde: datetime | None = None,
    fecha_hasta: datetime | None = None,
) -> list[Log]:
    query = db.query(Log)

    if usuario_id is not None:
        query = query.filter(Log.usuario_id == usuario_id)
    if tabla_afectada:
        query = query.filter(Log.tabla_afectada == tabla_afectada)
    if tipo_accion:
        query = query.filter(Log.tipo_accion == tipo_accion)
    if fecha_desde:
        query = query.filter(Log.created_at >= fecha_desde)
    if fecha_hasta:
        query = query.filter(Log.created_at <= fecha_hasta)

    return query.order_by(Log.created_at.desc()).all()
