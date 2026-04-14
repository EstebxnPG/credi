from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class HistorialCreditoRead(BaseModel):
    id: int
    credito_id: int
    usuario_id: int
    usuario_nombre: Optional[str] = None
    estado_anterior: Optional[str]
    estado_nuevo: str
    observacion: Optional[str]
    created_at: datetime

