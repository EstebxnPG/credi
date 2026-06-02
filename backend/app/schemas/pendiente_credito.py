from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


ESTADOS_PENDIENTE = {"pendiente", "resuelto", "cancelado"}
ORIGENES_PENDIENTE = {"cooperativa", "interno", "cliente"}
ESTADOS_ABIERTOS_PENDIENTE = {"pendiente"}


class PendienteCreditoCreate(BaseModel):
    credito_id: int
    descripcion: str
    origen: str = "cooperativa"
    documento_id: Optional[int] = None

    @field_validator("descripcion")
    @classmethod
    def descripcion_requerida(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("La descripcion debe tener al menos 3 caracteres")
        return v

    @field_validator("origen")
    @classmethod
    def origen_valido(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ORIGENES_PENDIENTE:
            raise ValueError("Origen debe ser cooperativa, interno o cliente")
        return v


class PendienteCreditoUpdate(BaseModel):
    descripcion: Optional[str] = None
    origen: Optional[str] = None
    documento_id: Optional[int] = None

    @field_validator("descripcion")
    @classmethod
    def descripcion_opcional(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        if len(v) < 3:
            raise ValueError("La descripcion debe tener al menos 3 caracteres")
        return v

    @field_validator("origen")
    @classmethod
    def origen_opcional(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip().lower()
        if v not in ORIGENES_PENDIENTE:
            raise ValueError("Origen debe ser cooperativa, interno o cliente")
        return v


class PendienteCreditoResolve(BaseModel):
    observacion_resolucion: Optional[str] = None
    documento_id: Optional[int] = None


class PendienteCreditoRead(BaseModel):
    id: int
    credito_id: int
    documento_id: Optional[int]
    descripcion: str
    estado: str
    origen: str
    observacion_resolucion: Optional[str]
    created_by: int
    resolved_by: Optional[int]
    created_at: datetime
    resolved_at: Optional[datetime]

    model_config = {"from_attributes": True}
