"""
refinanciacion_service.py
Lógica de negocio para refinanciaciones asociadas a créditos.
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
            detail=f"Crédito con id {credito_id} no encontrado",
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
            detail=f"Refinanciación con id {refinanciacion_id} no encontrada",
        )
    return refinanciacion


def crear_refinanciacion(
    db: Session, data: RefinanciacionCreate, usuario_actual: Usuario
) -> Refinanciacion:
    credito = _get_credito_activo_or_404(db, data.credito_id)
    if usuario_actual.rol != "administrador" and credito.oficina_id != usuario_actual.oficina_id:
        raise HTTPException(status_code=403, detail="No puedes operar créditos de otra oficina")
    if credito.estado != "Aprobado":
        raise HTTPException(status_code=422, detail="Solo los créditos aprobados pueden refinanciarse")
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
    db: Session, credito_id: int | None = None, usuario: Usuario | None = None
) -> list[Refinanciacion]:
    query = db.query(Refinanciacion).join(Credito)
    if usuario and usuario.rol != "administrador":
        query = query.filter(Credito.oficina_id == usuario.oficina_id)
    if credito_id is not None:
        query = query.filter(Refinanciacion.credito_id == credito_id)
    return query.order_by(Refinanciacion.created_at.desc()).all()


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


def _sumar_meses(fecha: date, meses: int) -> date:
    mes_total = fecha.month - 1 + meses
    year = fecha.year + mes_total // 12
    month = mes_total % 12 + 1
    dias_mes = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    day = min(fecha.day, dias_mes[month - 1])
    return date(year, month, day)


def listar_creditos_elegibles(db: Session, usuario_actual: Usuario | None = None, commit: bool = True) -> list[dict]:
    creditos = (
        db.query(Credito)
        .filter(
            Credito.estado == "Aprobado",
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
        regla = next(
            (
                regla
                for regla in credito.cooperativa.reglas_refinanciacion
                if regla.plazo_minimo <= credito.plazo <= regla.plazo_maximo
            ),
            None,
        )
        if regla is None:
            continue

        fecha_base = credito.fecha_desembolso or _fecha_aprobacion(db, credito.id)
        if fecha_base is None:
            continue

        meses_requeridos = regla.meses_para_refinanciar
        meses_transcurridos = _meses_desde(fecha_base)
        disponible_desde = _sumar_meses(fecha_base, meses_requeridos)

        oportunidad = db.query(OportunidadRefinanciacion).filter(OportunidadRefinanciacion.credito_id == credito.id).first()
        if oportunidad and oportunidad.estado == "rechazado" and oportunidad.reactivar_en and oportunidad.reactivar_en <= ahora:
            anterior = oportunidad.estado
            oportunidad.estado = "disponible"; oportunidad.reactivar_en = None
            db.add(HistorialOportunidadRefinanciacion(oportunidad_id=oportunidad.id, estado_anterior=anterior, estado_nuevo="disponible", justificacion="Reactivación automática a los 20 días"))
        if not oportunidad:
            oportunidad = OportunidadRefinanciacion(credito_id=credito.id, oficina_id=credito.oficina_id, responsable_id=credito.asesor_id, estado="disponible")
            db.add(oportunidad); db.flush()
            db.add(HistorialOportunidadRefinanciacion(oportunidad_id=oportunidad.id, estado_nuevo="disponible", justificacion="Crédito habilitado por regla de refinanciación"))
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
                "fecha_base": fecha_base,
                "disponible_desde": disponible_desde,
                "meses_transcurridos": meses_transcurridos,
                "meses_requeridos": meses_requeridos,
                "estado_refinanciacion": "Listo" if date.today() >= disponible_desde else "Programado",
                "oportunidad_id": oportunidad.id,
                "estado_comercial": oportunidad.estado if date.today() >= disponible_desde else "programado",
                "reactivar_en": oportunidad.reactivar_en,
                "credito_nuevo_id": oportunidad.credito_nuevo_id,
            }
        )
    if commit:
        db.commit()
    return elegibles


def cambiar_estado_oportunidad(db: Session, oportunidad_id: int, data: OportunidadEstadoUpdate, usuario: Usuario):
    q = db.query(OportunidadRefinanciacion).filter(OportunidadRefinanciacion.id == oportunidad_id)
    if usuario.rol != "administrador": q = q.filter(OportunidadRefinanciacion.oficina_id == usuario.oficina_id)
    oportunidad = q.first()
    if not oportunidad: raise HTTPException(status_code=404, detail="Oportunidad no encontrada")
    credito = oportunidad.credito
    regla = next((r for r in credito.cooperativa.reglas_refinanciacion if r.plazo_minimo <= credito.plazo <= r.plazo_maximo), None)
    fecha_base = credito.fecha_desembolso or _fecha_aprobacion(db, credito.id)
    if not regla or not fecha_base or date.today() < _sumar_meses(fecha_base, regla.meses_para_refinanciar):
        raise HTTPException(status_code=409, detail="La refinanciación todavía no está disponible según la regla de la cooperativa")
    if oportunidad.estado == "convertido": raise HTTPException(status_code=400, detail="Una oportunidad convertida no puede modificarse")
    if data.estado == "rechazado" and not data.justificacion:
        raise HTTPException(status_code=422, detail="Rechazar exige justificación")
    anterior = oportunidad.estado; oportunidad.estado = data.estado; oportunidad.justificacion = data.justificacion
    oportunidad.reactivar_en = datetime.now(timezone.utc) + timedelta(days=20) if data.estado == "rechazado" else None
    notificacion = db.query(Notificacion).filter(Notificacion.clave == f"refinanciacion-{oportunidad.credito_id}").first()
    if notificacion and data.estado == "rechazado":
        notificacion.estado = "resuelta"; notificacion.resuelta_en = datetime.now(timezone.utc); notificacion.resuelta_por = usuario.id
    elif notificacion and data.estado in ("disponible", "contactado", "aceptado"):
        notificacion.estado = "pendiente"; notificacion.resuelta_en = None; notificacion.resuelta_por = None
    db.add(HistorialOportunidadRefinanciacion(oportunidad_id=oportunidad.id, usuario_id=usuario.id, estado_anterior=anterior, estado_nuevo=data.estado, justificacion=data.justificacion))
    registrar_log(db, usuario.id, "oportunidades_refinanciacion", oportunidad.id, "cambiar_estado", {"estado": anterior}, {"estado": data.estado, "justificacion": data.justificacion})
    from app.services.notificacion_service import sincronizar_reglas

    sincronizar_reglas(db, commit=False)
    db.commit(); db.refresh(oportunidad); return {"id": oportunidad.id, "estado": oportunidad.estado, "reactivar_en": oportunidad.reactivar_en}


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
