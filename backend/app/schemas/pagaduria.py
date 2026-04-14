from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


class PagaduriaBase(BaseModel):
    nombre: str

    @field_validator("nombre")
    @classmethod
    def no_vacio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("El campo no puede estar vacío")
        return v.strip()


class PagaduriaCreate(PagaduriaBase):
    pass


class PagaduriaUpdate(BaseModel):
    nombre: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("nombre", mode="before")
    @classmethod
    def no_vacio_si_presente(cls, v):
        if v is not None and not str(v).strip():
            raise ValueError("El campo no puede estar vacío")
        return v.strip() if v else v


class PagaduriaRead(PagaduriaBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
