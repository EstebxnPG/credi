from pydantic import BaseModel, field_validator, model_validator
from typing import Optional
from datetime import date, datetime

# Estados válidos definidos en el SRS
ESTADOS_VALIDOS = {
    "Prospecto",
    "Enviado a cooperativa",
    "Devuelto por corrección",
    "Reenviado",
    "Aprobado",
    "Rechazado",
}

# Transiciones permitidas: desde → {hacia donde puede ir}
TRANSICIONES_VALIDAS: dict[str, set[str]] = {
    "Prospecto":              {"Enviado a cooperativa"},
    "Enviado a cooperativa":  {"Devuelto por corrección", "Aprobado", "Rechazado"},
    "Devuelto por corrección":{"Reenviado"},
    "Reenviado":              {"Devuelto por corrección", "Aprobado", "Rechazado"},
    "Aprobado":               set(),   # estado final
    "Rechazado":              set(),   # estado final
}


# ─── Create ──────────────────────────────────────────────────────────────────
class CreditoCreate(BaseModel):
    pensionado_id: int
    asesor_id: int
    oficina_id: int
    cooperativa_id: int
    pagaduria_id: int
    monto_solicitado: float
    plazo: int
    nro_libranza: Optional[str] = None
    tipo_credito: Optional[str] = None
    observaciones: Optional[str] = None
    tiene_documentos_pendientes: bool = False
    documentos_pendientes: Optional[str] = None

    @field_validator("monto_solicitado")
    @classmethod
    def monto_positivo(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("El monto solicitado debe ser mayor a 0")
        return v

    @field_validator("plazo")
    @classmethod
    def plazo_positivo(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("El plazo debe ser mayor a 0")
        return v


# ─── Update (campos editables por asesora) ───────────────────────────────────
class CreditoUpdate(BaseModel):
    """
    Solo se pueden editar créditos en estado Prospecto o Devuelto por corrección.
    El servicio valida eso. Aquí solo definimos qué campos son modificables.
    """
    monto_solicitado: Optional[float] = None
    plazo: Optional[int] = None
    nro_libranza: Optional[str] = None
    tipo_credito: Optional[str] = None
    observaciones: Optional[str] = None
    pagaduria_id: Optional[int] = None
    cooperativa_id: Optional[int] = None
    tiene_documentos_pendientes: Optional[bool] = None
    documentos_pendientes: Optional[str] = None

    @field_validator("monto_solicitado")
    @classmethod
    def monto_positivo(cls, v):
        if v is not None and v <= 0:
            raise ValueError("El monto solicitado debe ser mayor a 0")
        return v

    @field_validator("plazo")
    @classmethod
    def plazo_positivo(cls, v):
        if v is not None and v <= 0:
            raise ValueError("El plazo debe ser mayor a 0")
        return v


# ─── Cambio de estado ────────────────────────────────────────────────────────
class CreditoCambioEstado(BaseModel):
    """
    Endpoint dedicado para cambiar el estado de un crédito.
    Al aprobar, monto_aprobado es obligatorio.
    """
    estado_nuevo: str
    observaciones: Optional[str] = None

    # Campos solo relevantes al aprobar
    monto_aprobado: Optional[float] = None
    valor_cuota: Optional[float] = None
    fecha_desembolso: Optional[date] = None
    fecha_fin_estimada: Optional[date] = None

    @field_validator("estado_nuevo")
    @classmethod
    def estado_valido(cls, v: str) -> str:
        if v not in ESTADOS_VALIDOS:
            raise ValueError(
                f"Estado '{v}' no válido. Opciones: {', '.join(sorted(ESTADOS_VALIDOS))}"
            )
        return v

    @model_validator(mode="after")
    def monto_requerido_si_aprobado(self):
        if self.estado_nuevo == "Aprobado" and not self.monto_aprobado:
            raise ValueError("monto_aprobado es obligatorio cuando el estado es Aprobado")
        if self.monto_aprobado is not None and self.monto_aprobado <= 0:
            raise ValueError("monto_aprobado debe ser mayor a 0")
        return self


# ─── Read ────────────────────────────────────────────────────────────────────
class CreditoRead(BaseModel):
    id: int
    pensionado_id: int
    asesor_id: int
    oficina_id: int
    cooperativa_id: int
    pagaduria_id: int
    nro_libranza: Optional[str]
    tipo_credito: Optional[str]
    monto_solicitado: float
    monto_aprobado: Optional[float]
    plazo: int
    estado: str
    valor_cuota: Optional[float]
    fecha_desembolso: Optional[date]
    fecha_fin_estimada: Optional[date]
    observaciones: Optional[str]
    tiene_documentos_pendientes: bool
    documentos_pendientes: Optional[str]
    fecha_registro: datetime
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
