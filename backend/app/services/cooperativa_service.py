"""
cooperativa_service.py
Lógica de negocio de Cooperativas.
Incluye validación de reglas de negocio según el SRS.
"""
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.db.models.cooperativa import Cooperativa
from app.schemas.cooperativa import CooperativaCreate, CooperativaUpdate


# ─── Helpers internos ────────────────────────────────────────────────────────

def _get_or_404(db: Session, cooperativa_id: int) -> Cooperativa:
    coop = db.query(Cooperativa).filter(Cooperativa.id == cooperativa_id).first()
    if not coop:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cooperativa con id {cooperativa_id} no encontrada",
        )
    return coop


def _nombre_duplicado(db: Session, nombre: str, exclude_id: int | None = None) -> bool:
    query = db.query(Cooperativa).filter(Cooperativa.nombre.ilike(nombre.strip()))
    if exclude_id:
        query = query.filter(Cooperativa.id != exclude_id)
    return query.first() is not None


# ─── CRUD ────────────────────────────────────────────────────────────────────

def crear_cooperativa(db: Session, data: CooperativaCreate) -> Cooperativa:
    if _nombre_duplicado(db, data.nombre):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe una cooperativa con el nombre '{data.nombre}'",
        )
    cooperativa = Cooperativa(**data.model_dump())
    db.add(cooperativa)
    db.commit()
    db.refresh(cooperativa)
    return cooperativa


def listar_cooperativas(db: Session, solo_activas: bool = True) -> list[Cooperativa]:
    query = db.query(Cooperativa)
    if solo_activas:
        query = query.filter(Cooperativa.is_active == True)  # noqa: E712
    return query.order_by(Cooperativa.nombre).all()


def obtener_cooperativa(db: Session, cooperativa_id: int) -> Cooperativa:
    return _get_or_404(db, cooperativa_id)


def actualizar_cooperativa(
    db: Session, cooperativa_id: int, data: CooperativaUpdate
) -> Cooperativa:
    cooperativa = _get_or_404(db, cooperativa_id)
    cambios = data.model_dump(exclude_unset=True)

    if "nombre" in cambios and _nombre_duplicado(db, cambios["nombre"], exclude_id=cooperativa_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe otra cooperativa con el nombre '{cambios['nombre']}'",
        )

    # Validar coherencia de rangos si se actualizan parcialmente
    # Necesitamos los valores actuales + los nuevos para validar
    edad_min = cambios.get("edad_minima", cooperativa.edad_minima)
    edad_max = cambios.get("edad_maxima", cooperativa.edad_maxima)
    monto_min = cambios.get("monto_minimo", cooperativa.monto_minimo)
    monto_max = cambios.get("monto_maximo", cooperativa.monto_maximo)
    plazo_min = cambios.get("plazo_minimo", cooperativa.plazo_minimo)
    plazo_max = cambios.get("plazo_maximo", cooperativa.plazo_maximo)

    if edad_min >= edad_max:
        raise HTTPException(status_code=400, detail="edad_minima debe ser menor que edad_maxima")
    if monto_min >= monto_max:
        raise HTTPException(status_code=400, detail="monto_minimo debe ser menor que monto_maximo")
    if plazo_min >= plazo_max:
        raise HTTPException(status_code=400, detail="plazo_minimo debe ser menor que plazo_maximo")

    for campo, valor in cambios.items():
        setattr(cooperativa, campo, valor)

    db.commit()
    db.refresh(cooperativa)
    return cooperativa


def desactivar_cooperativa(db: Session, cooperativa_id: int) -> Cooperativa:
    """Soft delete. Los créditos existentes NO se ven afectados."""
    cooperativa = _get_or_404(db, cooperativa_id)
    if not cooperativa.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La cooperativa ya está desactivada",
        )
    cooperativa.is_active = False
    db.commit()
    db.refresh(cooperativa)
    return cooperativa


# ─── Función reutilizable para validar créditos (usada en credito_service) ──

def validar_credito_contra_cooperativa(
    cooperativa: Cooperativa,
    edad_pensionado: int,
    monto: float,
    plazo: int,
    meses_como_pensionado: int,
) -> list[str]:
    """
    Retorna lista de errores de validación.
    Lista vacía = válido.
    Esta función encapsula la Regla de Negocio 6 del SRS.
    """
    errores = []

    if edad_pensionado < cooperativa.edad_minima:
        errores.append(
            f"El pensionado tiene {edad_pensionado} años; "
            f"mínimo requerido: {cooperativa.edad_minima}"
        )
    if edad_pensionado > cooperativa.edad_maxima:
        errores.append(
            f"El pensionado tiene {edad_pensionado} años; "
            f"máximo permitido: {cooperativa.edad_maxima}"
        )
    if monto < cooperativa.monto_minimo:
        errores.append(
            f"Monto ${monto:,.0f} inferior al mínimo ${cooperativa.monto_minimo:,.0f}"
        )
    if monto > cooperativa.monto_maximo:
        errores.append(
            f"Monto ${monto:,.0f} superior al máximo ${cooperativa.monto_maximo:,.0f}"
        )
    if plazo < cooperativa.plazo_minimo:
        errores.append(
            f"Plazo {plazo} meses inferior al mínimo {cooperativa.plazo_minimo}"
        )
    if plazo > cooperativa.plazo_maximo:
        errores.append(
            f"Plazo {plazo} meses superior al máximo {cooperativa.plazo_maximo}"
        )
    if meses_como_pensionado < cooperativa.tiempo_minimo_pension:
        errores.append(
            f"El pensionado lleva {meses_como_pensionado} meses; "
            f"mínimo requerido: {cooperativa.tiempo_minimo_pension} meses"
        )

    return errores
