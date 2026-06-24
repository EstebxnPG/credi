from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class LogRead(BaseModel):
    id: int
    usuario_id: int
    tabla_afectada: str
    registro_afectado: int
    tipo_accion: str
    valores_antes: Optional[dict[str, Any]] = None
    valores_despues: Optional[dict[str, Any]] = None
    created_at: datetime
    usuario_nombre: str | None = None

    model_config = {"from_attributes": True}


class LogPage(BaseModel):
    items: list[LogRead]
    total: int
    page: int
    page_size: int
