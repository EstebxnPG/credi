"""
documento_service.py
Lógica de negocio para documentos de créditos con versionado y soft delete.
"""
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.db.models.credito import Credito
from app.db.models.documento import Documento
from app.db.models.usuario import Usuario
from app.schemas.documento import DocumentoReplaceResponse
from app.services.log_service import registrar_log


TIPOS_PERMITIDOS = {".pdf": "PDF", ".jpg": "JPG", ".jpeg": "JPG", ".png": "PNG"}
MAX_FILE_SIZE = 10 * 1024 * 1024
UPLOAD_ROOT = Path(__file__).resolve().parents[2] / "data" / "uploads" / "documentos"


def _get_credito_activo_or_404(db: Session, credito_id: int) -> Credito:
    credito = (
        db.query(Credito)
        .filter(Credito.id == credito_id, Credito.is_active == True)  # noqa: E712
        .first()
    )
    if not credito:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Crédito con id {credito_id} no encontrado",
        )
    return credito


def _get_or_404(db: Session, documento_id: int) -> Documento:
    documento = db.query(Documento).filter(Documento.id == documento_id).first()
    if not documento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Documento con id {documento_id} no encontrado",
        )
    return documento


def _validar_archivo(nombre_archivo: str, contenido: bytes) -> tuple[str, str]:
    extension = Path(nombre_archivo).suffix.lower()
    if extension not in TIPOS_PERMITIDOS:
        permitidos = ", ".join(sorted(TIPOS_PERMITIDOS.values()))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tipo de archivo no permitido. Solo se aceptan: {permitidos}",
        )
    if len(contenido) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo excede el tamaño máximo permitido de 10MB",
        )
    return extension, TIPOS_PERMITIDOS[extension]


def _guardar_archivo(
    credito_id: int,
    nombre_logico: str,
    version: int,
    extension: str,
    contenido: bytes,
) -> str:
    carpeta_credito = UPLOAD_ROOT / f"credito_{credito_id}"
    carpeta_credito.mkdir(parents=True, exist_ok=True)
    nombre_base = Path(nombre_logico).stem.replace(" ", "_")
    nombre_fisico = f"{nombre_base}_v{version}_{uuid4().hex[:8]}{extension}"
    ruta = carpeta_credito / nombre_fisico
    ruta.write_bytes(contenido)
    return str(ruta.relative_to(Path(__file__).resolve().parents[2]))


def crear_documento(
    db: Session,
    credito_id: int,
    nombre_archivo: str,
    contenido: bytes,
    usuario_actual: Usuario,
) -> Documento:
    _get_credito_activo_or_404(db, credito_id)
    extension, tipo = _validar_archivo(nombre_archivo, contenido)

    nombre_logico = Path(nombre_archivo).name
    existente = (
        db.query(Documento)
        .filter(
            Documento.credito_id == credito_id,
            Documento.nombre == nombre_logico,
            Documento.is_active == True,  # noqa: E712
        )
        .first()
    )
    if existente:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un documento activo con ese nombre. Usa el endpoint de reemplazo.",
        )

    url = _guardar_archivo(
        credito_id=credito_id,
        nombre_logico=nombre_logico,
        version=1,
        extension=extension,
        contenido=contenido,
    )

    documento = Documento(
        credito_id=credito_id,
        nombre=nombre_logico,
        tipo=tipo,
        url=url,
        version=1,
    )
    db.add(documento)
    db.flush()

    registrar_log(
        db=db,
        usuario_id=usuario_actual.id,
        tabla_afectada="documentos",
        registro_afectado=documento.id,
        tipo_accion="crear",
        valores_despues={
            "credito_id": credito_id,
            "nombre": nombre_logico,
            "tipo": tipo,
            "url": url,
            "version": 1,
        },
    )

    db.commit()
    db.refresh(documento)
    return documento


def listar_documentos(
    db: Session,
    credito_id: int | None = None,
    solo_activos: bool = True,
) -> list[Documento]:
    query = db.query(Documento)
    if credito_id is not None:
        query = query.filter(Documento.credito_id == credito_id)
    if solo_activos:
        query = query.filter(Documento.is_active == True)  # noqa: E712
    return query.order_by(Documento.created_at.desc()).all()


def obtener_documento(db: Session, documento_id: int) -> Documento:
    return _get_or_404(db, documento_id)


def descargar_documento(db: Session, documento_id: int) -> FileResponse:
    documento = _get_or_404(db, documento_id)
    if not documento.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Documento con id {documento_id} no encontrado",
        )

    app_root = Path(__file__).resolve().parents[2]
    ruta = (app_root / documento.url).resolve()
    uploads_root = (app_root / "data" / "uploads" / "documentos").resolve()

    if uploads_root not in ruta.parents or not ruta.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Archivo fisico no encontrado",
        )

    return FileResponse(
        path=ruta,
        filename=documento.nombre,
        media_type="application/octet-stream",
    )


def reemplazar_documento(
    db: Session,
    documento_id: int,
    nombre_archivo: str,
    contenido: bytes,
    usuario_actual: Usuario,
) -> DocumentoReplaceResponse:
    documento_actual = _get_or_404(db, documento_id)
    if not documento_actual.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede reemplazar un documento inactivo",
        )

    extension, tipo = _validar_archivo(nombre_archivo, contenido)
    nueva_version = documento_actual.version + 1

    url = _guardar_archivo(
        credito_id=documento_actual.credito_id,
        nombre_logico=documento_actual.nombre,
        version=nueva_version,
        extension=extension,
        contenido=contenido,
    )

    documento_actual.is_active = False
    nuevo_documento = Documento(
        credito_id=documento_actual.credito_id,
        nombre=documento_actual.nombre,
        tipo=tipo,
        url=url,
        version=nueva_version,
    )
    db.add(nuevo_documento)
    db.flush()

    registrar_log(
        db=db,
        usuario_id=usuario_actual.id,
        tabla_afectada="documentos",
        registro_afectado=nuevo_documento.id,
        tipo_accion="reemplazar",
        valores_antes={
            "documento_id": documento_actual.id,
            "url": documento_actual.url,
            "version": documento_actual.version,
        },
        valores_despues={
            "documento_id": nuevo_documento.id,
            "url": nuevo_documento.url,
            "version": nuevo_documento.version,
        },
    )

    db.commit()
    db.refresh(documento_actual)
    db.refresh(nuevo_documento)
    return DocumentoReplaceResponse(anterior=documento_actual, nuevo=nuevo_documento)


def desactivar_documento(
    db: Session, documento_id: int, usuario_actual: Usuario
) -> Documento:
    documento = _get_or_404(db, documento_id)
    if not documento.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El documento ya está desactivado",
        )

    documento.is_active = False

    registrar_log(
        db=db,
        usuario_id=usuario_actual.id,
        tabla_afectada="documentos",
        registro_afectado=documento.id,
        tipo_accion="desactivar",
        valores_antes={"is_active": True},
        valores_despues={"is_active": False},
    )

    db.commit()
    db.refresh(documento)
    return documento
