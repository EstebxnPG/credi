"""
refinanciacion_service.py
Logica de negocio para refinanciaciones asociadas a creditos.
"""
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import Date, String, cast, func, or_, text
from sqlalchemy.orm import Session, selectinload

from app.db.models.cooperativa import Cooperativa, CooperativaRefinanciacionRegla
from app.db.models.credito import Credito
from app.db.models.historial_credito import HistorialCredito
from app.db.models.pensionado import Pensionado
from app.db.models.refinanciacion import Refinanciacion, OportunidadRefinanciacion, HistorialOportunidadRefinanciacion
from app.db.models.usuario import Usuario
from app.db.models.notificacion import Notificacion
from app.schemas.refinanciacion import RefinanciacionCreate, RefinanciacionUpdate, OportunidadEstadoUpdate
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


def _get_or_404(db: Session, refinanciacion_id: int, usuario: Usuario | None = None) -> Refinanciacion:
    query = db.query(Refinanciacion).join(Credito).filter(Refinanciacion.id == refinanciacion_id)
    if usuario and usuario.rol != "administrador":
        query = query.filter(Credito.oficina_id == usuario.oficina_id)
    refinanciacion = query.first()
    if not refinanciacion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Refinanciacion con id {refinanciacion_id} no encontrada",
        )
    return refinanciacion


def crear_refinanciacion(db: Session, data: RefinanciacionCreate, usuario_actual: Usuario) -> Refinanciacion:
    credito = _get_credito_activo_or_404(db, data.credito_id)
    if usuario_actual.rol != "administrador" and credito.oficina_id != usuario_actual.oficina_id:
        raise HTTPException(status_code=403, detail="No puedes operar creditos de otra oficina")
    validar_credito_refinanciable(db, credito)
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
    db: Session,
    credito_id: int | None = None,
    usuario: Usuario | None = None,
    skip: int = 0,
    limit: int = 15,
) -> list[Refinanciacion]:
    query = db.query(Refinanciacion).join(Credito)
    if usuario and usuario.rol != "administrador":
        query = query.filter(Credito.oficina_id == usuario.oficina_id)
    if credito_id is not None:
        query = query.filter(Refinanciacion.credito_id == credito_id)
    return query.order_by(Refinanciacion.created_at.desc()).offset(skip).limit(limit).all()


def _meses_desde(fecha_inicio: date, fecha_referencia: date | None = None) -> int:
    fecha_referencia = fecha_referencia or date.today()
    meses = (fecha_referencia.year - fecha_inicio.year) * 12 + (
        fecha_referencia.month - fecha_inicio.month
    )
    if fecha_referencia.day < fecha_inicio.day:
        meses -= 1
    return max(meses, 0)


def _fecha_aprobacion(db: Session, credito_id: int) -> date | None:
    historial = (
        db.query(HistorialCredito)
        .filter(
            HistorialCredito.credito_id == credito_id,
            HistorialCredito.estado_nuevo == "Aprobado",
        )
        .order_by(HistorialCredito.created_at.desc())
        .first()
    )
    return historial.created_at.date() if historial else None


def _fecha_base_refinanciacion(
    db: Session,
    credito: Credito,
    fecha_aprobacion: date | None = None,
) -> date | None:
    if credito.fecha_desembolso:
        return credito.fecha_desembolso
    fecha_aprobacion = fecha_aprobacion or _fecha_aprobacion(db, credito.id)
    if fecha_aprobacion:
        return fecha_aprobacion
    for campo in ("fecha_registro", "created_at"):
        valor = getattr(credito, campo, None)
        if isinstance(valor, datetime):
            return valor.date()
        if isinstance(valor, date):
            return valor
    return None


def _sumar_meses(fecha: date, meses: int) -> date:
    mes_total = fecha.month - 1 + meses
    year = fecha.year + mes_total // 12
    month = mes_total % 12 + 1
    dias_mes = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    day = min(fecha.day, dias_mes[month - 1])
    return date(year, month, day)


def _regla_refinanciacion_para_credito(credito: Credito):
    return next(
        (
            regla
            for regla in credito.cooperativa.reglas_refinanciacion
            if regla.plazo_minimo <= credito.plazo <= regla.plazo_maximo
        ),
        None,
    )


