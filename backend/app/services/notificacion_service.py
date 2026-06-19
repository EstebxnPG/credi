from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models.credito import Credito
from app.db.models.notificacion import Notificacion
from app.db.models.pendiente_credito import PendienteCredito
from app.db.models.seguimiento import Seguimiento
from app.db.models.usuario import Usuario
from app.schemas.notificacion import NotificacionAsignar, NotificacionEstadoUpdate
from app.services.log_service import registrar_log
from app.services.refinanciacion_service import listar_creditos_elegibles

ABIERTOS = ("pendiente", "en_progreso", "pospuesta")


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _crear_si_falta(db: Session, **data) -> bool:
    if db.query(Notificacion.id).filter(Notificacion.clave == data["clave"]).first():
        return False
    db.add(Notificacion(**data))
    try:
        db.flush()
        return True
    except IntegrityError:
        db.rollback()
        return False


def _resolver_por_clave(db: Session, clave: str) -> None:
    db.query(Notificacion).filter(Notificacion.clave == clave, Notificacion.estado.in_(ABIERTOS)).update(
        {Notificacion.estado: "resuelta", Notificacion.resuelta_en: _ahora()}, synchronize_session=False
    )


def sincronizar_reglas(db: Session, referencia: datetime | None = None) -> int:
    """Materializa reglas temporales. Idempotente y ajeno a los endpoints GET."""
    ahora = referencia or _ahora()
    hoy = ahora.date()
    creadas = 0

    seguimientos = db.query(Seguimiento).filter(
        Seguimiento.is_active == True,  # noqa: E712
        Seguimiento.fecha_proximo_contacto.is_not(None),
        Seguimiento.fecha_proximo_contacto <= ahora + timedelta(days=1),
    ).all()
    for s in seguimientos:
        fecha = s.fecha_proximo_contacto.date()
        etapa = "antes" if fecha > hoy else "hoy" if fecha == hoy else "vencido"
        prioridad = "media" if etapa == "antes" else "alta"
        nombre = s.pensionado.nombre_completo if s.pensionado else f"Pensionado #{s.pensionado_id}"
        creadas += _crear_si_falta(
            db, clave=f"seguimiento-{s.id}-{etapa}", oficina_id=s.oficina_id,
            responsable_id=s.usuario_id, tipo=f"seguimiento_{etapa}", clase="accion",
            estado="pendiente", titulo={"antes":"Seguimiento mañana","hoy":"Seguimiento para hoy","vencido":"Seguimiento vencido"}[etapa],
            mensaje=f"Seguimiento de {nombre}", prioridad=prioridad,
            href=f"/seguimientos/{s.id}", entidad_tipo="seguimiento", entidad_id=s.id,
            pensionado_id=s.pensionado_id, fecha=ahora, leida=False,
        )

    creditos = db.query(Credito).filter(Credito.is_active == True).all()  # noqa: E712
    for c in creditos:
        clave = f"documentos-credito-{c.id}"
        if c.tiene_documentos_pendientes:
            creadas += _crear_si_falta(
                db, clave=clave, oficina_id=c.oficina_id, responsable_id=c.asesor_id,
                tipo="documento_pendiente", clase="accion", estado="pendiente",
                titulo="Documentos pendientes", mensaje=c.documentos_pendientes or f"Crédito #{c.id}",
                prioridad="alta", href=f"/creditos/{c.id}", entidad_tipo="credito",
                entidad_id=c.id, pensionado_id=c.pensionado_id, fecha=ahora, leida=False,
            )
        else:
            _resolver_por_clave(db, clave)

    pendientes = db.query(PendienteCredito).all()
    for p in pendientes:
        clave = f"pendiente-{p.id}"
        if p.estado == "pendiente":
            c = p.credito
            creadas += _crear_si_falta(
                db, clave=clave, oficina_id=c.oficina_id, responsable_id=c.asesor_id,
                tipo="pendiente_operativo", clase="accion", estado="pendiente",
                titulo="Pendiente operativo", mensaje=p.descripcion, prioridad="alta",
                href=f"/creditos/{c.id}", entidad_tipo="pendiente_credito", entidad_id=p.id,
                pensionado_id=c.pensionado_id, fecha=p.created_at, leida=False,
            )
        else:
            _resolver_por_clave(db, clave)

    for e in listar_creditos_elegibles(db):
        if e["disponible_desde"] > hoy:
            continue
        c = db.get(Credito, e["credito_id"])
        clave = f"refinanciacion-{c.id}"
        if e["estado_comercial"] in ("rechazado", "convertido"):
            _resolver_por_clave(db, clave)
            continue
        existente = db.query(Notificacion).filter(Notificacion.clave == clave).first()
        if existente and existente.estado in ("resuelta", "descartada"):
            existente.estado = "pendiente"; existente.leida = False; existente.leida_en = None; existente.resuelta_en = None; existente.resuelta_por = None
            continue
        creadas += _crear_si_falta(
            db, clave=clave, oficina_id=c.oficina_id,
            responsable_id=c.asesor_id, tipo="refinanciacion_disponible", clase="accion",
            estado="pendiente", titulo="Refinanciación disponible",
            mensaje=f"El crédito #{c.id} ya puede refinanciarse", prioridad="alta",
            href=f"/creditos/{c.id}", entidad_tipo="credito", entidad_id=c.id,
            pensionado_id=c.pensionado_id, fecha=ahora, leida=False,
        )

    db.query(Notificacion).filter(
        Notificacion.estado == "pospuesta", Notificacion.pospuesta_hasta <= ahora
    ).update({Notificacion.estado: "pendiente", Notificacion.leida: False, Notificacion.leida_en: None}, synchronize_session=False)
    db.commit()
    return creadas


