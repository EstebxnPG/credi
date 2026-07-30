from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.db.models.credito import Credito
from app.db.models.notificacion import Notificacion, NotificacionLectura
from app.db.models.pendiente_credito import PendienteCredito
from app.db.models.pensionado import Pensionado
from app.db.models.seguimiento import Seguimiento
from app.db.models.usuario import Usuario
from app.core.time import business_date, now_utc
from app.schemas.notificacion import NotificacionAsignar, NotificacionEstadoUpdate
from app.services.log_service import registrar_log
from app.services.refinanciacion_service import listar_creditos_elegibles

ABIERTOS = ("pendiente", "en_progreso", "pospuesta")
VISIBLES = ("pendiente", "en_progreso")
CERRADOS = ("resuelta", "descartada")

TRANSICIONES = {
    "pendiente": {"en_progreso", "pospuesta", "resuelta", "descartada"},
    "en_progreso": {"pendiente", "pospuesta", "resuelta", "descartada"},
    "pospuesta": {"pendiente", "resuelta", "descartada"},
    "resuelta": {"pendiente"},
    "descartada": {"pendiente"},
}


def _ahora() -> datetime:
    return now_utc()


def _reactivar(item: Notificacion, data: dict, forzar_reapertura: bool) -> bool:
    if item.estado == "descartada" and not forzar_reapertura:
        return False

    ahora = _ahora()
    estaba_cerrada = item.estado in CERRADOS
    esta_pospuesta = item.estado == "pospuesta" and item.pospuesta_hasta and item.pospuesta_hasta > ahora
    if estaba_cerrada and not forzar_reapertura:
        return False

    cambio = False
    for campo, valor in data.items():
        if esta_pospuesta and campo in {"estado", "leida", "leida_en", "pospuesta_hasta"}:
            continue
        if campo == "responsable_id" and valor is None and item.responsable_id is not None:
            continue
        if campo == "leida" and valor is False and item.leida is True:
            continue
        if campo == "leida_en" and valor is None and item.leida_en is not None:
            continue
        if getattr(item, campo) != valor:
            setattr(item, campo, valor)
            cambio = True

    if item.leida is False and item.leida_en is not None and not esta_pospuesta:
        item.leida_en = None
        cambio = True

    if estaba_cerrada:
        item.estado = "pendiente"
        item.leida = False
        item.leida_en = None
        item.resuelta_en = None
        item.resuelta_por = None
        item.pospuesta_hasta = None
        cambio = True

    return cambio


def _crear_o_actualizar(db: Session, forzar_reapertura: bool = False, **data) -> bool:
    item = db.query(Notificacion).filter(Notificacion.clave == data["clave"]).first()
    if item:
        return _reactivar(item, data, forzar_reapertura)

    db.add(Notificacion(**data))
    db.flush()
    return True


def _crear_si_falta(db: Session, **data) -> bool:
    item = db.query(Notificacion.id).filter(Notificacion.clave == data["clave"]).first()
    if item:
        return False

    db.add(Notificacion(**data))
    db.flush()
    return True


def _resolver_por_clave(db: Session, clave: str) -> None:
    db.query(Notificacion).filter(
        Notificacion.clave == clave,
        Notificacion.estado.in_(ABIERTOS),
    ).update(
        {
            Notificacion.estado: "resuelta",
            Notificacion.resuelta_en: _ahora(),
            Notificacion.pospuesta_hasta: None,
        },
        synchronize_session=False,
    )


def sincronizar_documentos_credito(db: Session, credito: Credito, ahora: datetime | None = None) -> bool:
    ahora = ahora or _ahora()
    clave = f"documentos-credito-{credito.id}"
    if credito.tiene_documentos_pendientes:
        return _crear_o_actualizar(
            db,
            clave=clave,
            oficina_id=credito.oficina_id,
            responsable_id=None,
            tipo="documento_pendiente",
            clase="accion",
            estado="pendiente",
            titulo="Documentos pendientes",
            mensaje=credito.documentos_pendientes or f"Credito #{credito.id}",
            prioridad="alta",
            href=f"/creditos/{credito.id}",
            entidad_tipo="credito",
            entidad_id=credito.id,
            pensionado_id=credito.pensionado_id,
            fecha=ahora,
            leida=False,
        )

    _resolver_por_clave(db, clave)
    return False


def _datos_seguimiento(fecha_contacto: datetime, hoy) -> tuple[str, str, str]:
    fecha = fecha_contacto.date()
    if fecha > hoy:
        return "antes", "Seguimiento mañana", "media"
    if fecha == hoy:
        return "hoy", "Seguimiento para hoy", "alta"
    return "vencido", "Seguimiento vencido", "alta"


