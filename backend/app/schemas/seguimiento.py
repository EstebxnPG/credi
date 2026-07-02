from datetime import datetime, time
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

HORA_INICIO_SEGUIMIENTO = time(8, 0)
HORA_FIN_SEGUIMIENTO = time(17, 30)


def validar_horario_laboral(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return value

    hora = value.timetz().replace(tzinfo=None)
    if hora < HORA_INICIO_SEGUIMIENTO or hora > HORA_FIN_SEGUIMIENTO:
        raise ValueError("Los seguimientos solo se pueden agendar entre 08:00 y 17:30")
    return value


class TipoSeguimiento(str, Enum):
    cotizacion = "cotizacion"
    llamada = "llamada"
    whatsapp = "whatsapp"
    visita = "visita"
    documentos = "documentos"
    objecion = "objecion"
    seguimiento = "seguimiento"
    cierre_perdido = "cierre_perdido"


class EstadoSeguimiento(str, Enum):
    abierto = "abierto"
    cerrado = "cerrado"
    pendiente = "pendiente"
    esperando = "esperando"


class SeguimientoCreate(BaseModel):
    pensionado_id: int
    oficina_id: int
    tipo: TipoSeguimiento
    estado: EstadoSeguimiento = EstadoSeguimiento.abierto
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

    @field_validator("fecha_proximo_contacto")
    @classmethod
    def fecha_con_hora(cls, value: Optional[datetime]) -> Optional[datetime]:
        return validar_horario_laboral(value)

    @model_validator(mode="after")
    def validar_fecha_pendiente(self):
        if self.estado == EstadoSeguimiento.pendiente and self.fecha_proximo_contacto is None:
            raise ValueError("Un seguimiento pendiente exige fecha y hora de proximo contacto")
        return self


class SeguimientoUpdate(BaseModel):
    estado: EstadoSeguimiento
    resultado: Optional[str] = None
    fecha_proximo_contacto: Optional[datetime] = None

    @field_validator("resultado")
    @classmethod
    def resultado_limpio(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = value.strip()
        return value or None

    @field_validator("fecha_proximo_contacto")
    @classmethod
    def fecha_en_horario_laboral(cls, value: Optional[datetime]) -> Optional[datetime]:
        return validar_horario_laboral(value)

    @model_validator(mode="after")
    def validar_fecha_pendiente(self):
        if self.estado == EstadoSeguimiento.pendiente and self.fecha_proximo_contacto is None:
            raise ValueError("Un seguimiento pendiente exige fecha y hora de proximo contacto")
        return self


class SeguimientoSolucionCreate(BaseModel):
    comentario: str
    resultado: Optional[str] = None
    estado_resultante: Optional[EstadoSeguimiento] = None
    fecha_proximo_contacto: Optional[datetime] = None

    @field_validator("comentario")
    @classmethod
    def comentario_no_vacio(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 5:
            raise ValueError("La solucion debe tener al menos 5 caracteres")
        return value

    @field_validator("resultado")
    @classmethod
    def resultado_limpio(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = value.strip()
        return value or None

    @field_validator("fecha_proximo_contacto")
    @classmethod
    def fecha_en_horario_laboral(cls, value: Optional[datetime]) -> Optional[datetime]:
        return validar_horario_laboral(value)

    @model_validator(mode="after")
    def validar_fecha_pendiente(self):
        if self.estado_resultante == EstadoSeguimiento.pendiente and self.fecha_proximo_contacto is None:
            raise ValueError("Una solucion que deja pendiente exige fecha y hora")
        return self


class SeguimientoSolucionRead(BaseModel):
    id: int
    seguimiento_id: int
    usuario_id: int
    usuario_nombre: Optional[str] = None
    comentario: str
    resultado: Optional[str]
    estado_resultante: Optional[str]
    fecha_proximo_contacto: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


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
    estado: str
    comentario: str
    resultado: Optional[str]
    fecha_proximo_contacto: Optional[datetime]
    created_at: datetime
    is_active: bool
    soluciones: list[SeguimientoSolucionRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}
