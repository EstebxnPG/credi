from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


class RefinanciacionBase(BaseModel):
    credito_id: int
    obligacion_externa: Optional[str] = None
    entidad: Optional[str] = None
    valor_refinanciacion: Optional[float] = None
    valor_cuota_recoge: Optional[float] = None
    cuotas_recoge: Optional[int] = None
    nro_cuotas_anterior: Optional[int] = None

    @field_validator("obligacion_externa", "entidad", mode="before")
    @classmethod
    def limpiar_textos(cls, value):
        if value is None:
            return value
            
        value = str(value).strip()
        return value or None

    @field_validator(
        "valor_refinanciacion",
        "valor_cuota_recoge",
    )
    @classmethod
    def validar_montos(cls, value):
        if value is not None and value <= 0:
            raise ValueError("El valor debe ser mayor a 0")
        return value

    @field_validator("cuotas_recoge", "nro_cuotas_anterior")
    @classmethod
    def validar_enteros(cls, value):
        if value is not None and value <= 0:
            raise ValueError("El valor debe ser mayor a 0")
        return value


class RefinanciacionCreate(RefinanciacionBase):
    pass


class RefinanciacionUpdate(BaseModel):
    obligacion_externa: Optional[str] = None
    entidad: Optional[str] = None
    valor_refinanciacion: Optional[float] = None
    valor_cuota_recoge: Optional[float] = None
    cuotas_recoge: Optional[int] = None
    nro_cuotas_anterior: Optional[int] = None

    @field_validator("obligacion_externa", "entidad", mode="before")
    @classmethod
    def limpiar_textos(cls, value):
        if value is None:
            return value
        value = str(value).strip()
        return value or None

    @field_validator(
        "valor_refinanciacion",
        "valor_cuota_recoge",
    )
    @classmethod
    def validar_montos(cls, value):
        if value is not None and value <= 0:
            raise ValueError("El valor debe ser mayor a 0")
        return value

    @field_validator("cuotas_recoge", "nro_cuotas_anterior")
    @classmethod
    def validar_enteros(cls, value):
        if value is not None and value <= 0:
            raise ValueError("El valor debe ser mayor a 0")
        return value


class RefinanciacionRead(RefinanciacionBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}
