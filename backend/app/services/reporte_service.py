from datetime import date, datetime, timedelta
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from app.db.models.cooperativa import Cooperativa
from app.db.models.credito import Credito
from app.db.models.oficina import Oficina
from app.db.models.pensionado import Pensionado
from app.db.models.refinanciacion import Refinanciacion
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
