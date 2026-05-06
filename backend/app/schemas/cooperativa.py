from pydantic import BaseModel, field_validator, model_validator
from typing import Optional
from datetime import datetime


# ─── Base ────────────────────────────────────────────────────────────────────
class CooperativaBase(BaseModel):
    nombre: str
    edad_minima: int
    edad_maxima: int
    monto_minimo: float
    monto_maximo: float
    plazo_minimo: int
    plazo_maximo: int
    tiempo_minimo_pension: int   # en meses
    porcentaje_comision: float = 0.0   # reservado para uso futuro

    @field_validator("nombre")
    @classmethod
    def nombre_no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El nombre no puede estar vacío")
        return v.strip()

    @field_validator("edad_minima", "edad_maxima")
    @classmethod
    def edad_positiva(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("La edad debe ser mayor a 0")
        return v

    @field_validator("monto_minimo", "monto_maximo")
    @classmethod
    def monto_positivo(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("El monto debe ser mayor a 0")
        return v

    @field_validator("plazo_minimo", "plazo_maximo")
    @classmethod
    def plazo_positivo(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("El plazo debe ser mayor a 0")
        return v

    @field_validator("porcentaje_comision")
    @classmethod
    def comision_valida(cls, v: float) -> float:
        if not (0 <= v <= 100):
            raise ValueError("El porcentaje de comisión debe estar entre 0 y 100")
        return v

    @field_validator("tiempo_minimo_pension")
    @classmethod
    def tiempo_pension_positivo(cls, v: int) -> int:
        if v < 0:
            raise ValueError("El tiempo mínimo de pensión no puede ser negativo")
        return v

    # Validaciones cruzadas entre campos
    @model_validator(mode="after")
    def rangos_coherentes(self):
        if self.edad_minima >= self.edad_maxima:
            raise ValueError("edad_minima debe ser menor que edad_maxima")
        if self.monto_minimo >= self.monto_maximo:
            raise ValueError("monto_minimo debe ser menor que monto_maximo")
        if self.plazo_minimo >= self.plazo_maximo:
            raise ValueError("plazo_minimo debe ser menor que plazo_maximo")
        return self


# ─── Create ──────────────────────────────────────────────────────────────────
class CooperativaCreate(CooperativaBase):
    pass


# ─── Update ──────────────────────────────────────────────────────────────────
class CooperativaUpdate(BaseModel):
    """Partial update — solo actualiza los campos que se envíen."""
    nombre: Optional[str] = None
    edad_minima: Optional[int] = None
    edad_maxima: Optional[int] = None
    monto_minimo: Optional[float] = None
    monto_maximo: Optional[float] = None
    plazo_minimo: Optional[int] = None
    plazo_maximo: Optional[int] = None
    tiempo_minimo_pension: Optional[int] = None
    porcentaje_comision: Optional[float] = None
    is_active: Optional[bool] = None


# ─── Read ────────────────────────────────────────────────────────────────────
class CooperativaRead(CooperativaBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