def _criterio_refinanciacion(
    db: Session,
    credito: Credito,
    fecha_aprobacion: date | None = None,
) -> dict | None:
    regla = _regla_refinanciacion_para_credito(credito)
    fecha_base = _fecha_base_refinanciacion(db, credito, fecha_aprobacion)
    if not regla or not fecha_base:
        return None

    meses_transcurridos = _meses_desde(fecha_base)
    tipo_liberacion = getattr(regla, "tipo_liberacion", "meses") or "meses"
    porcentaje_avance = round((meses_transcurridos / credito.plazo) * 100, 2) if credito.plazo else 0

    if tipo_liberacion == "porcentaje":
        porcentaje_requerido = float(regla.porcentaje_credito or 0)
        return {
            "fecha_base": fecha_base,
            "disponible_desde": date.today() if porcentaje_avance >= porcentaje_requerido else None,
            "meses_transcurridos": meses_transcurridos,
            "meses_requeridos": None,
            "tipo_liberacion": "porcentaje",
            "porcentaje_avance": porcentaje_avance,
            "porcentaje_requerido": porcentaje_requerido,
            "esta_disponible": porcentaje_avance >= porcentaje_requerido,
        }

    meses_requeridos = int(regla.meses_para_refinanciar or 0)
    disponible_desde = _sumar_meses(fecha_base, meses_requeridos)
    return {
        "fecha_base": fecha_base,
        "disponible_desde": disponible_desde,
        "meses_transcurridos": meses_transcurridos,
        "meses_requeridos": meses_requeridos,
        "tipo_liberacion": "meses",
        "porcentaje_avance": porcentaje_avance,
        "porcentaje_requerido": None,
        "esta_disponible": date.today() >= disponible_desde,
    }


def validar_credito_refinanciable(db: Session, credito: Credito) -> None:
    if credito.estado != "Aprobado" or not credito.is_active:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Solo los creditos aprobados y activos pueden refinanciarse",
        )
    if getattr(credito, "motivo_finalizacion", None) == "REFINANCIADO":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Un credito finalizado por refinanciacion no puede refinanciarse de nuevo",
        )
    if not credito.cooperativa or not credito.cooperativa.is_active:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La cooperativa del credito no esta activa",
        )

    criterio = _criterio_refinanciacion(db, credito)
    if not criterio:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La refinanciacion no esta disponible segun las reglas de la cooperativa",
        )

    if not criterio["esta_disponible"]:
        if criterio["tipo_liberacion"] == "porcentaje":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "La refinanciacion requiere "
                    f"{criterio['porcentaje_requerido']}% de avance del credito; "
                    f"avance actual {criterio['porcentaje_avance']}%"
                ),
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"La refinanciacion estara disponible desde {criterio['disponible_desde'].isoformat()} segun la regla de la cooperativa",
        )


