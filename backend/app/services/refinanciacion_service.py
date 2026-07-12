"""
refinanciacion_service.py
Logica de negocio para refinanciaciones asociadas a creditos.
"""
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models.credito import Credito
from app.db.models.historial_credito import HistorialCredito
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


def _fecha_base_refinanciacion(db: Session, credito: Credito) -> date | None:
    if credito.fecha_desembolso:
        return credito.fecha_desembolso
    fecha_aprobacion = _fecha_aprobacion(db, credito.id)
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


def _criterio_refinanciacion(db: Session, credito: Credito) -> dict | None:
    regla = _regla_refinanciacion_para_credito(credito)
    fecha_base = _fecha_base_refinanciacion(db, credito)
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
    if credito.estado not in {"Aprobado", "Finalizado"} or not credito.is_active:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Solo los creditos aprobados y activos pueden refinanciarse",
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
    creditos = (
        db.query(Credito)
        .filter(
            Credito.estado.in_(["Aprobado", "Finalizado"]),
            Credito.is_active == True,  # noqa: E712
        )
        .order_by(Credito.fecha_desembolso.asc())
    )
    if usuario_actual and usuario_actual.rol != "administrador":
        creditos = creditos.filter(Credito.oficina_id == usuario_actual.oficina_id)
    creditos = creditos.all()

    elegibles = []
    ahora = datetime.now(timezone.utc)
    for credito in creditos:
        if not credito.cooperativa or not credito.cooperativa.is_active:
            continue

        criterio = _criterio_refinanciacion(db, credito)
        if criterio is None:
            continue

        oportunidad = db.query(OportunidadRefinanciacion).filter(OportunidadRefinanciacion.credito_id == credito.id).first()
        if oportunidad and oportunidad.estado == "rechazado" and oportunidad.reactivar_en and oportunidad.reactivar_en <= ahora:
            anterior = oportunidad.estado
            oportunidad.estado = "disponible"
            oportunidad.reactivar_en = None
            db.add(HistorialOportunidadRefinanciacion(oportunidad_id=oportunidad.id, estado_anterior=anterior, estado_nuevo="disponible", justificacion="Reactivacion automatica a los 20 dias"))
        if not oportunidad:
            oportunidad = OportunidadRefinanciacion(credito_id=credito.id, oficina_id=credito.oficina_id, responsable_id=credito.asesor_id, estado="disponible")
            db.add(oportunidad)
            db.flush()
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
    if commit:
        db.commit()
    return elegibles[skip : skip + limit] if limit is not None else elegibles[skip:]


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
