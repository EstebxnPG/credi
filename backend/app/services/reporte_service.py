from datetime import date, datetime, timedelta
from sqlalchemy import Date, String, case, cast, func, or_
from sqlalchemy.orm import Session

from app.db.models.cooperativa import Cooperativa
from app.db.models.credito import Credito
from app.db.models.documento import Documento
from app.db.models.oficina import Oficina
from app.db.models.pendiente_credito import PendienteCredito
from app.db.models.pensionado import Pensionado
from app.db.models.refinanciacion import OportunidadRefinanciacion, Refinanciacion
from app.db.models.seguimiento import Seguimiento, SeguimientoSolucion
from app.db.models.usuario import Usuario


ESTADOS_ACTIVOS = {
    "Prospecto",
    "Enviado a cooperativa",
    "Devuelto por corrección",
    "Reenviado",
    "Aprobado",
}


def _base_creditos_query(db: Session, usuario_actual: Usuario):
    query = db.query(Credito).filter(Credito.is_active == True)  # noqa: E712
    if usuario_actual.rol == "asesora":
        query = query.filter(Credito.asesor_id == usuario_actual.id)
    return query


def _esta_en_proximos_30_dias(fecha_nacimiento: date | None, hoy: date) -> bool:
    if fecha_nacimiento is None:
        return False

    fin = hoy + timedelta(days=30)
    cumple_este_anio = fecha_nacimiento.replace(year=hoy.year)

    if cumple_este_anio < hoy:
        cumple_este_anio = cumple_este_anio.replace(year=hoy.year + 1)

    return hoy <= cumple_este_anio <= fin