def listar_creditos_elegibles(
    db: Session,
    usuario_actual: Usuario | None = None,
    commit: bool = True,
    skip: int = 0,
    limit: int | None = 15,
) -> list[dict]:
    creditos_query = (
        db.query(Credito)
        .options(
            selectinload(Credito.pensionado),
            selectinload(Credito.cooperativa),
            selectinload(Credito.cooperativa).selectinload(Cooperativa.reglas_refinanciacion),
        )
        .filter(
            Credito.estado == "Aprobado",
            Credito.is_active == True,  # noqa: E712
        )
        .order_by(Credito.fecha_desembolso.asc())
    )
    if usuario_actual and usuario_actual.rol != "administrador":
        creditos_query = creditos_query.filter(Credito.oficina_id == usuario_actual.oficina_id)

    elegibles = []
    ahora = datetime.now(timezone.utc)
    objetivo = None if limit is None else skip + limit
    batch_size = 250
    query_offset = 0

    while objetivo is None or len(elegibles) < objetivo:
        creditos = (
            creditos_query.offset(query_offset).limit(batch_size).all()
            if limit is not None
            else creditos_query.all()
        )
        if not creditos:
            break

        credito_ids = [credito.id for credito in creditos]
        aprobaciones = dict(
            db.query(
                HistorialCredito.credito_id,
                func.max(HistorialCredito.created_at),
            )
            .filter(
                HistorialCredito.credito_id.in_(credito_ids),
                HistorialCredito.estado_nuevo == "Aprobado",
            )
            .group_by(HistorialCredito.credito_id)
            .all()
        )
        oportunidades = {
            oportunidad.credito_id: oportunidad
            for oportunidad in db.query(OportunidadRefinanciacion)
            .filter(OportunidadRefinanciacion.credito_id.in_(credito_ids))
            .all()
        }

        for credito in creditos:
            if objetivo is not None and len(elegibles) >= objetivo:
                break
            if not credito.cooperativa or not credito.cooperativa.is_active:
                continue

            aprobacion = aprobaciones.get(credito.id)
            criterio = _criterio_refinanciacion(
                db,
                credito,
                aprobacion.date() if aprobacion else None,
            )
            if criterio is None:
                continue

            oportunidad = oportunidades.get(credito.id)
            if oportunidad and oportunidad.estado == "rechazado" and oportunidad.reactivar_en and oportunidad.reactivar_en <= ahora:
                anterior = oportunidad.estado
                oportunidad.estado = "disponible"
                oportunidad.reactivar_en = None
                db.add(HistorialOportunidadRefinanciacion(oportunidad_id=oportunidad.id, estado_anterior=anterior, estado_nuevo="disponible", justificacion="Reactivacion automatica a los 20 dias"))
            if not oportunidad:
                oportunidad = OportunidadRefinanciacion(credito_id=credito.id, oficina_id=credito.oficina_id, responsable_id=credito.asesor_id, estado="disponible")
                db.add(oportunidad)
                db.flush()
                oportunidades[credito.id] = oportunidad
                db.add(HistorialOportunidadRefinanciacion(oportunidad_id=oportunidad.id, estado_nuevo="disponible", justificacion="Credito habilitado por regla de refinanciacion"))

            esta_disponible = criterio["esta_disponible"]
            elegibles.append(
                {
                    "credito_id": credito.id,
                    "pensionado_id": credito.pensionado_id,
                    "pensionado_nombre": credito.pensionado.nombre_completo if credito.pensionado else None,
                    "documento": credito.pensionado.documento if credito.pensionado else None,
                    "cooperativa_id": credito.cooperativa_id,
                    "cooperativa_nombre": credito.cooperativa.nombre if credito.cooperativa else None,
                    "simulador_url": credito.cooperativa.simulador_url if credito.cooperativa else None,
                    "monto_aprobado": credito.monto_aprobado,
                    "plazo": credito.plazo,
                    "fecha_base": criterio["fecha_base"],
                    "disponible_desde": criterio["disponible_desde"] or date.today(),
                    "meses_transcurridos": criterio["meses_transcurridos"],
                    "meses_requeridos": criterio["meses_requeridos"],
                    "tipo_liberacion": criterio["tipo_liberacion"],
                    "porcentaje_avance": criterio["porcentaje_avance"],
                    "porcentaje_requerido": criterio["porcentaje_requerido"],
                    "estado_refinanciacion": "Listo" if esta_disponible else "Programado",
                    "oportunidad_id": oportunidad.id,
                    "estado_comercial": oportunidad.estado if esta_disponible else "programado",
                    "reactivar_en": oportunidad.reactivar_en,
                    "credito_nuevo_id": oportunidad.credito_nuevo_id,
                }
            )

        if limit is None:
            break
        query_offset += batch_size

    if commit:
        db.commit()
    return elegibles[skip : skip + limit] if limit is not None else elegibles[skip:]


