from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator, model_validator


class CooperativaBase(BaseModel):
    nombre: str
    edad_minima: int
    edad_maxima: int
    monto_minimo: float
    monto_maximo: float
    plazo_minimo: int
    plazo_maximo: int

    @field_validator("nombre")
    @classmethod
    def nombre_no_vacio(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("El nombre no puede estar vacio")
        return value.strip()

    @field_validator("edad_minima", "edad_maxima")
    @classmethod
    def edad_positiva(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("La edad debe ser mayor a 0")
        return value

    @field_validator("monto_minimo", "monto_maximo")
    @classmethod
    def monto_positivo(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("El monto debe ser mayor a 0")
        return value

    @field_validator("plazo_minimo", "plazo_maximo")
    @classmethod
    def plazo_positivo(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("El plazo debe ser mayor a 0")
        return value

    @model_validator(mode="after")
    def rangos_coherentes(self):
        if self.edad_minima >= self.edad_maxima:
            raise ValueError("edad_minima debe ser menor que edad_maxima")
        if self.monto_minimo >= self.monto_maximo:
            raise ValueError("monto_minimo debe ser menor que monto_maximo")
        if self.plazo_minimo >= self.plazo_maximo:
            raise ValueError("plazo_minimo debe ser menor que plazo_maximo")
        return self


class CooperativaCreate(CooperativaBase):
    pass


class CooperativaUpdate(BaseModel):
    nombre: Optional[str] = None
    edad_minima: Optional[int] = None
    edad_maxima: Optional[int] = None
    monto_minimo: Optional[float] = None
    monto_maximo: Optional[float] = None
    plazo_minimo: Optional[int] = None
    plazo_maximo: Optional[int] = None
    is_active: Optional[bool] = None


class CooperativaRead(CooperativaBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
