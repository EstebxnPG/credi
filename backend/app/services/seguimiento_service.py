from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.db.models.oficina import Oficina
from app.db.models.pensionado import Pensionado
from app.db.models.seguimiento import Seguimiento
from app.db.models.usuario import Usuario
from app.schemas.seguimiento import SeguimientoCreate, SeguimientoRead
from app.services.log_service import registrar_log


def _get_pensionado_activo_or_404(db: Session, pensionado_id: int) -> Pensionado:
    pensionado = (
        db.query(Pensionado)
        .filter(Pensionado.id == pensionado_id, Pensionado.is_active == True)  # noqa: E712
        .first()
    )
    if not pensionado:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pensionado con id {pensionado_id} no encontrado",
        )
    return pensionado


def _get_oficina_activa_or_404(db: Session, oficina_id: int) -> Oficina:
    oficina = (
        db.query(Oficina)
        .filter(Oficina.id == oficina_id, Oficina.is_active == True)  # noqa: E712
        .first()
    )
    if not oficina:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Oficina con id {oficina_id} no encontrada",
        )
    return oficina


def _validar_alcance_oficina(usuario_actual: Usuario, oficina_id: int) -> None:
    if usuario_actual.rol == "administrador":
        return

    if oficina_id != usuario_actual.oficina_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo puedes registrar o consultar seguimientos de tu oficina",
        )


def _to_read(seguimiento: Seguimiento) -> SeguimientoRead:
    return SeguimientoRead(
        id=seguimiento.id,
        pensionado_id=seguimiento.pensionado_id,
        pensionado_nombre=seguimiento.pensionado.nombre if seguimiento.pensionado else None,
        pensionado_documento=seguimiento.pensionado.documento if seguimiento.pensionado else None,
        oficina_id=seguimiento.oficina_id,
        oficina_nombre=seguimiento.oficina.nombre if seguimiento.oficina else None,
        usuario_id=seguimiento.usuario_id,
        usuario_nombre=seguimiento.usuario.nombre if seguimiento.usuario else None,
        tipo=seguimiento.tipo,
        comentario=seguimiento.comentario,
        resultado=seguimiento.resultado,
        fecha_proximo_contacto=seguimiento.fecha_proximo_contacto,
        created_at=seguimiento.created_at,
        is_active=seguimiento.is_active,
    )


def crear_seguimiento(
    db: Session,
    data: SeguimientoCreate,
    usuario_actual: Usuario,
) -> SeguimientoRead:
    _validar_alcance_oficina(usuario_actual, data.oficina_id)
    _get_pensionado_activo_or_404(db, data.pensionado_id)
    _get_oficina_activa_or_404(db, data.oficina_id)

    seguimiento = Seguimiento(
        pensionado_id=data.pensionado_id,
        oficina_id=data.oficina_id,
        usuario_id=usuario_actual.id,
        tipo=data.tipo.value,
        comentario=data.comentario,
        resultado=data.resultado,
        fecha_proximo_contacto=data.fecha_proximo_contacto,
    )
    db.add(seguimiento)
    db.flush()

    registrar_log(
        db=db,
        usuario_id=usuario_actual.id,
        tabla_afectada="seguimientos",
        registro_afectado=seguimiento.id,
        tipo_accion="crear",
        valores_despues={
            "pensionado_id": data.pensionado_id,
            "oficina_id": data.oficina_id,
            "usuario_id": usuario_actual.id,
            "tipo": data.tipo.value,
            "resultado": data.resultado,
            "fecha_proximo_contacto": data.fecha_proximo_contacto,
        },
    )

    db.commit()
    db.refresh(seguimiento)
    return obtener_seguimiento(db, seguimiento.id, usuario_actual)


def listar_seguimientos(
    db: Session,
    usuario_actual: Usuario,
    pensionado_id: int | None = None,
    oficina_id: int | None = None,
    usuario_id: int | None = None,
    solo_pendientes: bool = False,
) -> list[SeguimientoRead]:
    query = (
        db.query(Seguimiento)
        .options(
            joinedload(Seguimiento.pensionado),
            joinedload(Seguimiento.oficina),
            joinedload(Seguimiento.usuario),
        )
        .filter(Seguimiento.is_active == True)  # noqa: E712
    )

    if usuario_actual.rol != "administrador":
        query = query.filter(Seguimiento.oficina_id == usuario_actual.oficina_id)
    elif oficina_id is not None:
        query = query.filter(Seguimiento.oficina_id == oficina_id)

    if pensionado_id is not None:
        query = query.filter(Seguimiento.pensionado_id == pensionado_id)
    if usuario_id is not None:
        query = query.filter(Seguimiento.usuario_id == usuario_id)
    if solo_pendientes:
        query = query.filter(Seguimiento.fecha_proximo_contacto.is_not(None))

    seguimientos = query.order_by(Seguimiento.created_at.desc()).all()
    return [_to_read(item) for item in seguimientos]


def obtener_seguimiento(
    db: Session,
    seguimiento_id: int,
    usuario_actual: Usuario,
) -> SeguimientoRead:
    seguimiento = (
        db.query(Seguimiento)
        .options(
            joinedload(Seguimiento.pensionado),
            joinedload(Seguimiento.oficina),
            joinedload(Seguimiento.usuario),
        )
        .filter(Seguimiento.id == seguimiento_id, Seguimiento.is_active == True)  # noqa: E712
        .first()
    )
    if not seguimiento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Seguimiento con id {seguimiento_id} no encontrado",
        )

    _validar_alcance_oficina(usuario_actual, seguimiento.oficina_id)
    return _to_read(seguimiento)