def obtener_credito_elegible(
    db: Session,
    credito_id: int,
    usuario_actual: Usuario | None = None,
) -> dict | None:
    query = (
        db.query(Credito)
        .options(
            selectinload(Credito.pensionado),
            selectinload(Credito.cooperativa),
            selectinload(Credito.cooperativa).selectinload(Cooperativa.reglas_refinanciacion),
        )
        .filter(
            Credito.id == credito_id,
            Credito.estado == "Aprobado",
            Credito.is_active == True,  # noqa: E712
        )
    )
    if usuario_actual and usuario_actual.rol != "administrador":
        query = query.filter(Credito.oficina_id == usuario_actual.oficina_id)

    credito = query.first()
    if not credito or not credito.cooperativa or not credito.cooperativa.is_active:
        return None

    aprobacion = (
        db.query(func.max(HistorialCredito.created_at))
        .filter(
            HistorialCredito.credito_id == credito.id,
            HistorialCredito.estado_nuevo == "Aprobado",
        )
        .scalar()
    )
    criterio = _criterio_refinanciacion(
        db,
        credito,
        aprobacion.date() if aprobacion else None,
    )
    if criterio is None:
        return None

    ahora = datetime.now(timezone.utc)
    oportunidad = (
        db.query(OportunidadRefinanciacion)
        .filter(OportunidadRefinanciacion.credito_id == credito.id)
        .first()
    )
    if oportunidad and oportunidad.estado == "rechazado" and oportunidad.reactivar_en and oportunidad.reactivar_en <= ahora:
        anterior = oportunidad.estado
        oportunidad.estado = "disponible"
        oportunidad.reactivar_en = None
        db.add(HistorialOportunidadRefinanciacion(
            oportunidad_id=oportunidad.id,
            estado_anterior=anterior,
            estado_nuevo="disponible",
            justificacion="Reactivacion automatica a los 20 dias",
        ))
    if not oportunidad:
        oportunidad = OportunidadRefinanciacion(
            credito_id=credito.id,
            oficina_id=credito.oficina_id,
            responsable_id=credito.asesor_id,
            estado="disponible",
        )
        db.add(oportunidad)
        db.flush()
        db.add(HistorialOportunidadRefinanciacion(
            oportunidad_id=oportunidad.id,
            estado_nuevo="disponible",
            justificacion="Credito habilitado por regla de refinanciacion",
        ))

    esta_disponible = criterio["esta_disponible"]
    db.commit()
    return {
        "credito_id": credito.id,
        "pensionado_id": credito.pensionado_id,
        "pensionado_nombre": credito.pensionado.nombre_completo if credito.pensionado else None,
        "documento": credito.pensionado.documento if credito.pensionado else None,
        "cooperativa_id": credito.cooperativa_id,
        "cooperativa_nombre": credito.cooperativa.nombre if credito.cooperativa else None,
        "simulador_url": credito.cooperativa.simulador_url if credito.cooperativa else None,
        "monto_aprobado": credito.monto_aprobado,
        "plazo": credito.plazo,
        "fecha_base": criterio["fecha_base"],
        "disponible_desde": criterio["disponible_desde"] or date.today(),
        "meses_transcurridos": criterio["meses_transcurridos"],
        "meses_requeridos": criterio["meses_requeridos"],
        "tipo_liberacion": criterio["tipo_liberacion"],
        "porcentaje_avance": criterio["porcentaje_avance"],
        "porcentaje_requerido": criterio["porcentaje_requerido"],
        "estado_refinanciacion": "Listo" if esta_disponible else "Programado",
        "oportunidad_id": oportunidad.id,
        "estado_comercial": oportunidad.estado if esta_disponible else "programado",
        "reactivar_en": oportunidad.reactivar_en,
        "credito_nuevo_id": oportunidad.credito_nuevo_id,
    }


def _parse_date_filter(value: str | None, field_name: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"{field_name} debe tener formato YYYY-MM-DD") from exc


def _matches_vista(item: dict, vista: str) -> bool:
    if vista == "todos":
        return True
    if vista == "hoy":
        return item["estado_refinanciacion"] == "Listo" and item["estado_comercial"] not in {"convertido", "rechazado"}
    if vista == "proximos":
        return item["estado_comercial"] == "programado"
    if vista == "gestionados":
        return item["estado_comercial"] in {"contactado", "aceptado", "rechazado"}
    if vista == "convertidos":
        return item["estado_comercial"] == "convertido"
    raise HTTPException(status_code=422, detail="Vista de refinanciacion no valida")


