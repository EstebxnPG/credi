"""
refinanciacion_service.py
Lógica de negocio para refinanciaciones asociadas a créditos.
"""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models.credito import Credito
from app.db.models.refinanciacion import Refinanciacion
from app.db.models.usuario import Usuario
from app.schemas.refinanciacion import RefinanciacionCreate, RefinanciacionUpdate
from app.services.log_service import registrar_log


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


def _get_or_404(db: Session, refinanciacion_id: int) -> Refinanciacion:
    refinanciacion = (
        db.query(Refinanciacion)
        .filter(Refinanciacion.id == refinanciacion_id)
        .first()
    )
    if not refinanciacion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Refinanciación con id {refinanciacion_id} no encontrada",
        )
    return refinanciacion


def crear_refinanciacion(
    db: Session, data: RefinanciacionCreate, usuario_actual: Usuario
) -> Refinanciacion:
    _get_credito_activo_or_404(db, data.credito_id)
    refinanciacion = Refinanciacion(**data.model_dump())
    db.add(refinanciacion)
    db.flush()

    registrar_log(
        db=db,
        usuario_id=usuario_actual.id,
        tabla_afectada="refinanciaciones",
        registro_afectado=refinanciacion.id,
        tipo_accion="crear",
        valores_despues=data.model_dump(),
    )

    db.commit()
    db.refresh(refinanciacion)
    return refinanciacion


def listar_refinanciaciones(
    db: Session, credito_id: int | None = None
) -> list[Refinanciacion]:
    query = db.query(Refinanciacion)
    if credito_id is not None:
        query = query.filter(Refinanciacion.credito_id == credito_id)
    return query.order_by(Refinanciacion.created_at.desc()).all()


def obtener_refinanciacion(db: Session, refinanciacion_id: int) -> Refinanciacion:
    return _get_or_404(db, refinanciacion_id)


def actualizar_refinanciacion(
    db: Session,
    refinanciacion_id: int,
    data: RefinanciacionUpdate,
    usuario_actual: Usuario,
) -> Refinanciacion:
    refinanciacion = _get_or_404(db, refinanciacion_id)
    cambios = data.model_dump(exclude_unset=True)

    if not cambios:
        return refinanciacion

    valores_antes = {
        campo: getattr(refinanciacion, campo)
        for campo in cambios.keys()
    }

    for campo, valor in cambios.items():
        setattr(refinanciacion, campo, valor)

    registrar_log(
        db=db,
        usuario_id=usuario_actual.id,
        tabla_afectada="refinanciaciones",
        registro_afectado=refinanciacion.id,
        tipo_accion="actualizar",
        valores_antes=valores_antes,
        valores_despues=cambios,
    )

    db.commit()
    db.refresh(refinanciacion)
    return refinanciacion
