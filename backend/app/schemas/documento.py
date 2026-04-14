from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class DocumentoRead(BaseModel):
    id: int
    credito_id: int
    nombre: str
    tipo: str
    url: str
    version: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentoReplaceResponse(BaseModel):
    anterior: DocumentoRead
    nuevo: DocumentoRead


class DocumentoUploadResponse(BaseModel):
    documento: DocumentoRead
    mensaje: Optional[str] = None