def _alcance(query, usuario: Usuario):
    return query if usuario.rol == "administrador" else query.filter(Notificacion.oficina_id == usuario.oficina_id)


def listar(db: Session, usuario: Usuario, page=1, page_size=25, estado=None, clase=None, tipo=None, prioridad=None, responsable_id=None, oficina_id=None, texto=None, incluir_resueltas=False):
    q = _alcance(db.query(Notificacion), usuario)
    if usuario.rol == "administrador" and oficina_id: q = q.filter(Notificacion.oficina_id == oficina_id)
    if estado: q = q.filter(Notificacion.estado == estado)
    elif not incluir_resueltas: q = q.filter(Notificacion.estado != "resuelta")
    if clase: q = q.filter(Notificacion.clase == clase)
    if tipo: q = q.filter(Notificacion.tipo == tipo)
    if prioridad: q = q.filter(Notificacion.prioridad == prioridad)
    if responsable_id: q = q.filter(Notificacion.responsable_id == responsable_id)
    if texto:
        patron = f"%{texto}%"
        q = q.filter(Notificacion.titulo.ilike(patron) | Notificacion.mensaje.ilike(patron))
    total = q.count()
    items = q.order_by(Notificacion.estado.asc(), Notificacion.fecha.desc()).offset((page-1)*page_size).limit(page_size).all()
    unread = _alcance(db.query(Notificacion), usuario).filter(Notificacion.leida == False, Notificacion.estado.in_(ABIERTOS)).count()  # noqa: E712
    return {"items": items, "total": total, "page": page, "page_size": page_size, "unread": unread}


def _get(db: Session, usuario: Usuario, item_id: int) -> Notificacion:
    item = _alcance(db.query(Notificacion), usuario).filter(Notificacion.id == item_id).first()
    if not item: raise HTTPException(status_code=404, detail="Notificación no encontrada")
    return item


def marcar_leida(db, usuario, item_id):
    item = _get(db, usuario, item_id); item.leida = True; item.leida_en = _ahora(); db.commit()


def marcar_todas_leidas(db, usuario):
    _alcance(db.query(Notificacion), usuario).filter(Notificacion.leida == False).update({Notificacion.leida: True, Notificacion.leida_en: _ahora()}, synchronize_session=False); db.commit()  # noqa: E712


def cambiar_estado(db: Session, usuario: Usuario, item_id: int, data: NotificacionEstadoUpdate):
    item = _get(db, usuario, item_id)
    if data.estado == "descartada" and not data.justificacion:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Descartar exige justificación")
    if data.estado == "pospuesta" and (not data.pospuesta_hasta or data.pospuesta_hasta <= _ahora()):
        raise HTTPException(status_code=422, detail="La fecha de reactivación debe estar en el futuro")
    anterior = item.estado; item.estado = data.estado; item.justificacion = data.justificacion
    item.pospuesta_hasta = data.pospuesta_hasta if data.estado == "pospuesta" else None
    if data.estado in ("resuelta", "descartada"):
        item.resuelta_en = _ahora(); item.resuelta_por = usuario.id
    registrar_log(db, usuario.id, "notificaciones", item.id, "cambiar_estado", {"estado": anterior}, {"estado": data.estado, "justificacion": data.justificacion})
    db.commit(); db.refresh(item); return item


def asignar(db: Session, usuario: Usuario, item_id: int, data: NotificacionAsignar):
    item = _get(db, usuario, item_id)
    if data.responsable_id:
        responsable = db.get(Usuario, data.responsable_id)
        if not responsable or not responsable.is_active or responsable.oficina_id != item.oficina_id:
            raise HTTPException(status_code=422, detail="El responsable debe ser un usuario activo de la misma oficina")
    anterior = item.responsable_id; item.responsable_id = data.responsable_id
    registrar_log(db, usuario.id, "notificaciones", item.id, "asignar", {"responsable_id": anterior}, {"responsable_id": data.responsable_id})
    db.commit(); db.refresh(item); return item
