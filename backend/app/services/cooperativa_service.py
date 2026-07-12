from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models.cooperativa import Cooperativa, CooperativaRefinanciacionRegla
from app.schemas.cooperativa import CooperativaCreate, CooperativaUpdate


def _regla_model_payload(regla) -> dict:
    payload = regla if isinstance(regla, dict) else regla.model_dump()
    return {
        "plazo_minimo": payload["plazo_minimo"],
        "plazo_maximo": payload["plazo_maximo"],
        "meses_para_refinanciar": payload.get("meses_para_refinanciar") or 1,
    }


def _get_or_404(db: Session, cooperativa_id: int) -> Cooperativa:
    cooperativa = db.query(Cooperativa).filter(Cooperativa.id == cooperativa_id).first()
    if not cooperativa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cooperativa con id {cooperativa_id} no encontrada",
        )
    return cooperativa


def _nombre_duplicado(db: Session, nombre: str, exclude_id: int | None = None) -> bool:
    query = db.query(Cooperativa).filter(Cooperativa.nombre.ilike(nombre.strip()))
    if exclude_id:
        query = query.filter(Cooperativa.id != exclude_id)
    return query.first() is not None


def crear_cooperativa(db: Session, data: CooperativaCreate) -> Cooperativa:
    if _nombre_duplicado(db, data.nombre):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe una cooperativa con el nombre '{data.nombre}'",
        )

    payload = data.model_dump()
    reglas = payload.pop("reglas_refinanciacion", [])
    cooperativa = Cooperativa(**payload)
    cooperativa.reglas_refinanciacion = [
        CooperativaRefinanciacionRegla(**_regla_model_payload(regla)) for regla in reglas
    ]
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
    reglas = cambios.pop("reglas_refinanciacion", None)

    if "nombre" in cambios and _nombre_duplicado(
        db, cambios["nombre"], exclude_id=cooperativa_id
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe otra cooperativa con el nombre '{cambios['nombre']}'",
        )

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
    if reglas is not None:
        for regla in reglas:
            regla_plazo_min = regla["plazo_minimo"] if isinstance(regla, dict) else regla.plazo_minimo
            regla_plazo_max = regla["plazo_maximo"] if isinstance(regla, dict) else regla.plazo_maximo
            if regla_plazo_min < plazo_min or regla_plazo_max > plazo_max:
                raise HTTPException(
                    status_code=400,
                    detail="Las reglas de refinanciacion deben estar dentro del rango de plazo de la cooperativa",
                )

    for campo, valor in cambios.items():
        setattr(cooperativa, campo, valor)

    if reglas is not None:
        cooperativa.reglas_refinanciacion = [
            CooperativaRefinanciacionRegla(**_regla_model_payload(regla)) for regla in reglas
        ]

    db.commit()
    db.refresh(cooperativa)
    return cooperativa


def desactivar_cooperativa(db: Session, cooperativa_id: int) -> Cooperativa:
    cooperativa = _get_or_404(db, cooperativa_id)
    if not cooperativa.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La cooperativa ya esta desactivada",
        )

    cooperativa.is_active = False
    db.commit()
    db.refresh(cooperativa)
    return cooperativa


def validar_credito_contra_cooperativa(
    cooperativa: Cooperativa,
    edad_pensionado: int,
    monto: float,
    plazo: int,
) -> list[str]:
    errores = []

    if edad_pensionado < cooperativa.edad_minima:
        errores.append(
            f"El pensionado tiene {edad_pensionado} anos; "
            f"minimo requerido: {cooperativa.edad_minima}"
        )
    if edad_pensionado > cooperativa.edad_maxima:
        errores.append(
            f"El pensionado tiene {edad_pensionado} anos; "
            f"maximo permitido: {cooperativa.edad_maxima}"
        )
    if monto < cooperativa.monto_minimo:
        errores.append(
            f"Monto ${monto:,.0f} inferior al minimo ${cooperativa.monto_minimo:,.0f}"
        )
    if monto > cooperativa.monto_maximo:
        errores.append(
            f"Monto ${monto:,.0f} superior al maximo ${cooperativa.monto_maximo:,.0f}"
        )
    if plazo < cooperativa.plazo_minimo:
        errores.append(
            f"Plazo {plazo} meses inferior al minimo {cooperativa.plazo_minimo}"
        )
    if plazo > cooperativa.plazo_maximo:
        errores.append(
            f"Plazo {plazo} meses superior al maximo {cooperativa.plazo_maximo}"
        )

    return errores