def sincronizar_reglas(db: Session, referencia: datetime | None = None, commit: bool = True) -> int:
    """Materializa alertas de negocio sin depender de lecturas GET."""
    ahora = referencia or _ahora()
    hoy = business_date(ahora)
    cambios = 0

    cumple_key_hoy = hoy.month * 100 + hoy.day
    cumple_key = (
        func.extract("month", Pensionado.fecha_nacimiento) * 100
        + func.extract("day", Pensionado.fecha_nacimiento)
    )
    cumpleanos = (
        db.query(Pensionado)
        .filter(
            Pensionado.is_active == True,  # noqa: E712
            Pensionado.fecha_nacimiento.is_not(None),
            cumple_key == cumple_key_hoy,
        )
        .all()
    )
    for pensionado in cumpleanos:
        cambios += _crear_si_falta(
            db,
            clave=f"cumpleanos-{pensionado.id}-{hoy.isoformat()}",
            oficina_id=pensionado.oficina_id,
            responsable_id=None,
            tipo="cumpleanos_hoy",
            clase="informativa",
            estado="pendiente",
            titulo="Cumpleanos hoy",
            mensaje=f"{pensionado.nombre_completo} cumple anos hoy",
            prioridad="media",
            href=f"/pensionados/{pensionado.id}",
            entidad_tipo="pensionado",
            entidad_id=pensionado.id,
            pensionado_id=pensionado.id,
            fecha=ahora,
            leida=False,
        )

    seguimientos = (
        db.query(Seguimiento)
        .filter(
            Seguimiento.is_active == True,  # noqa: E712
            Seguimiento.estado.in_(("abierto", "pendiente")),
            Seguimiento.fecha_proximo_contacto.is_not(None),
            Seguimiento.fecha_proximo_contacto <= ahora + timedelta(days=1),
        )
        .all()
    )
    seguimiento_ids = set()
    for seguimiento in seguimientos:
        seguimiento_ids.add(seguimiento.id)
        etapa, titulo, prioridad = _datos_seguimiento(seguimiento.fecha_proximo_contacto, hoy)
        nombre = (
            seguimiento.pensionado.nombre_completo
            if seguimiento.pensionado
            else f"Pensionado #{seguimiento.pensionado_id}"
        )
        cambios += _crear_o_actualizar(
            db,
            clave=f"seguimiento-{seguimiento.id}",
            oficina_id=seguimiento.oficina_id,
            responsable_id=None,
            tipo=f"seguimiento_{etapa}",
            clase="accion",
            estado="pendiente",
            titulo=titulo,
            mensaje=f"Seguimiento de {nombre}",
            prioridad=prioridad,
            href=f"/seguimientos/{seguimiento.id}",
            entidad_tipo="seguimiento",
            entidad_id=seguimiento.id,
            pensionado_id=seguimiento.pensionado_id,
            fecha=ahora,
            leida=False,
        )

    q_seguimientos_abiertos = db.query(Notificacion).filter(
        Notificacion.tipo.like("seguimiento_%"),
        Notificacion.estado.in_(ABIERTOS),
    )
    if seguimiento_ids:
        q_seguimientos_abiertos = q_seguimientos_abiertos.filter(
            Notificacion.entidad_id.notin_(seguimiento_ids)
        )
    q_seguimientos_abiertos.update(
        {Notificacion.estado: "resuelta", Notificacion.resuelta_en: ahora},
        synchronize_session=False,
    )

    creditos = db.query(Credito).filter(Credito.is_active == True).all()  # noqa: E712
    for credito in creditos:
        clave = f"documentos-credito-{credito.id}"
        if not credito.pensionado or not credito.pensionado.is_active:
            _resolver_por_clave(db, clave)
        elif credito.tiene_documentos_pendientes:
            cambios += _crear_o_actualizar(
                db,
                clave=clave,
                oficina_id=credito.oficina_id,
                responsable_id=None,
                tipo="documento_pendiente",
                clase="accion",
                estado="pendiente",
                titulo="Documentos pendientes",
                mensaje=credito.documentos_pendientes or f"Crédito #{credito.id}",
                prioridad="alta",
                href=f"/creditos/{credito.id}",
                entidad_tipo="credito",
                entidad_id=credito.id,
                pensionado_id=credito.pensionado_id,
                fecha=ahora,
                leida=False,
            )
        else:
            _resolver_por_clave(db, clave)

    pendientes = db.query(PendienteCredito).all()
    for pendiente in pendientes:
        clave = f"pendiente-{pendiente.id}"
        credito = pendiente.credito
        if (
            pendiente.estado == "pendiente"
            and credito
            and credito.pensionado
            and credito.pensionado.is_active
        ):
            cambios += _crear_o_actualizar(
                db,
                clave=clave,
                oficina_id=credito.oficina_id,
                responsable_id=None,
                tipo="pendiente_operativo",
                clase="accion",
                estado="pendiente",
                titulo="Pendiente operativo",
                mensaje=pendiente.descripcion,
                prioridad="alta",
                href=f"/creditos/{credito.id}",
                entidad_tipo="pendiente_credito",
                entidad_id=pendiente.id,
                pensionado_id=credito.pensionado_id,
                fecha=pendiente.created_at,
                leida=False,
            )
        else:
            _resolver_por_clave(db, clave)

    for elegible in listar_creditos_elegibles(db, commit=False, limit=None):
        if elegible["disponible_desde"] > hoy:
            continue

        credito = db.get(Credito, elegible["credito_id"])
        clave = f"refinanciacion-{credito.id}"
        if elegible["estado_comercial"] in ("aceptado", "rechazado", "convertido", "pospuesto"):
            _resolver_por_clave(db, clave)
            continue

        cambios += _crear_o_actualizar(
            db,
            forzar_reapertura=elegible["estado_comercial"] == "disponible",
            clave=clave,
            oficina_id=credito.oficina_id,
            responsable_id=None,
            tipo="refinanciacion_disponible",
            clase="accion",
            estado="pendiente",
            titulo="Refinanciación disponible",
            mensaje=f"El crédito #{credito.id} ya puede refinanciarse",
            prioridad="alta",
            href=f"/creditos/{credito.id}",
            entidad_tipo="credito",
            entidad_id=credito.id,
            pensionado_id=credito.pensionado_id,
            fecha=ahora,
            leida=False,
        )

    db.query(Notificacion).filter(
        Notificacion.estado == "pospuesta",
        Notificacion.pospuesta_hasta <= ahora,
    ).update(
        {
            Notificacion.estado: "pendiente",
            Notificacion.leida: False,
            Notificacion.leida_en: None,
            Notificacion.pospuesta_hasta: None,
        },
        synchronize_session=False,
    )

    db.query(Notificacion).filter(
        Notificacion.estado != "pospuesta",
        Notificacion.pospuesta_hasta.is_not(None),
    ).update({Notificacion.pospuesta_hasta: None}, synchronize_session=False)

    db.query(Notificacion).filter(
        Notificacion.clave.like("seguimiento-%-%"),
        Notificacion.estado.in_(ABIERTOS),
    ).update(
        {Notificacion.estado: "resuelta", Notificacion.resuelta_en: ahora, Notificacion.pospuesta_hasta: None},
        synchronize_session=False,
    )

    if commit:
        db.commit()
    return cambios


