from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.db.models.oficina import Oficina
from app.db.models.pensionado import Pensionado
from app.db.models.seguimiento import Seguimiento, SeguimientoSolucion
from app.db.models.usuario import Usuario
from app.schemas.seguimiento import (
    EstadoSeguimiento,
    SeguimientoCreate,
    SeguimientoRead,
    SeguimientoSolucionCreate,
    SeguimientoSolucionRead,
    SeguimientoUpdate,
)
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
        pensionado_nombre=seguimiento.pensionado.nombre_completo if seguimiento.pensionado else None,
        pensionado_documento=seguimiento.pensionado.documento if seguimiento.pensionado else None,
        oficina_id=seguimiento.oficina_id,
        oficina_nombre=seguimiento.oficina.nombre if seguimiento.oficina else None,
        usuario_id=seguimiento.usuario_id,
        usuario_nombre=seguimiento.usuario.nombre if seguimiento.usuario else None,
        tipo=seguimiento.tipo,
        estado=seguimiento.estado,
        comentario=seguimiento.comentario,
        resultado=seguimiento.resultado,
        fecha_proximo_contacto=seguimiento.fecha_proximo_contacto,
        created_at=seguimiento.created_at,
        is_active=seguimiento.is_active,
        soluciones=[
            SeguimientoSolucionRead(
                id=solucion.id,
                seguimiento_id=solucion.seguimiento_id,
                usuario_id=solucion.usuario_id,
                usuario_nombre=solucion.usuario.nombre if solucion.usuario else None,
                comentario=solucion.comentario,
                resultado=solucion.resultado,
                estado_resultante=solucion.estado_resultante,
                fecha_proximo_contacto=solucion.fecha_proximo_contacto,
                created_at=solucion.created_at,
            )
            for solucion in seguimiento.soluciones
        ],
    )


def _get_seguimiento_activo_or_404(db: Session, seguimiento_id: int) -> Seguimiento:
    seguimiento = (
        db.query(Seguimiento)
        .options(
            joinedload(Seguimiento.pensionado),
            joinedload(Seguimiento.oficina),
            joinedload(Seguimiento.usuario),
            joinedload(Seguimiento.soluciones).joinedload(SeguimientoSolucion.usuario),
        )
        .filter(Seguimiento.id == seguimiento_id, Seguimiento.is_active == True)  # noqa: E712
        .first()
    )
    if not seguimiento:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Seguimiento con id {seguimiento_id} no encontrado",
        )
    return seguimiento


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
        estado=data.estado.value,
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
            "estado": data.estado.value,
            "resultado": data.resultado,
            "fecha_proximo_contacto": data.fecha_proximo_contacto,
        },
    )

    from app.services.notificacion_service import sincronizar_reglas

    sincronizar_reglas(db, commit=False)
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
    skip: int = 0,
    limit: int = 15,
) -> list[SeguimientoRead]:
    query = (
        db.query(Seguimiento)
        .options(
            joinedload(Seguimiento.pensionado),
            joinedload(Seguimiento.oficina),
            joinedload(Seguimiento.usuario),
            joinedload(Seguimiento.soluciones).joinedload(SeguimientoSolucion.usuario),
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
        query = query.filter(Seguimiento.estado.in_(["abierto", "pendiente", "esperando"]))

    seguimientos = query.order_by(Seguimiento.created_at.desc()).offset(skip).limit(limit).all()
    return [_to_read(item) for item in seguimientos]


def obtener_seguimiento(
    db: Session,
    seguimiento_id: int,
    usuario_actual: Usuario,
) -> SeguimientoRead:
    seguimiento = _get_seguimiento_activo_or_404(db, seguimiento_id)
    _validar_alcance_oficina(usuario_actual, seguimiento.oficina_id)
    return _to_read(seguimiento)


def actualizar_seguimiento(
    db: Session,
    seguimiento_id: int,
    data: SeguimientoUpdate,
    usuario_actual: Usuario,
) -> SeguimientoRead:
    seguimiento = _get_seguimiento_activo_or_404(db, seguimiento_id)
    _validar_alcance_oficina(usuario_actual, seguimiento.oficina_id)

    anterior = {
        "estado": seguimiento.estado,
        "resultado": seguimiento.resultado,
        "fecha_proximo_contacto": seguimiento.fecha_proximo_contacto,
    }
    seguimiento.estado = data.estado.value
    seguimiento.resultado = data.resultado
    seguimiento.fecha_proximo_contacto = data.fecha_proximo_contacto

    registrar_log(
        db=db,
        usuario_id=usuario_actual.id,
        tabla_afectada="seguimientos",
        registro_afectado=seguimiento.id,
        tipo_accion="actualizar_estado",
        valores_antes=anterior,
        valores_despues={
            "estado": seguimiento.estado,
            "resultado": seguimiento.resultado,
            "fecha_proximo_contacto": seguimiento.fecha_proximo_contacto,
        },
    )

    from app.services.notificacion_service import sincronizar_reglas

    sincronizar_reglas(db, commit=False)
    db.commit()
    db.refresh(seguimiento)
    return obtener_seguimiento(db, seguimiento.id, usuario_actual)


def agregar_solucion(
    db: Session,
    seguimiento_id: int,
    data: SeguimientoSolucionCreate,
    usuario_actual: Usuario,
) -> SeguimientoRead:
    seguimiento = _get_seguimiento_activo_or_404(db, seguimiento_id)
    _validar_alcance_oficina(usuario_actual, seguimiento.oficina_id)

    solucion = SeguimientoSolucion(
        seguimiento_id=seguimiento.id,
        usuario_id=usuario_actual.id,
        comentario=data.comentario,
        resultado=data.resultado,
        estado_resultante=data.estado_resultante.value if data.estado_resultante else None,
        fecha_proximo_contacto=data.fecha_proximo_contacto,
    )
    db.add(solucion)

    anterior = {
        "estado": seguimiento.estado,
        "resultado": seguimiento.resultado,
        "fecha_proximo_contacto": seguimiento.fecha_proximo_contacto,
    }
    if data.estado_resultante:
        seguimiento.estado = data.estado_resultante.value
    if data.resultado is not None:
        seguimiento.resultado = data.resultado
    if data.fecha_proximo_contacto is not None or data.estado_resultante != EstadoSeguimiento.pendiente:
        seguimiento.fecha_proximo_contacto = data.fecha_proximo_contacto

    db.flush()
    registrar_log(
        db=db,
        usuario_id=usuario_actual.id,
        tabla_afectada="seguimiento_soluciones",
        registro_afectado=solucion.id,
        tipo_accion="crear",
        valores_despues={
            "seguimiento_id": seguimiento.id,
            "usuario_id": usuario_actual.id,
            "resultado": data.resultado,
            "estado_resultante": solucion.estado_resultante,
            "fecha_proximo_contacto": data.fecha_proximo_contacto,
        },
    )
    registrar_log(
        db=db,
        usuario_id=usuario_actual.id,
        tabla_afectada="seguimientos",
        registro_afectado=seguimiento.id,
        tipo_accion="agregar_solucion",
        valores_antes=anterior,
        valores_despues={
            "estado": seguimiento.estado,
            "resultado": seguimiento.resultado,
            "fecha_proximo_contacto": seguimiento.fecha_proximo_contacto,
        },
    )

    from app.services.notificacion_service import sincronizar_reglas

    sincronizar_reglas(db, commit=False)
    db.commit()
    return obtener_seguimiento(db, seguimiento.id, usuario_actual)