def obtener_resumen_reportes(db: Session, usuario_actual: Usuario) -> dict:
    hoy = date.today()
    inicio_mes = datetime(hoy.year, hoy.month, 1)

    creditos_query = _base_creditos_query(db, usuario_actual)
    total = creditos_query.count()
    total_aprobados = creditos_query.filter(Credito.estado == "Aprobado").count()
    creditos_mes = creditos_query.filter(Credito.fecha_registro >= inicio_mes).count()
    aprobados_mes = creditos_query.filter(
        Credito.estado == "Aprobado",
        Credito.fecha_registro >= inicio_mes,
    ).count()
    activos = creditos_query.filter(Credito.estado.in_(ESTADOS_ACTIVOS)).count()
    tasa_aprobacion = (total_aprobados / total * 100) if total else 0

    estados = (
        creditos_query
        .with_entities(Credito.estado, func.count(Credito.id))
        .group_by(Credito.estado)
        .order_by(Credito.estado)
        .all()
    )
    productividad_asesoras = (
        creditos_query
        .join(Usuario, Usuario.id == Credito.asesor_id)
        .with_entities(Usuario.nombre, func.count(Credito.id).label("total"))
        .group_by(Usuario.nombre)
        .order_by(func.count(Credito.id).desc())
        .all()
    )
    productividad_oficinas = (
        creditos_query
        .join(Oficina, Oficina.id == Credito.oficina_id)
        .with_entities(Oficina.nombre, func.count(Credito.id).label("total"))
        .group_by(Oficina.nombre)
        .order_by(func.count(Credito.id).desc())
        .all()
    )
    cooperativas = (
        creditos_query
        .join(Cooperativa, Cooperativa.id == Credito.cooperativa_id)
        .with_entities(
            Cooperativa.nombre,
            func.count(Credito.id).label("total"),
            func.sum(case((Credito.estado == "Aprobado", 1), else_=0)).label("aprobados"),
        )
        .group_by(Cooperativa.nombre)
        .all()
    )
    tasas_cooperativa = [
        {
            "nombre": nombre,
            "total": total_cooperativa,
            "aprobados": aprobados_cooperativa or 0,
            "tasa_aprobacion": round(((aprobados_cooperativa or 0) / total_cooperativa) * 100, 2),
        }
        for nombre, total_cooperativa, aprobados_cooperativa in cooperativas
    ]
    tasas_cooperativa.sort(key=lambda item: item["tasa_aprobacion"], reverse=True)

    pensionados_query = db.query(Pensionado).filter(Pensionado.is_active == True)  # noqa: E712
    if usuario_actual.rol != "administrador":
        pensionados_query = pensionados_query.filter(Pensionado.oficina_id == usuario_actual.oficina_id)

    inicio_key = hoy.month * 100 + hoy.day
    fin = hoy + timedelta(days=30)
    fin_key = fin.month * 100 + fin.day
    cumple_key = (
        func.extract("month", Pensionado.fecha_nacimiento) * 100
        + func.extract("day", Pensionado.fecha_nacimiento)
    )
    cumple_filter = (
        cumple_key.between(inicio_key, fin_key)
        if inicio_key <= fin_key
        else or_(cumple_key >= inicio_key, cumple_key <= fin_key)
    )
    cumpleanos_query = pensionados_query.filter(
        Pensionado.fecha_nacimiento.isnot(None),
        cumple_filter,
    )
    cumpleanos_total = cumpleanos_query.count()
    pensionados = (
        cumpleanos_query
        .order_by(cumple_key, Pensionado.id)
        .limit(10)
        .all()
    )
    cumpleanos = [
        {
            "id": pensionado.id,
            "nombre": pensionado.nombre_completo,
            "documento": pensionado.documento,
            "fecha_nacimiento": pensionado.fecha_nacimiento.isoformat(),
        }
        for pensionado in pensionados
        if pensionado.fecha_nacimiento
        and _esta_en_proximos_30_dias(pensionado.fecha_nacimiento, hoy)
    ]

    refinanciaciones_query = db.query(Refinanciacion)
    if usuario_actual.rol == "asesora":
        refinanciaciones_query = (
            refinanciaciones_query
            .join(Credito, Credito.id == Refinanciacion.credito_id)
            .filter(Credito.asesor_id == usuario_actual.id)
        )

    refinanciaciones = refinanciaciones_query.count()

    return {
        "generado_en": datetime.now().isoformat(),
        "alcance": "global" if usuario_actual.rol == "administrador" else "asesora",
        "kpis": {
            "creditos_total": total,
            "creditos_mes": creditos_mes,
            "creditos_activos": activos,
            "creditos_aprobados": total_aprobados,
            "creditos_aprobados_mes": aprobados_mes,
            "tasa_aprobacion": round(tasa_aprobacion, 2),
            "refinanciaciones": refinanciaciones,
            "cumpleanos_30_dias": cumpleanos_total,
        },
        "creditos_por_estado": [
            {"estado": estado, "total": total_estado}
            for estado, total_estado in estados
        ],
        "productividad_asesoras": [
            {"nombre": nombre, "creditos": total_asesora}
            for nombre, total_asesora in productividad_asesoras
        ],
        "productividad_oficinas": [
            {"nombre": nombre, "creditos": total_oficina}
            for nombre, total_oficina in productividad_oficinas
        ],
        "cooperativas": tasas_cooperativa,
        "cumpleanos_proximos": cumpleanos,
    }


