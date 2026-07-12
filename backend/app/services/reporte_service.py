from collections import Counter
from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session

from app.db.models.credito import Credito
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
    inicio_mes = date(hoy.year, hoy.month, 1)

    creditos = _base_creditos_query(db, usuario_actual).all()
    creditos_mes = [
        credito for credito in creditos
        if credito.fecha_registro and credito.fecha_registro.date() >= inicio_mes
    ]
    aprobados = [credito for credito in creditos if credito.estado == "Aprobado"]
    aprobados_mes = [
        credito for credito in aprobados
        if credito.fecha_registro and credito.fecha_registro.date() >= inicio_mes
    ]
    activos = [credito for credito in creditos if credito.estado in ESTADOS_ACTIVOS]
    estados = Counter(credito.estado for credito in creditos)

    total = len(creditos)
    total_aprobados = len(aprobados)
    tasa_aprobacion = (total_aprobados / total * 100) if total else 0

    asesora_counter = Counter()
    oficina_counter = Counter()
    cooperativa_aprobados = Counter()
    cooperativa_totales = Counter()

    for credito in creditos:
        if credito.asesor:
            asesora_counter[credito.asesor.nombre] += 1
        if credito.oficina:
            oficina_counter[credito.oficina.nombre] += 1
        if credito.cooperativa:
            cooperativa_totales[credito.cooperativa.nombre] += 1
            if credito.estado == "Aprobado":
                cooperativa_aprobados[credito.cooperativa.nombre] += 1

    tasas_cooperativa = []
    for nombre, total_cooperativa in cooperativa_totales.items():
        aprobados_cooperativa = cooperativa_aprobados[nombre]
        tasas_cooperativa.append({
            "nombre": nombre,
            "total": total_cooperativa,
            "aprobados": aprobados_cooperativa,
            "tasa_aprobacion": round((aprobados_cooperativa / total_cooperativa) * 100, 2),
        })

    tasas_cooperativa.sort(key=lambda item: item["tasa_aprobacion"], reverse=True)

    pensionados_query = db.query(Pensionado).filter(Pensionado.is_active == True)  # noqa: E712
    if usuario_actual.rol != "administrador":
        pensionados_query = pensionados_query.filter(Pensionado.oficina_id == usuario_actual.oficina_id)
    pensionados = pensionados_query.all()
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

    refinanciaciones = refinanciaciones_query.all()

    return {
        "generado_en": datetime.now().isoformat(),
        "alcance": "global" if usuario_actual.rol == "administrador" else "asesora",
        "kpis": {
            "creditos_total": total,
            "creditos_mes": len(creditos_mes),
            "creditos_activos": len(activos),
            "creditos_aprobados": total_aprobados,
            "creditos_aprobados_mes": len(aprobados_mes),
            "tasa_aprobacion": round(tasa_aprobacion, 2),
            "refinanciaciones": len(refinanciaciones),
            "cumpleanos_30_dias": len(cumpleanos),
        },
        "creditos_por_estado": [
            {"estado": estado, "total": total_estado}
            for estado, total_estado in sorted(estados.items())
        ],
        "productividad_asesoras": [
            {"nombre": nombre, "creditos": total_asesora}
            for nombre, total_asesora in asesora_counter.most_common()
        ],
        "productividad_oficinas": [
            {"nombre": nombre, "creditos": total_oficina}
            for nombre, total_oficina in oficina_counter.most_common()
        ],
        "cooperativas": tasas_cooperativa,
        "cumpleanos_proximos": cumpleanos[:10],
    }
