from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, field_validator


class TipoSeguimiento(str, Enum):
    cotizacion = "cotizacion"
    llamada = "llamada"
    whatsapp = "whatsapp"
    visita = "visita"
    documentos = "documentos"
    objecion = "objecion"
    seguimiento = "seguimiento"
    cierre_perdido = "cierre_perdido"


class SeguimientoCreate(BaseModel):
    pensionado_id: int
    oficina_id: int
    tipo: TipoSeguimiento
    comentario: str
    resultado: Optional[str] = None
    fecha_proximo_contacto: Optional[datetime] = None

    @field_validator("comentario")
    @classmethod
    def comentario_no_vacio(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 5:
            raise ValueError("El comentario debe tener al menos 5 caracteres")
        return value

    @field_validator("resultado")
    @classmethod
    def resultado_limpio(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = value.strip()
        return value or None


class SeguimientoRead(BaseModel):
    id: int
    pensionado_id: int
    pensionado_nombre: Optional[str] = None
    pensionado_documento: Optional[str] = None
    oficina_id: int
    oficina_nombre: Optional[str] = None
    usuario_id: int
    usuario_nombre: Optional[str] = None
    tipo: str
    comentario: str
    resultado: Optional[str]
    fecha_proximo_contacto: Optional[datetime]
    created_at: datetime
    is_active: bool

    model_config = {"from_attributes": True}