def obtener_resumen_creditos_reporte(
    db: Session,
    usuario_actual: Usuario,
    oficina_id: int | None = None,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    texto: str | None = None,
) -> dict:
    query = db.query(Credito).filter(Credito.is_active == True)  # noqa: E712

    if usuario_actual.rol != "administrador":
        query = query.filter(Credito.oficina_id == usuario_actual.oficina_id)
    if oficina_id is not None:
        query = query.filter(Credito.oficina_id == oficina_id)
    if fecha_desde is not None:
        query = query.filter(cast(Credito.fecha_registro, Date) >= fecha_desde)
    if fecha_hasta is not None:
        query = query.filter(cast(Credito.fecha_registro, Date) <= fecha_hasta)
    if texto:
        term = f"%{texto.strip()}%"
        query = query.join(Pensionado, Pensionado.id == Credito.pensionado_id)
        query = query.outerjoin(Oficina, Oficina.id == Credito.oficina_id)
        query = query.filter(
            or_(
                cast(Credito.id, String).ilike(term),
                Credito.estado.ilike(term),
                Credito.tipo_credito.ilike(term),
                Pensionado.nombre_completo.ilike(term),
                Pensionado.documento.ilike(term),
                Oficina.nombre.ilike(term),
            )
        )

    total, aprobados, solicitado, aprobado = query.with_entities(
        func.count(Credito.id),
        func.sum(case((Credito.estado == "Aprobado", 1), else_=0)),
        func.coalesce(func.sum(Credito.monto_solicitado), 0),
        func.coalesce(func.sum(Credito.monto_aprobado), 0),
    ).one()

    return {
        "creditos": total or 0,
        "aprobados": aprobados or 0,
        "solicitado": float(solicitado or 0),
        "aprobado": float(aprobado or 0),
    }


def obtener_metricas_reporte(
    db: Session,
    usuario_actual: Usuario,
    reporte: str,
    oficina_id: int | None = None,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    texto: str | None = None,
    estado_comercial: str | None = None,
) -> dict:
    if reporte == "creditos":
        return obtener_resumen_creditos_reporte(
            db, usuario_actual, oficina_id, fecha_desde, fecha_hasta, texto
        )
    if reporte == "pensionados":
        return _metricas_pensionados(db, usuario_actual, oficina_id, fecha_desde, fecha_hasta, texto)
    if reporte == "seguimientos":
        return _metricas_seguimientos(db, usuario_actual, oficina_id, fecha_desde, fecha_hasta, texto)
    if reporte == "documentos":
        return _metricas_documentos(db, usuario_actual, oficina_id, fecha_desde, fecha_hasta, texto)
    if reporte == "pendientes":
        return _metricas_pendientes(db, usuario_actual, oficina_id, fecha_desde, fecha_hasta, texto)
    if reporte == "oficinas":
        return _metricas_oficinas(db, usuario_actual, oficina_id)
    if reporte == "refinanciaciones":
        return _metricas_refinanciaciones(
            db, usuario_actual, oficina_id, fecha_desde, fecha_hasta, texto, estado_comercial
        )
    if reporte == "asesoras":
        return _metricas_asesoras(db, usuario_actual, oficina_id, texto)
    return {}


def _scope_oficina(query, model, usuario_actual: Usuario):
    if usuario_actual.rol != "administrador":
        return query.filter(model.oficina_id == usuario_actual.oficina_id)
    return query


def _date_filter(query, column, desde: date | None, hasta: date | None):
    if desde is not None:
        query = query.filter(cast(column, Date) >= desde)
    if hasta is not None:
        query = query.filter(cast(column, Date) <= hasta)
    return query


def _metricas_pensionados(db, usuario_actual, oficina_id, desde, hasta, texto):
    query = _scope_oficina(db.query(Pensionado).filter(Pensionado.is_active == True), Pensionado, usuario_actual)  # noqa: E712
    if oficina_id is not None:
        query = query.filter(Pensionado.oficina_id == oficina_id)
    query = _date_filter(query, Pensionado.created_at, desde, hasta)
    if texto:
        term = f"%{texto.strip()}%"
        query = query.filter(or_(Pensionado.nombre_completo.ilike(term), Pensionado.documento.ilike(term), Pensionado.correo.ilike(term), Pensionado.telefono.ilike(term), Pensionado.celular.ilike(term)))
    total, oficinas, creadores = query.with_entities(func.count(Pensionado.id), func.count(func.distinct(Pensionado.oficina_id)), func.count(func.distinct(Pensionado.created_by))).one()
    inicio_mes = date.today().replace(day=1)
    mes = query.filter(cast(Pensionado.created_at, Date) >= inicio_mes).count()
    return {"pensionados": total or 0, "registradosMes": mes, "oficinas": oficinas or 0, "usuariosRegistradores": creadores or 0}