def _conteos_por_vista(items: list[dict]) -> dict:
    return {
        "hoy": sum(1 for item in items if _matches_vista(item, "hoy")),
        "proximos": sum(1 for item in items if _matches_vista(item, "proximos")),
        "gestionados": sum(1 for item in items if _matches_vista(item, "gestionados")),
        "convertidos": sum(1 for item in items if _matches_vista(item, "convertidos")),
    }


def listar_creditos_elegibles_paginados(
    db: Session,
    usuario_actual: Usuario | None = None,
    skip: int = 0,
    limit: int = 15,
    vista: str = "todos",
    texto: str | None = None,
    monto_min: float | None = None,
    monto_max: float | None = None,
    fecha_desde: str | None = None,
    fecha_hasta: str | None = None,
    cooperativa_id: int | None = None,
) -> dict:
    fecha_min = _parse_date_filter(fecha_desde, "fecha_desde")
    fecha_max = _parse_date_filter(fecha_hasta, "fecha_hasta")
    term = (texto or "").strip().lower()

    aprobacion_subquery = (
        db.query(
            HistorialCredito.credito_id.label("credito_id"),
            func.max(HistorialCredito.created_at).label("aprobado_en"),
        )
        .filter(HistorialCredito.estado_nuevo == "Aprobado")
        .group_by(HistorialCredito.credito_id)
        .subquery()
    )
    fecha_base_expr = func.coalesce(
        Credito.fecha_desembolso,
        cast(aprobacion_subquery.c.aprobado_en, Date),
        cast(Credito.fecha_registro, Date),
        cast(Credito.created_at, Date),
    )
    disponible_desde_expr = fecha_base_expr + (
        CooperativaRefinanciacionRegla.meses_para_refinanciar * text("interval '1 month'")
    )

    query = (
        db.query(OportunidadRefinanciacion)
        .join(Credito, OportunidadRefinanciacion.credito_id == Credito.id)
        .join(Cooperativa, Credito.cooperativa_id == Cooperativa.id)
        .join(
            CooperativaRefinanciacionRegla,
            (CooperativaRefinanciacionRegla.cooperativa_id == Credito.cooperativa_id)
            & (CooperativaRefinanciacionRegla.plazo_minimo <= Credito.plazo)
            & (CooperativaRefinanciacionRegla.plazo_maximo >= Credito.plazo),
        )
        .outerjoin(aprobacion_subquery, aprobacion_subquery.c.credito_id == Credito.id)
        .join(Credito.pensionado)
        .options(
            selectinload(OportunidadRefinanciacion.credito).selectinload(Credito.pensionado),
            selectinload(OportunidadRefinanciacion.credito).selectinload(Credito.cooperativa),
            selectinload(OportunidadRefinanciacion.credito)
            .selectinload(Credito.cooperativa)
            .selectinload(Cooperativa.reglas_refinanciacion),
        )
        .filter(
            Credito.estado == "Aprobado",
            Credito.is_active == True,  # noqa: E712
            Cooperativa.is_active == True,  # noqa: E712
        )
    )

    if usuario_actual and usuario_actual.rol != "administrador":
        query = query.filter(Credito.oficina_id == usuario_actual.oficina_id)
    if cooperativa_id is not None:
        query = query.filter(Credito.cooperativa_id == cooperativa_id)
    if monto_min is not None:
        query = query.filter(Credito.monto_aprobado >= monto_min)
    if monto_max is not None:
        query = query.filter(Credito.monto_aprobado <= monto_max)
    if fecha_min is not None:
        query = query.filter(disponible_desde_expr >= fecha_min)
    if fecha_max is not None:
        query = query.filter(disponible_desde_expr <= fecha_max)
    if term:
        like_term = f"%{term}%"
        query = query.filter(
            or_(
                cast(Credito.id, String).ilike(like_term),
                Pensionado.nombre.ilike(like_term),
                Pensionado.segundo_nombre.ilike(like_term),
                Pensionado.apellidos.ilike(like_term),
                Pensionado.documento.ilike(like_term),
                Cooperativa.nombre.ilike(like_term),
            )
        )

    base_count_query = query

    today = date.today()
    if vista == "gestionados":
        query = query.filter(OportunidadRefinanciacion.estado.in_(["contactado", "aceptado", "rechazado"]))
    elif vista == "convertidos":
        query = query.filter(OportunidadRefinanciacion.estado == "convertido")
    elif vista == "hoy":
        query = query.filter(
            disponible_desde_expr <= today,
            OportunidadRefinanciacion.estado.notin_(["convertido", "rechazado"]),
        )
    elif vista == "proximos":
        query = query.filter(
            disponible_desde_expr > today,
            OportunidadRefinanciacion.estado.notin_(["convertido", "rechazado"]),
        )
    elif vista == "todos":
        query = query.filter(OportunidadRefinanciacion.estado.notin_(["convertido", "rechazado"]))
    else:
        raise HTTPException(status_code=422, detail="Vista de refinanciacion no valida")

    total = query.with_entities(func.count(func.distinct(OportunidadRefinanciacion.id))).scalar() or 0
    order_columns = (
        [disponible_desde_expr.asc(), OportunidadRefinanciacion.id.asc()]
        if vista in {"hoy", "proximos", "todos"}
        else [OportunidadRefinanciacion.updated_at.desc(), OportunidadRefinanciacion.id.desc()]
    )
    oportunidades = (
        query.order_by(*order_columns)
        .offset(skip)
        .limit(limit)
        .all()
    )
    credito_ids = [oportunidad.credito_id for oportunidad in oportunidades]
    aprobaciones = dict(
        db.query(
            HistorialCredito.credito_id,
            func.max(HistorialCredito.created_at),
        )
        .filter(
            HistorialCredito.credito_id.in_(credito_ids),
            HistorialCredito.estado_nuevo == "Aprobado",
        )
        .group_by(HistorialCredito.credito_id)
        .all()
    ) if credito_ids else {}

    ahora = datetime.now(timezone.utc)
    changed = False
    page_items = [
        item for oportunidad in oportunidades
        if (
            item := _oportunidad_to_elegible_item(
                db,
                oportunidad,
                aprobaciones,
                ahora,
            )
        )
    ]

    for item in page_items:
        changed = changed or bool(item.pop("_changed", False))

    if changed:
        db.commit()

    counts = _conteos_oportunidades(base_count_query, disponible_desde_expr, today)

    return {
        "items": page_items,
        "total": total,
        "counts": counts,
    }


