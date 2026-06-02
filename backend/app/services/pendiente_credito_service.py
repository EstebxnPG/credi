from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models.credito import Credito
from app.db.models.documento import Documento
from app.db.models.pendiente_credito import PendienteCredito
from app.db.models.usuario import Usuario
from app.schemas.pendiente_credito import (
    ESTADOS_ABIERTOS_PENDIENTE,
    PendienteCreditoCreate,
    PendienteCreditoResolve,
    PendienteCreditoUpdate,
)
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
            detail=f"Credito con id {credito_id} no encontrado",
        )
    return credito


def _get_pendiente_or_404(db: Session, pendiente_id: int) -> PendienteCredito:
    pendiente = db.query(PendienteCredito).filter(PendienteCredito.id == pendiente_id).first()
    if not pendiente:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pendiente con id {pendiente_id} no encontrado",
        )
    return pendiente


def _validar_documento_del_credito(
    db: Session, credito_id: int, documento_id: int | None
) -> None:
    if documento_id is None:
        return

    documento = (
        db.query(Documento)
        .filter(
            Documento.id == documento_id,
            Documento.credito_id == credito_id,
            Documento.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not documento:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El documento no existe o no pertenece al credito",
        )


def credito_tiene_pendientes_abiertos(db: Session, credito_id: int) -> bool:
    return (
        db.query(PendienteCredito)
        .filter(
            PendienteCredito.credito_id == credito_id,
            PendienteCredito.estado.in_(ESTADOS_ABIERTOS_PENDIENTE),
        )
        .first()
        is not None
    )


def listar_pendientes(
    db: Session, credito_id: int | None = None, estado: str | None = None
) -> list[PendienteCredito]:
    query = db.query(PendienteCredito)
    if credito_id is not None:
        query = query.filter(PendienteCredito.credito_id == credito_id)
    if estado is not None:
        query = query.filter(PendienteCredito.estado == estado)
    return query.order_by(PendienteCredito.created_at.desc(), PendienteCredito.id.desc()).all()


def crear_pendiente(
    db: Session, data: PendienteCreditoCreate, usuario_actual: Usuario
) -> PendienteCredito:
    _get_credito_activo_or_404(db, data.credito_id)
    _validar_documento_del_credito(db, data.credito_id, data.documento_id)

    pendiente = PendienteCredito(
        **data.model_dump(),
        estado="pendiente",
        created_by=usuario_actual.id,
    )
    db.add(pendiente)
    db.flush()

    registrar_log(
        db=db,
        usuario_id=usuario_actual.id,
        tabla_afectada="pendientes_credito",
        registro_afectado=pendiente.id,
        tipo_accion="crear",
        valores_despues=data.model_dump(),
    )

    db.commit()
    db.refresh(pendiente)
    return pendiente


def actualizar_pendiente(
    db: Session,
    pendiente_id: int,
    data: PendienteCreditoUpdate,
    usuario_actual: Usuario,
) -> PendienteCredito:
    pendiente = _get_pendiente_or_404(db, pendiente_id)
    if pendiente.estado != "pendiente":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden editar pendientes abiertos",
        )

    cambios = data.model_dump(exclude_unset=True)
    if not cambios:
        return pendiente

    _validar_documento_del_credito(
        db, pendiente.credito_id, cambios.get("documento_id", pendiente.documento_id)
    )
    valores_antes = {campo: getattr(pendiente, campo) for campo in cambios.keys()}

    for campo, valor in cambios.items():
        setattr(pendiente, campo, valor)

    registrar_log(
        db=db,
        usuario_id=usuario_actual.id,
        tabla_afectada="pendientes_credito",
        registro_afectado=pendiente.id,
        tipo_accion="actualizar",
        valores_antes=valores_antes,
        valores_despues=cambios,
    )

    db.commit()
    db.refresh(pendiente)
    return pendiente


def resolver_pendiente(
    db: Session,
    pendiente_id: int,
    data: PendienteCreditoResolve,
    usuario_actual: Usuario,
) -> PendienteCredito:
    pendiente = _get_pendiente_or_404(db, pendiente_id)
    if pendiente.estado != "pendiente":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El pendiente ya no esta abierto",
        )

    documento_id = data.documento_id if data.documento_id is not None else pendiente.documento_id
    _validar_documento_del_credito(db, pendiente.credito_id, documento_id)

    pendiente.estado = "resuelto"
    pendiente.documento_id = documento_id
    pendiente.observacion_resolucion = data.observacion_resolucion
    pendiente.resolved_by = usuario_actual.id
    pendiente.resolved_at = datetime.now(timezone.utc)

    registrar_log(
        db=db,
        usuario_id=usuario_actual.id,
        tabla_afectada="pendientes_credito",
        registro_afectado=pendiente.id,
        tipo_accion="resolver",
        valores_antes={"estado": "pendiente"},
        valores_despues={
            "estado": "resuelto",
            "documento_id": documento_id,
            "observacion_resolucion": data.observacion_resolucion,
        },
    )

    db.commit()
    db.refresh(pendiente)
    return pendiente