def sincronizar_y_commit(db: Session) -> None:
    sincronizar_reglas(db, commit=False)
    db.commit()


def _alcance(query, usuario: Usuario):
    if usuario.rol == "administrador":
        return query
    return query.filter(Notificacion.oficina_id == usuario.oficina_id)


def _visibles_ahora(query, ahora: datetime):
    return query.filter(
        or_(
            Notificacion.estado.in_(VISIBLES),
            and_(Notificacion.estado == "pospuesta", Notificacion.pospuesta_hasta <= ahora),
        )
    )


def _lectura_query(db: Session, usuario: Usuario):
    return db.query(NotificacionLectura).filter(NotificacionLectura.usuario_id == usuario.id)


def _aplicar_lectura_usuario(items: list[Notificacion], lecturas: dict[int, datetime]) -> None:
    for item in items:
        leida_en = lecturas.get(item.id)
        item.leida = leida_en is not None
        item.leida_en = leida_en


def listar(
    db: Session,
    usuario: Usuario,
    page=1,
    page_size=25,
    estado=None,
    clase=None,
    tipo=None,
    prioridad=None,
    responsable_id=None,
    oficina_id=None,
    texto=None,
    incluir_resueltas=False,
):
    ahora = _ahora()
    q = _alcance(db.query(Notificacion), usuario)
    if usuario.rol == "administrador" and oficina_id:
        q = q.filter(Notificacion.oficina_id == oficina_id)
    if estado:
        q = q.filter(Notificacion.estado == estado)
    elif not incluir_resueltas:
        q = _visibles_ahora(q, ahora)
    if clase:
        q = q.filter(Notificacion.clase == clase)
    if tipo:
        q = q.filter(Notificacion.tipo == tipo)
    if prioridad:
        q = q.filter(Notificacion.prioridad == prioridad)
    if responsable_id:
        q = q.filter(Notificacion.responsable_id == responsable_id)
    if texto:
        patron = f"%{texto}%"
        q = q.filter(Notificacion.titulo.ilike(patron) | Notificacion.mensaje.ilike(patron))

    total = q.count()
    items = (
        q.order_by(Notificacion.estado.asc(), Notificacion.fecha.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    lecturas = {
        lectura.notificacion_id: lectura.leida_en
        for lectura in _lectura_query(db, usuario)
        .filter(NotificacionLectura.notificacion_id.in_([item.id for item in items]))
        .all()
    }
    _aplicar_lectura_usuario(items, lecturas)

    unread_q = _visibles_ahora(_alcance(db.query(Notificacion.id), usuario), ahora).outerjoin(
        NotificacionLectura,
        and_(
            NotificacionLectura.notificacion_id == Notificacion.id,
            NotificacionLectura.usuario_id == usuario.id,
        ),
    )
    unread = unread_q.filter(NotificacionLectura.id.is_(None)).count()
    return {"items": items, "total": total, "page": page, "page_size": page_size, "unread": unread}


def _get(db: Session, usuario: Usuario, item_id: int) -> Notificacion:
    item = _alcance(db.query(Notificacion), usuario).filter(Notificacion.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    return item


def marcar_leida(db, usuario, item_id):
    item = _get(db, usuario, item_id)
    lectura = (
        _lectura_query(db, usuario)
        .filter(NotificacionLectura.notificacion_id == item.id)
        .first()
    )
    if not lectura:
        leida_en = _ahora()
        db.add(NotificacionLectura(notificacion_id=item.id, usuario_id=usuario.id, leida_en=leida_en))
        item.leida = True
        item.leida_en = leida_en
    db.commit()


def marcar_todas_leidas(db, usuario):
    ahora = _ahora()
    visibles = _visibles_ahora(_alcance(db.query(Notificacion.id), usuario), ahora).all()
    ids = [item.id for item in visibles]
    if ids:
        existentes = {
            lectura.notificacion_id
            for lectura in _lectura_query(db, usuario)
            .filter(NotificacionLectura.notificacion_id.in_(ids))
            .all()
        }
        db.add_all(
            NotificacionLectura(notificacion_id=notificacion_id, usuario_id=usuario.id, leida_en=ahora)
            for notificacion_id in ids
            if notificacion_id not in existentes
        )
    db.commit()


def cambiar_estado(db: Session, usuario: Usuario, item_id: int, data: NotificacionEstadoUpdate):
    item = _get(db, usuario, item_id)
    if item.clase == "informativa" and data.estado not in ("resuelta",):
        raise HTTPException(status_code=422, detail="Las notificaciones informativas solo se leen o se cierran")
    if data.estado not in TRANSICIONES.get(item.estado, set()):
        raise HTTPException(status_code=422, detail=f"No se permite pasar de {item.estado} a {data.estado}")
    if item.estado == "descartada" and data.estado == "pendiente" and usuario.rol != "administrador":
        raise HTTPException(status_code=403, detail="Solo un administrador puede reabrir una notificación descartada")
    if data.estado == "descartada" and not data.justificacion:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Descartar exige justificación")
    if data.estado == "pospuesta" and (not data.pospuesta_hasta or data.pospuesta_hasta <= _ahora()):
        raise HTTPException(status_code=422, detail="La fecha de reactivación debe estar en el futuro")

    anterior = item.estado
    responsable_anterior = item.responsable_id
    item.estado = data.estado
    item.justificacion = data.justificacion
    item.pospuesta_hasta = data.pospuesta_hasta if data.estado == "pospuesta" else None
    if data.estado == "en_progreso" and item.responsable_id is None:
        item.responsable_id = usuario.id
    if data.estado in CERRADOS:
        item.resuelta_en = _ahora()
        item.resuelta_por = usuario.id
    else:
        item.resuelta_en = None
        item.resuelta_por = None

    registrar_log(
        db,
        usuario.id,
        "notificaciones",
        item.id,
        "cambiar_estado",
        {"estado": anterior, "responsable_id": responsable_anterior},
        {"estado": data.estado, "justificacion": data.justificacion, "responsable_id": item.responsable_id},
    )
    db.commit()
    db.refresh(item)
    return item


def asignar(db: Session, usuario: Usuario, item_id: int, data: NotificacionAsignar):
    item = _get(db, usuario, item_id)
    if data.responsable_id:
        responsable = db.get(Usuario, data.responsable_id)
        if not responsable or not responsable.is_active or responsable.oficina_id != item.oficina_id:
            raise HTTPException(status_code=422, detail="El responsable debe ser un usuario activo de la misma oficina")
    anterior = item.responsable_id
    item.responsable_id = data.responsable_id
    registrar_log(
        db,
        usuario.id,
        "notificaciones",
        item.id,
        "asignar",
        {"responsable_id": anterior},
        {"responsable_id": data.responsable_id},
    )
    db.commit()
    db.refresh(item)
    return item
