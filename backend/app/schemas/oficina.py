from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime


class OficinaBase(BaseModel):
    nombre: str
    direccion: str

    @field_validator("nombre", "direccion")
    @classmethod
    def no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El campo no puede estar vacío")
        return v.strip()


class OficinaCreate(OficinaBase):
    pass


class OficinaUpdate(BaseModel):
    nombre: Optional[str] = None
    direccion: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("nombre", "direccion", mode="before")
    @classmethod
    def no_vacio_si_presente(cls, v):
        if v is not None and not str(v).strip():
            raise ValueError("El campo no puede estar vacío")
        return v.strip() if v else v


class OficinaRead(OficinaBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}