def _metricas_seguimientos(db, usuario_actual, oficina_id, desde, hasta, texto):
    query = _scope_oficina(db.query(Seguimiento).filter(Seguimiento.is_active == True), Seguimiento, usuario_actual)  # noqa: E712
    if oficina_id is not None:
        query = query.filter(Seguimiento.oficina_id == oficina_id)
    query = _date_filter(query, Seguimiento.created_at, desde, hasta)
    if texto:
        term = f"%{texto.strip()}%"
        query = query.outerjoin(Pensionado, Pensionado.id == Seguimiento.pensionado_id).outerjoin(Usuario, Usuario.id == Seguimiento.usuario_id).outerjoin(Oficina, Oficina.id == Seguimiento.oficina_id).filter(or_(Pensionado.nombre_completo.ilike(term), Seguimiento.tipo.ilike(term), Seguimiento.comentario.ilike(term), Seguimiento.resultado.ilike(term), Usuario.nombre.ilike(term), Oficina.nombre.ilike(term)))
    total, programados, con_resultado = query.with_entities(func.count(Seguimiento.id), func.sum(case((Seguimiento.fecha_proximo_contacto.isnot(None), 1), else_=0)), func.sum(case((Seguimiento.resultado.isnot(None), 1), else_=0))).one()
    return {"seguimientos": total or 0, "programados": programados or 0, "conResultado": con_resultado or 0, "sinResultado": (total or 0) - (con_resultado or 0)}


def _metricas_documentos(db, usuario_actual, oficina_id, desde, hasta, texto):
    query = db.query(Documento).join(Credito, Credito.id == Documento.credito_id).filter(Documento.is_active == True)  # noqa: E712
    if usuario_actual.rol != "administrador":
        query = query.filter(Credito.oficina_id == usuario_actual.oficina_id)
    if oficina_id is not None:
        query = query.filter(Credito.oficina_id == oficina_id)
    query = _date_filter(query, Documento.created_at, desde, hasta)
    if texto:
        term = f"%{texto.strip()}%"
        query = query.outerjoin(Pensionado, Pensionado.id == Credito.pensionado_id).filter(or_(Documento.nombre.ilike(term), Documento.tipo.ilike(term), cast(Documento.credito_id, String).ilike(term), Pensionado.nombre_completo.ilike(term)))
    total, pdf, creditos = query.with_entities(func.count(Documento.id), func.sum(case((Documento.tipo == "PDF", 1), else_=0)), func.count(func.distinct(Documento.credito_id))).one()
    return {"documentos": total or 0, "pdf": pdf or 0, "imagenes": (total or 0) - (pdf or 0), "creditosConDocs": creditos or 0}


def _metricas_pendientes(db, usuario_actual, oficina_id, desde, hasta, texto):
    query = db.query(PendienteCredito).join(Credito, Credito.id == PendienteCredito.credito_id)
    if usuario_actual.rol != "administrador":
        query = query.filter(Credito.oficina_id == usuario_actual.oficina_id)
    if oficina_id is not None:
        query = query.filter(Credito.oficina_id == oficina_id)
    query = _date_filter(query, PendienteCredito.created_at, desde, hasta)
    if texto:
        term = f"%{texto.strip()}%"
        query = query.filter(or_(cast(PendienteCredito.credito_id, String).ilike(term), PendienteCredito.descripcion.ilike(term), PendienteCredito.estado.ilike(term), PendienteCredito.origen.ilike(term)))
    total, abiertos, resueltos, creditos = query.with_entities(func.count(PendienteCredito.id), func.sum(case((PendienteCredito.estado == "pendiente", 1), else_=0)), func.sum(case((PendienteCredito.estado == "resuelto", 1), else_=0)), func.count(func.distinct(PendienteCredito.credito_id))).one()
    return {"pendientes": total or 0, "abiertos": abiertos or 0, "resueltos": resueltos or 0, "creditosAfectados": creditos or 0}


