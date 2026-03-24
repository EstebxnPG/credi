from pydantic import BaseModel, field_validator
from datetime import date
from typing import Optional
import re

# ── Base: campos comunes a crear y leer ──────────────────────────
class PensionadoBase(BaseModel):
    nombre: str
    documento: str
    fecha_nacimiento: date
    telefono: str
    celular: Optional[str] = None
    direccion: str
    fecha_inicio_pension: date

    @field_validator("documento")
    @classmethod
    def documento_solo_numeros(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^\d{6,12}$", v):
            raise ValueError("Documento debe tener entre 6 y 12 dígitos numéricos")
        return v

    @field_validator("nombre")
    @classmethod
    def nombre_no_vacio(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Nombre demasiado corto")
        return v

# ── Create: lo que recibe la API al crear ────────────────────────
class PensionadoCreate(PensionadoBase):
    pass

# ── Update: todos los campos opcionales para PATCH ──────────────
class PensionadoUpdate(BaseModel):
    nombre: Optional[str] = None
    telefono: Optional[str] = None
    celular: Optional[str] = None
    direccion: Optional[str] = None

# ── Read: lo que devuelve la API ─────────────────────────────────
class PensionadoRead(PensionadoBase):
    id: int
    is_active: bool

    model_config = {"from_attributes": True}  # permite leer desde modelo SQLAlchemy