def listar_oportunidades_credito_nuevo(
    db: Session,
    usuario_actual: Usuario | None = None,
    skip: int = 0,
    limit: int = 15,
    texto: str | None = None,
) -> dict:
    term = (texto or "").strip()

    finalizados_subquery = (
        db.query(
            Credito.pensionado_id.label("pensionado_id"),
            func.count(Credito.id).label("creditos_finalizados"),
            func.max(Credito.id).label("ultimo_credito_id"),
            func.max(Credito.fecha_fin_estimada).label("ultimo_credito_finalizado_en"),
            func.max(Credito.monto_aprobado).label("ultimo_monto_aprobado"),
        )
        .filter(
            Credito.estado == "Finalizado",
            Credito.is_active == True,  # noqa: E712
        )
        .group_by(Credito.pensionado_id)
        .subquery()
    )

    aprobados_subquery = (
        db.query(Credito.pensionado_id.label("pensionado_id"))
        .filter(
            Credito.estado == "Aprobado",
            Credito.is_active == True,  # noqa: E712
        )
        .group_by(Credito.pensionado_id)
        .subquery()
    )

    query = (
        db.query(
            Pensionado,
            finalizados_subquery.c.creditos_finalizados,
            finalizados_subquery.c.ultimo_credito_id,
            finalizados_subquery.c.ultimo_credito_finalizado_en,
            finalizados_subquery.c.ultimo_monto_aprobado,
        )
        .join(finalizados_subquery, finalizados_subquery.c.pensionado_id == Pensionado.id)
        .outerjoin(aprobados_subquery, aprobados_subquery.c.pensionado_id == Pensionado.id)
        .filter(
            Pensionado.is_active == True,  # noqa: E712
            aprobados_subquery.c.pensionado_id.is_(None),
        )
    )

    if usuario_actual and usuario_actual.rol != "administrador":
        query = query.filter(Pensionado.oficina_id == usuario_actual.oficina_id)

    if term:
        like_term = f"%{term}%"
        query = query.filter(
            or_(
                Pensionado.nombre.ilike(like_term),
                Pensionado.segundo_nombre.ilike(like_term),
                Pensionado.apellidos.ilike(like_term),
                Pensionado.documento.ilike(like_term),
                cast(Pensionado.id, String).ilike(like_term),
            )
        )

    total = query.count()
    rows = (
        query.order_by(
            finalizados_subquery.c.ultimo_credito_finalizado_en.desc().nullslast(),
            Pensionado.id.desc(),
        )
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {
        "items": [
            {
                "pensionado_id": pensionado.id,
                "pensionado_nombre": pensionado.nombre_completo,
                "documento": pensionado.documento,
                "oficina_id": pensionado.oficina_id,
                "ultimo_credito_id": ultimo_credito_id,
                "ultimo_credito_finalizado_en": ultimo_credito_finalizado_en,
                "ultimo_monto_aprobado": ultimo_monto_aprobado,
                "creditos_finalizados": creditos_finalizados,
            }
            for (
                pensionado,
                creditos_finalizados,
                ultimo_credito_id,
                ultimo_credito_finalizado_en,
                ultimo_monto_aprobado,
            ) in rows
        ],
        "total": total,
    }


def _conteos_oportunidades(query, disponible_desde_expr, today: date) -> dict:
    hoy = (
        query.filter(
            disponible_desde_expr <= today,
            OportunidadRefinanciacion.estado.notin_(["convertido", "rechazado"]),
        )
        .with_entities(func.count(func.distinct(OportunidadRefinanciacion.id)))
        .scalar()
        or 0
    )
    proximos = (
        query.filter(
            disponible_desde_expr > today,
            OportunidadRefinanciacion.estado.notin_(["convertido", "rechazado"]),
        )
        .with_entities(func.count(func.distinct(OportunidadRefinanciacion.id)))
        .scalar()
        or 0
    )
    gestionados = (
        query.filter(OportunidadRefinanciacion.estado.in_(["contactado", "aceptado", "rechazado"]))
        .with_entities(func.count(func.distinct(OportunidadRefinanciacion.id)))
        .scalar()
        or 0
    )
    convertidos = (
        query.filter(OportunidadRefinanciacion.estado == "convertido")
        .with_entities(func.count(func.distinct(OportunidadRefinanciacion.id)))
        .scalar()
        or 0
    )
    return {
        "hoy": hoy,
        "proximos": proximos,
        "gestionados": gestionados,
        "convertidos": convertidos,
    }


def _oportunidad_to_elegible_item(
    db: Session,
    oportunidad: OportunidadRefinanciacion,
    aprobaciones: dict[int, datetime],
    ahora: datetime,
) -> dict | None:
    credito = oportunidad.credito
    if not credito or not credito.cooperativa or not credito.cooperativa.is_active:
        return None

    aprobacion = aprobaciones.get(credito.id)
    criterio = _criterio_refinanciacion(
        db,
        credito,
        aprobacion.date() if aprobacion else None,
    )
    if criterio is None:
        return None

    changed = False
    if oportunidad.estado == "rechazado" and oportunidad.reactivar_en and oportunidad.reactivar_en <= ahora:
        anterior = oportunidad.estado
        oportunidad.estado = "disponible"
        oportunidad.reactivar_en = None
        db.add(HistorialOportunidadRefinanciacion(
            oportunidad_id=oportunidad.id,
            estado_anterior=anterior,
            estado_nuevo="disponible",
            justificacion="Reactivacion automatica a los 20 dias",
        ))
        changed = True

    esta_disponible = criterio["esta_disponible"]
    return {
        "credito_id": credito.id,
        "pensionado_id": credito.pensionado_id,
        "pensionado_nombre": credito.pensionado.nombre_completo if credito.pensionado else None,
        "documento": credito.pensionado.documento if credito.pensionado else None,
        "cooperativa_id": credito.cooperativa_id,
        "cooperativa_nombre": credito.cooperativa.nombre if credito.cooperativa else None,
        "simulador_url": credito.cooperativa.simulador_url if credito.cooperativa else None,
        "monto_aprobado": credito.monto_aprobado,
        "plazo": credito.plazo,
        "fecha_base": criterio["fecha_base"],
        "disponible_desde": criterio["disponible_desde"] or date.today(),
        "meses_transcurridos": criterio["meses_transcurridos"],
        "meses_requeridos": criterio["meses_requeridos"],
        "tipo_liberacion": criterio["tipo_liberacion"],
        "porcentaje_avance": criterio["porcentaje_avance"],
        "porcentaje_requerido": criterio["porcentaje_requerido"],
        "estado_refinanciacion": "Listo" if esta_disponible else "Programado",
        "oportunidad_id": oportunidad.id,
        "estado_comercial": oportunidad.estado if esta_disponible else "programado",
        "reactivar_en": oportunidad.reactivar_en,
        "credito_nuevo_id": oportunidad.credito_nuevo_id,
        "_changed": changed,
    }


def cambiar_estado_oportunidad(db: Session, oportunidad_id: int, data: OportunidadEstadoUpdate, usuario: Usuario):
    q = db.query(OportunidadRefinanciacion).filter(OportunidadRefinanciacion.id == oportunidad_id)
    if usuario.rol != "administrador":
        q = q.filter(OportunidadRefinanciacion.oficina_id == usuario.oficina_id)
    oportunidad = q.first()
    if not oportunidad:
        raise HTTPException(status_code=404, detail="Oportunidad no encontrada")
    credito = oportunidad.credito
    validar_credito_refinanciable(db, credito)
    if oportunidad.estado == "rechazado" and oportunidad.reactivar_en and oportunidad.reactivar_en > datetime.now(timezone.utc):
        raise HTTPException(status_code=409, detail="La oportunidad rechazada se reactivara en la fecha programada")
    if oportunidad.estado == "convertido":
        raise HTTPException(status_code=400, detail="Una oportunidad convertida no puede modificarse")
    if data.estado == "rechazado" and not data.justificacion:
        raise HTTPException(status_code=422, detail="Rechazar exige justificacion")

    anterior = oportunidad.estado
    oportunidad.estado = data.estado
    oportunidad.justificacion = data.justificacion
    oportunidad.reactivar_en = datetime.now(timezone.utc) + timedelta(days=20) if data.estado == "rechazado" else None
    notificacion = db.query(Notificacion).filter(Notificacion.clave == f"refinanciacion-{oportunidad.credito_id}").first()
    if notificacion and data.estado in ("aceptado", "rechazado"):
        notificacion.estado = "resuelta"
        notificacion.resuelta_en = datetime.now(timezone.utc)
        notificacion.resuelta_por = usuario.id
    elif notificacion and data.estado in ("disponible", "contactado"):
        notificacion.estado = "pendiente"
        notificacion.resuelta_en = None
        notificacion.resuelta_por = None
    db.add(HistorialOportunidadRefinanciacion(oportunidad_id=oportunidad.id, usuario_id=usuario.id, estado_anterior=anterior, estado_nuevo=data.estado, justificacion=data.justificacion))
    registrar_log(db, usuario.id, "oportunidades_refinanciacion", oportunidad.id, "cambiar_estado", {"estado": anterior}, {"estado": data.estado, "justificacion": data.justificacion})
    from app.services.notificacion_service import sincronizar_reglas

    sincronizar_reglas(db, commit=False)
    db.commit()
    db.refresh(oportunidad)
    return {"id": oportunidad.id, "estado": oportunidad.estado, "reactivar_en": oportunidad.reactivar_en}


def obtener_refinanciacion(db: Session, refinanciacion_id: int, usuario: Usuario) -> Refinanciacion:
    return _get_or_404(db, refinanciacion_id, usuario)


def actualizar_refinanciacion(
    db: Session,
    refinanciacion_id: int,
    data: RefinanciacionUpdate,
    usuario_actual: Usuario,
) -> Refinanciacion:
    refinanciacion = _get_or_404(db, refinanciacion_id, usuario_actual)
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
