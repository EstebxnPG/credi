"""
refinanciacion_service.py
Lógica de negocio para refinanciaciones asociadas a créditos.
"""
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models.credito import Credito
from app.db.models.historial_credito import HistorialCredito
from app.db.models.refinanciacion import Refinanciacion
from app.db.models.usuario import Usuario
from app.schemas.refinanciacion import RefinanciacionCreate, RefinanciacionUpdate
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


def _get_or_404(db: Session, refinanciacion_id: int) -> Refinanciacion:
    refinanciacion = (
        db.query(Refinanciacion)
        .filter(Refinanciacion.id == refinanciacion_id)
        .first()
    )
    if not refinanciacion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Refinanciación con id {refinanciacion_id} no encontrada",
        )
    return refinanciacion


def crear_refinanciacion(
    db: Session, data: RefinanciacionCreate, usuario_actual: Usuario
) -> Refinanciacion:
    _get_credito_activo_or_404(db, data.credito_id)
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
    db: Session, credito_id: int | None = None
) -> list[Refinanciacion]:
    query = db.query(Refinanciacion)
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


def listar_creditos_elegibles(db: Session) -> list[dict]:
    creditos = (
        db.query(Credito)
        .filter(
            Credito.estado == "Aprobado",
            Credito.is_active == True,  # noqa: E712
        )
        .order_by(Credito.fecha_desembolso.asc())
        .all()
    )

    elegibles = []
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

        elegibles.append(
            {
                "credito_id": credito.id,
                "pensionado_id": credito.pensionado_id,
                "pensionado_nombre": credito.pensionado.nombre_completo if credito.pensionado else None,
                "documento": credito.pensionado.documento if credito.pensionado else None,
                "cooperativa_id": credito.cooperativa_id,
                "cooperativa_nombre": credito.cooperativa.nombre if credito.cooperativa else None,
                "monto_aprobado": credito.monto_aprobado,
                "plazo": credito.plazo,
                "fecha_base": fecha_base,
                "disponible_desde": disponible_desde,
                "meses_transcurridos": meses_transcurridos,
                "meses_requeridos": meses_requeridos,
                "estado_refinanciacion": "Listo" if date.today() >= disponible_desde else "Programado",
            }
        )
    return elegibles


def obtener_refinanciacion(db: Session, refinanciacion_id: int) -> Refinanciacion:
    return _get_or_404(db, refinanciacion_id)


def actualizar_refinanciacion(
    db: Session,
    refinanciacion_id: int,
    data: RefinanciacionUpdate,
    usuario_actual: Usuario,
) -> Refinanciacion:
    refinanciacion = _get_or_404(db, refinanciacion_id)
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
