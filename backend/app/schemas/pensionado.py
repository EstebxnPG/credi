from pydantic import BaseModel, field_serializer, field_validator
from datetime import date, datetime
from typing import Optional
import re

# ── Base: campos comunes a crear y leer ──────────────────────────
class PensionadoBase(BaseModel):
    nombre: str
    segundo_nombre: Optional[str] = None
    apellidos: Optional[str] = None
    genero: Optional[str] = None
    documento: str
    fecha_nacimiento: Optional[date] = None
    correo: Optional[str] = None
    telefono: Optional[str] = None
    celular: Optional[str] = None
    direccion: Optional[str] = None

    @field_validator("documento")
    @classmethod
    def documento_solo_numeros(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^\d{6,12}$", v):
            raise ValueError("Documento debe tener entre 6 y 12 dígitos numéricos")
        return v

    @field_validator("nombre")
    @classmethod
    def texto_requerido(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Debe tener al menos 3 caracteres")
        return v

    @field_validator("apellidos")
    @classmethod
    def apellidos_opcional(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
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
    def genero_valido(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        opciones = {"Masculino", "Femenino", "Otro", "No especificado"}
        if v not in opciones:
            raise ValueError("Genero debe ser Masculino, Femenino, Otro o No especificado")
        return v

    @field_validator("correo")
    @classmethod
    def correo_opcional(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip().lower()
        if not v:
            return None
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("Correo debe tener un formato valido")
        return v

# ── Create: lo que recibe la API al crear ────────────────────────
class PensionadoCreate(PensionadoBase):
    @field_validator("fecha_nacimiento")
    @classmethod
    def fecha_no_futura(cls, v: Optional[date]) -> Optional[date]:
        if v is not None and v > date.today():
            raise ValueError("La fecha no puede estar en el futuro")
        return v

# ── Update: todos los campos opcionales para PATCH ──────────────
class PensionadoUpdate(BaseModel):
    nombre: Optional[str] = None
    segundo_nombre: Optional[str] = None
    apellidos: Optional[str] = None
    genero: Optional[str] = None
    correo: Optional[str] = None
    telefono: Optional[str] = None
    celular: Optional[str] = None
    direccion: Optional[str] = None
    fecha_nacimiento: Optional[date] = None

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

    @field_validator("correo")
    @classmethod
    def correo_update(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip().lower()
        if not v:
            return None
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("Correo debe tener un formato valido")
        return v

    @field_validator("fecha_nacimiento")
    @classmethod
    def fecha_update_no_futura(cls, v: Optional[date]) -> Optional[date]:
        if v is not None and v > date.today():
            raise ValueError("La fecha no puede estar en el futuro")
        return v

# ── Read: lo que devuelve la API ─────────────────────────────────
class PensionadoRead(PensionadoBase):
    id: int
    oficina_id: int
    created_by: Optional[int] = None
    creador_nombre: Optional[str] = None
    created_at: datetime
    nombre_completo: str
    is_active: bool

    @field_serializer("nombre", "segundo_nombre", "apellidos", "nombre_completo")
    def serializar_nombres_en_mayuscula(self, value: Optional[str]) -> Optional[str]:
        return value.upper() if value else value

    model_config = {"from_attributes": True}  # permite leer desde modelo SQLAlchemy


class PensionadoLookup(BaseModel):
    exists: bool
    linked_to_current_office: bool = False
    pensionado: Optional[PensionadoRead] = None
