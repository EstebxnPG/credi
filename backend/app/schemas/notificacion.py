from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Estado = Literal["pendiente", "en_progreso", "pospuesta", "resuelta", "descartada"]


class NotificacionRead(BaseModel):
    id: int
    tipo: str
    clase: Literal["accion", "informativa"]
    estado: Estado
    titulo: str
    mensaje: str
    prioridad: Literal["alta", "media", "baja"]
    href: str
    fecha: datetime
    leida: bool
    leida_en: datetime | None
    pospuesta_hasta: datetime | None
    oficina_id: int
    responsable_id: int | None
    responsable_nombre: str | None = None
    pensionado_id: int | None
    entidad_tipo: str | None
    entidad_id: int | None
    model_config = {"from_attributes": True}


class NotificacionPage(BaseModel):
    items: list[NotificacionRead]
    total: int
    page: int
    page_size: int
    unread: int


class NotificacionEstadoUpdate(BaseModel):
    estado: Estado
    justificacion: str | None = Field(default=None, max_length=1000)
    pospuesta_hasta: datetime | None = None


class NotificacionAsignar(BaseModel):
    responsable_id: int | None
