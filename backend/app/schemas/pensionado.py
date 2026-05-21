from pydantic import BaseModel, field_validator
from datetime import date
from typing import Optional
import re

# ── Base: campos comunes a crear y leer ──────────────────────────
class PensionadoBase(BaseModel):
    nombre: str
    segundo_nombre: Optional[str] = None
    apellidos: str
    genero: str
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

    @field_validator("nombre", "apellidos")
    @classmethod
    def texto_requerido(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Debe tener al menos 3 caracteres")
        return v

    @field_validator("segundo_nombre")
    @classmethod
    def segundo_nombre_opcional(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        return v or None

    @field_validator("genero")
    @classmethod
    def genero_valido(cls, v: str) -> str:
        v = v.strip()
        opciones = {"Masculino", "Femenino", "Otro", "No especificado"}
        if v not in opciones:
            raise ValueError("Genero debe ser Masculino, Femenino, Otro o No especificado")
        return v

# ── Create: lo que recibe la API al crear ────────────────────────
class PensionadoCreate(PensionadoBase):
    pass

# ── Update: todos los campos opcionales para PATCH ──────────────
class PensionadoUpdate(BaseModel):
    nombre: Optional[str] = None
    segundo_nombre: Optional[str] = None
    apellidos: Optional[str] = None
    genero: Optional[str] = None
    telefono: Optional[str] = None
    celular: Optional[str] = None
    direccion: Optional[str] = None

    @field_validator("nombre", "apellidos")
    @classmethod
    def texto_opcional_requerido(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Debe tener al menos 3 caracteres")
        return v

    @field_validator("segundo_nombre")
    @classmethod
    def segundo_nombre_update(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        return v or None

    @field_validator("genero")
    @classmethod
    def genero_update(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        opciones = {"Masculino", "Femenino", "Otro", "No especificado"}
        if v not in opciones:
            raise ValueError("Genero debe ser Masculino, Femenino, Otro o No especificado")
        return v

# ── Read: lo que devuelve la API ─────────────────────────────────
class PensionadoRead(PensionadoBase):
    id: int
    nombre_completo: str
    is_active: bool

    model_config = {"from_attributes": True}  # permite leer desde modelo SQLAlchemy