def _metricas_oficinas(db, usuario_actual, oficina_id):
    query = db.query(Oficina).filter(Oficina.is_active == True)  # noqa: E712
    if usuario_actual.rol != "administrador":
        query = query.filter(Oficina.id == usuario_actual.oficina_id)
    if oficina_id is not None:
        query = query.filter(Oficina.id == oficina_id)
    ids = [item.id for item in query.all()]
    creditos = db.query(Credito).filter(Credito.is_active == True, Credito.oficina_id.in_(ids)).count() if ids else 0  # noqa: E712
    seguimientos = db.query(Seguimiento).filter(Seguimiento.is_active == True, Seguimiento.oficina_id.in_(ids)).count() if ids else 0  # noqa: E712
    return {"oficinas": len(ids), "activas": len(ids), "creditos": creditos, "seguimientos": seguimientos}


def _metricas_refinanciaciones(db, usuario_actual, oficina_id, desde, hasta, texto, estado_comercial):
    query = db.query(OportunidadRefinanciacion).join(Credito, Credito.id == OportunidadRefinanciacion.credito_id)
    if usuario_actual.rol != "administrador":
        query = query.filter(OportunidadRefinanciacion.oficina_id == usuario_actual.oficina_id)
    if oficina_id is not None:
        query = query.filter(OportunidadRefinanciacion.oficina_id == oficina_id)
    if estado_comercial:
        query = query.filter(OportunidadRefinanciacion.estado == estado_comercial)
    query = _date_filter(query, OportunidadRefinanciacion.reactivar_en, desde, hasta)
    if texto:
        term = f"%{texto.strip()}%"
        query = query.outerjoin(Pensionado, Pensionado.id == Credito.pensionado_id).outerjoin(Cooperativa, Cooperativa.id == Credito.cooperativa_id).filter(or_(cast(Credito.id, String).ilike(term), Cooperativa.nombre.ilike(term), OportunidadRefinanciacion.estado.ilike(term), Pensionado.nombre_completo.ilike(term), Pensionado.documento.ilike(term)))
    total, disponibles, programadas, convertidas = query.with_entities(func.count(OportunidadRefinanciacion.id), func.sum(case((OportunidadRefinanciacion.estado == "disponible", 1), else_=0)), func.sum(case((OportunidadRefinanciacion.estado == "programado", 1), else_=0)), func.sum(case((OportunidadRefinanciacion.estado == "convertido", 1), else_=0))).one()
    return {"oportunidades": total or 0, "disponiblesAhora": disponibles or 0, "programadas": programadas or 0, "convertidas": convertidas or 0}


def _metricas_asesoras(db, usuario_actual, oficina_id, texto):
    query = db.query(Usuario).filter(Usuario.is_active == True, Usuario.rol.in_(["asesora", "administrador"]))  # noqa: E712
    if usuario_actual.rol != "administrador":
        query = query.filter(Usuario.oficina_id == usuario_actual.oficina_id)
    if oficina_id is not None:
        query = query.filter(Usuario.oficina_id == oficina_id)
    if texto:
        term = f"%{texto.strip()}%"
        query = query.outerjoin(Oficina, Oficina.id == Usuario.oficina_id).filter(or_(Usuario.nombre.ilike(term), Usuario.documento.ilike(term), Usuario.correo.ilike(term), Oficina.nombre.ilike(term)))
    ids = [item.id for item in query.all()]
    creditos_query = db.query(Credito).filter(Credito.is_active == True, Credito.asesor_id.in_(ids)) if ids else None  # noqa: E712
    soluciones = db.query(SeguimientoSolucion).filter(SeguimientoSolucion.usuario_id.in_(ids)).count() if ids else 0
    creditos = creditos_query.count() if creditos_query is not None else 0
    monto = creditos_query.filter(Credito.estado == "Aprobado").with_entities(func.coalesce(func.sum(Credito.monto_aprobado), 0)).scalar() if creditos_query is not None else 0
    return {"asesoras": len(ids), "activas": len(ids), "creditos": creditos, "soluciones": soluciones, "montoAprobado": float(monto or 0)}
