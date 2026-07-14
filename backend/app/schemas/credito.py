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
    "Finalizado",
}

TIPOS_CREDITO_VALIDOS = {
    "NUEVO",
    "REFINANCIACION",
    "COMPRA CARTERA",
}

MOTIVOS_FINALIZACION_VALIDOS = {
    "PAGO_NORMAL",
    "REFINANCIADO",
    "AJUSTE_MIGRACION",
    "ANULADO",
    "OTRO",
}


def normalizar_tipo_credito(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = " ".join(value.strip().upper().split())
    if not normalized:
        return None

    aliases = {
        "NUEVO": "NUEVO",
        "NUEVA": "NUEVO",
        "PLAN PRIMA": "NUEVO",
        "CAMBIO": "NUEVO",
        "REF": "REFINANCIACION",
        "REFINANCIACION": "REFINANCIACION",
        "REFINANCIACIÓN": "REFINANCIACION",
        "COMPRA": "COMPRA CARTERA",
        "COMPRA CARTERA": "COMPRA CARTERA",
        "COMPRA DE CARTERA": "COMPRA CARTERA",
    }
    if normalized in aliases:
        return aliases[normalized]
    if normalized.startswith("REF"):
        return "REFINANCIACION"
    if "COMPRA" in normalized or "CARTERA" in normalized:
        return "COMPRA CARTERA"
    return normalized

# Transiciones permitidas: desde → {hacia donde puede ir}
TRANSICIONES_VALIDAS: dict[str, set[str]] = {
    "Prospecto":              {"Enviado a cooperativa"},
    "Enviado a cooperativa":  {"Devuelto por corrección", "Aprobado", "Rechazado"},
    "Devuelto por corrección":{"Reenviado"},
    "Reenviado":              {"Devuelto por corrección", "Aprobado", "Rechazado"},
    "Aprobado":               {"Finalizado"},
    "Rechazado":              set(),   # estado final
    "Finalizado":             set(),   # estado final
}


# ─── Create ──────────────────────────────────────────────────────────────────
class CreditoCreate(BaseModel):
    pensionado_id: int
    asesor_id: int
    oficina_id: int
    cooperativa_id: int
    credito_refinanciado_id: Optional[int] = None
    pagaduria_id: int
    monto_solicitado: float
    plazo: int
    nro_libranza: Optional[str] = None
    tipo_credito: str = "NUEVO"
    entidad_financiera_origen: Optional[str] = None
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

    @field_validator("tipo_credito")
    @classmethod
    def tipo_credito_valido(cls, v: str) -> str:
        v = normalizar_tipo_credito(v)
        if v not in TIPOS_CREDITO_VALIDOS:
            raise ValueError("Tipo de credito debe ser NUEVO, REFINANCIACION o COMPRA CARTERA")
        return v

    @field_validator("entidad_financiera_origen")
    @classmethod
    def entidad_origen_limpia(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        return v or None


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
    entidad_financiera_origen: Optional[str] = None
    observaciones: Optional[str] = None
    pagaduria_id: Optional[int] = None
    cooperativa_id: Optional[int] = None
    credito_refinanciado_id: Optional[int] = None
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

    @field_validator("tipo_credito")
    @classmethod
    def tipo_credito_valido(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = normalizar_tipo_credito(v)
        if v not in TIPOS_CREDITO_VALIDOS:
            raise ValueError("Tipo de credito debe ser NUEVO, REFINANCIACION o COMPRA CARTERA")
        return v

    @field_validator("entidad_financiera_origen")
    @classmethod
    def entidad_origen_limpia(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        return v or None


class CreditoObservacionesUpdate(BaseModel):
    observaciones: Optional[str] = None

    @field_validator("observaciones")
    @classmethod
    def observaciones_limpias(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        return v or None


# ─── Cambio de estado ────────────────────────────────────────────────────────
class CreditoCambioEstado(BaseModel):
    """
    Endpoint dedicado para cambiar el estado de un crédito.
    Al aprobar, monto_aprobado es obligatorio.
    """
    estado_nuevo: str
    observaciones: Optional[str] = None
    motivo_finalizacion: Optional[str] = None

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
        if self.estado_nuevo == "Aprobado":
            if not self.monto_aprobado:
                raise ValueError("monto_aprobado es obligatorio cuando el estado es Aprobado")
            if not self.fecha_desembolso:
                raise ValueError("fecha_desembolso es obligatoria cuando el estado es Aprobado")
            if not self.fecha_fin_estimada:
                raise ValueError("fecha_fin_estimada es obligatoria cuando el estado es Aprobado")
            if self.fecha_fin_estimada <= self.fecha_desembolso:
                raise ValueError("fecha_fin_estimada debe ser posterior a fecha_desembolso")
        if self.estado_nuevo == "Finalizado":
            if not self.motivo_finalizacion:
                raise ValueError("motivo_finalizacion es obligatorio cuando el estado es Finalizado")
            self.motivo_finalizacion = self.motivo_finalizacion.strip().upper()
            if self.motivo_finalizacion not in MOTIVOS_FINALIZACION_VALIDOS:
                raise ValueError(
                    "motivo_finalizacion debe ser PAGO_NORMAL, REFINANCIADO, "
                    "AJUSTE_MIGRACION, ANULADO u OTRO"
                )
        if self.monto_aprobado is not None and self.monto_aprobado <= 0:
            raise ValueError("monto_aprobado debe ser mayor a 0")
        return self


# ─── Read ────────────────────────────────────────────────────────────────────
class CreditoRead(BaseModel):
    id: int
    pensionado_id: int
    pensionado_nombre: Optional[str] = None
    pensionado_documento: Optional[str] = None
    asesor_id: int
    asesor_nombre: Optional[str] = None
    oficina_id: int
    cooperativa_id: int
    cooperativa_nombre: Optional[str] = None
    credito_refinanciado_id: Optional[int]
    pagaduria_id: int
    nro_libranza: Optional[str]
    tipo_credito: Optional[str]
    entidad_financiera_origen: Optional[str]
    monto_solicitado: float
    monto_aprobado: Optional[float]
    plazo: int
    estado: str
    motivo_finalizacion: Optional[str]
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
