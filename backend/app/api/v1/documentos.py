"""
api/v1/documentos.py
Router de Documentos con upload y versionado.
"""
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.db.models.usuario import Usuario
from app.schemas.documento import (
    DocumentoRead,
    DocumentoReplaceResponse,
)
from app.services import documento_service

router = APIRouter(prefix="/documentos", tags=["Documentos"])


@router.post("/", response_model=DocumentoRead, status_code=201)
async def subir_documento(
    credito_id: int = Form(...),
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    contenido = await archivo.read()
    return documento_service.crear_documento(
        db=db,
        credito_id=credito_id,
        nombre_archivo=archivo.filename or "documento",
        contenido=contenido,
        usuario_actual=usuario_actual,
    )


@router.get("/", response_model=list[DocumentoRead])
def listar_documentos(
    credito_id: Optional[int] = Query(None),
    solo_activos: bool = Query(True),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return documento_service.listar_documentos(db, credito_id, solo_activos)


@router.get("/{documento_id}", response_model=DocumentoRead)
def obtener_documento(
    documento_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return documento_service.obtener_documento(db, documento_id)


@router.get("/{documento_id}/descargar", response_class=FileResponse)
def descargar_documento(
    documento_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return documento_service.descargar_documento(db, documento_id)


@router.patch("/{documento_id}/reemplazar", response_model=DocumentoReplaceResponse)
async def reemplazar_documento(
    documento_id: int,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    contenido = await archivo.read()
    return documento_service.reemplazar_documento(
        db=db,
        documento_id=documento_id,
        nombre_archivo=archivo.filename or "documento",
        contenido=contenido,
        usuario_actual=usuario_actual,
    )


@router.delete("/{documento_id}", response_model=DocumentoRead)
def desactivar_documento(
    documento_id: int,
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return documento_service.desactivar_documento(db, documento_id, usuario_actual)
