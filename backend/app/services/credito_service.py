"""
credito_service.py
Lógica de negocio de Créditos.
Implementa CRUD, validación contra cooperativa y máquina de estados.
"""
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.models.cooperativa import Cooperativa
from app.db.models.credito import Credito
from app.db.models.historial_credito import HistorialCredito
from app.db.models.oficina import Oficina
from app.db.models.pagaduria import Pagaduria
from app.db.models.pensionado import Pensionado
from app.db.models.usuario import Usuario
from app.db.models.refinanciacion import OportunidadRefinanciacion, HistorialOportunidadRefinanciacion
from app.db.models.notificacion import Notificacion
from app.schemas.credito import (
    CreditoCambioEstado,
    CreditoCreate,
    CreditoUpdate,
    TRANSICIONES_VALIDAS,
)
from app.schemas.historial_credito import HistorialCreditoRead
from app.services.cooperativa_service import validar_credito_contra_cooperativa
from app.services.log_service import registrar_log
from app.services.pendiente_credito_service import credito_tiene_pendientes_abiertos


ESTADOS_EDITABLES = {"Prospecto", "Devuelto por corrección"}
ESTADOS_FINALES = {"Aprobado", "Rechazado"}


def _calcular_edad(fecha_nacimiento: date, fecha_referencia: date | None = None) -> int:
    fecha_referencia = fecha_referencia or date.today()
    return fecha_referencia.year - fecha_nacimiento.year - (
        (fecha_referencia.month, fecha_referencia.day)
        < (fecha_nacimiento.month, fecha_nacimiento.day)
    )


def _get_credito_or_404(db: Session, credito_id: int) -> Credito:
    credito = db.query(Credito).filter(Credito.id == credito_id).first()
    if not credito:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Crédito con id {credito_id} no encontrado",
        )
    return credito


def _get_pensionado_activo_or_404(db: Session, pensionado_id: int) -> Pensionado:
    pensionado = (
        db.query(Pensionado)
        .filter(Pensionado.id == pensionado_id, Pensionado.is_active == True)  # noqa: E712
        .first()
    )
    if not pensionado:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pensionado con id {pensionado_id} no encontrado",
        )
    return pensionado


def _get_usuario_activo_or_404(db: Session, usuario_id: int) -> Usuario:
    usuario = (
        db.query(Usuario)
        .filter(Usuario.id == usuario_id, Usuario.is_active == True)  # noqa: E712
        .first()
    )
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Usuario con id {usuario_id} no encontrado",
        )
    return usuario


def _get_oficina_activa_or_404(db: Session, oficina_id: int) -> Oficina:
    oficina = (
        db.query(Oficina)
        .filter(Oficina.id == oficina_id, Oficina.is_active == True)  # noqa: E712
        .first()
    )
    if not oficina:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Oficina con id {oficina_id} no encontrada",
        )
    return oficina


def _get_cooperativa_activa_or_404(db: Session, cooperativa_id: int) -> Cooperativa:
    cooperativa = (
        db.query(Cooperativa)
        .filter(
            Cooperativa.id == cooperativa_id,
            Cooperativa.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not cooperativa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cooperativa con id {cooperativa_id} no encontrada",
        )
    return cooperativa


def _get_pagaduria_activa_or_404(db: Session, pagaduria_id: int) -> Pagaduria:
    pagaduria = (
        db.query(Pagaduria)
        .filter(Pagaduria.id == pagaduria_id, Pagaduria.is_active == True)  # noqa: E712
        .first()
    )
    if not pagaduria:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pagaduría con id {pagaduria_id} no encontrada",
        )
    return pagaduria


def _registrar_historial(
    db: Session,
    credito_id: int,
    usuario_id: int,
    estado_anterior: str | None,
    estado_nuevo: str,
    observacion: str | None = None,
) -> None:
    historial = HistorialCredito(
        credito_id=credito_id,
        usuario_id=usuario_id,
        estado_anterior=estado_anterior,
        estado_nuevo=estado_nuevo,
        observacion=observacion,
    )
    db.add(historial)


def _validar_reglas_credito(
    db: Session,
    pensionado_id: int,
    cooperativa_id: int,
    monto: float,
    plazo: int,
) -> None:
    pensionado = _get_pensionado_activo_or_404(db, pensionado_id)
    cooperativa = _get_cooperativa_activa_or_404(db, cooperativa_id)

    edad = _calcular_edad(pensionado.fecha_nacimiento)
    errores = validar_credito_contra_cooperativa(
        cooperativa=cooperativa,
        edad_pensionado=edad,
        monto=monto,
        plazo=plazo,
    )

    if errores:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=errores,
        )


def _validar_contexto_creacion(
    data: CreditoCreate,
    usuario_actual: Usuario,
    asesor: Usuario,
) -> None:
    if asesor.rol != "asesora" and asesor.rol != "administrador":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El usuario asignado como asesor no tiene un rol válido",
        )

    if usuario_actual.rol == "asesora":
        if data.asesor_id != usuario_actual.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Una asesora solo puede crear créditos a su nombre",
            )
        if data.oficina_id != usuario_actual.oficina_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Una asesora solo puede crear créditos para su oficina",
            )


def _validar_tipo_credito(
    db: Session,
    pensionado_id: int,
    tipo_credito: str | None,
    credito_refinanciado_id: int | None,
    entidad_financiera_origen: str | None,
) -> None:
    if tipo_credito == "Nuevo":
        if credito_refinanciado_id or entidad_financiera_origen:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Un credito nuevo no debe tener credito anterior ni entidad financiera de origen",
            )
        return

    if tipo_credito == "Compra de cartera":
        if credito_refinanciado_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Una compra de cartera no debe apuntar a un credito interno",
            )
        if not entidad_financiera_origen:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Debes indicar la entidad financiera de origen",
            )
        return

    if not credito_refinanciado_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes seleccionar el credito anterior que se refinancia",
        )
    if entidad_financiera_origen:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Una refinanciacion interna no debe tener entidad financiera de origen",
        )
    credito_anterior = (
        db.query(Credito)
        .filter(
            Credito.id == credito_refinanciado_id,
            Credito.pensionado_id == pensionado_id,
            Credito.estado == "Aprobado",
            Credito.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not credito_anterior:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El credito refinanciado debe ser aprobado y pertenecer al mismo pensionado",
        )
    duplicado = db.query(Credito.id).filter(
        Credito.credito_refinanciado_id == credito_refinanciado_id,
        Credito.is_active == True,  # noqa: E712
    ).first()
    if duplicado:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este credito ya tiene una refinanciacion asociada",
        )


def _validar_credito_editable(credito: Credito) -> None:
    if credito.estado in ESTADOS_FINALES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un crédito aprobado o rechazado no puede editarse",
        )
    if credito.estado not in ESTADOS_EDITABLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden editar créditos en Prospecto o Devuelto por corrección",
        )


def _normalizar_pendientes_documentales(
    tiene_documentos_pendientes: bool | None,
    documentos_pendientes: str | None,
) -> tuple[bool | None, str | None]:
    if documentos_pendientes is not None:
        lineas = [linea.strip() for linea in documentos_pendientes.splitlines() if linea.strip()]
        documentos_pendientes = "\n".join(lineas) or None

    if tiene_documentos_pendientes is False:
        return False, None

    if tiene_documentos_pendientes is True and not documentos_pendientes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes indicar cuales documentos estan pendientes",
        )

    if tiene_documentos_pendientes is None:
        return None, documentos_pendientes

    return True, documentos_pendientes


def crear_credito(db: Session, data: CreditoCreate, usuario_actual: Usuario) -> Credito:
    asesor = _get_usuario_activo_or_404(db, data.asesor_id)
    _get_oficina_activa_or_404(db, data.oficina_id)
    _get_pagaduria_activa_or_404(db, data.pagaduria_id)
    _validar_contexto_creacion(data, usuario_actual, asesor)
    _validar_tipo_credito(
        db,
        data.pensionado_id,
        data.tipo_credito,
        data.credito_refinanciado_id,
        data.entidad_financiera_origen,
    )
    _validar_reglas_credito(
        db=db,
        pensionado_id=data.pensionado_id,
        cooperativa_id=data.cooperativa_id,
        monto=data.monto_solicitado,
        plazo=data.plazo,
    )

    tiene_documentos_pendientes, documentos_pendientes = _normalizar_pendientes_documentales(
        data.tiene_documentos_pendientes,
        data.documentos_pendientes,
    )

    payload = data.model_dump()
    payload["tiene_documentos_pendientes"] = bool(tiene_documentos_pendientes)
    payload["documentos_pendientes"] = documentos_pendientes

    credito = Credito(**payload, estado="Prospecto")
    db.add(credito)
    db.flush()

    if credito.tipo_credito == "Refinanciacion" and credito.credito_refinanciado_id:
        oportunidad = db.query(OportunidadRefinanciacion).filter(
            OportunidadRefinanciacion.credito_id == credito.credito_refinanciado_id
        ).first()
        if oportunidad:
            anterior = oportunidad.estado
            oportunidad.estado = "convertido"
            oportunidad.credito_nuevo_id = credito.id
            oportunidad.reactivar_en = None
            db.add(HistorialOportunidadRefinanciacion(
                oportunidad_id=oportunidad.id, usuario_id=usuario_actual.id,
                estado_anterior=anterior, estado_nuevo="convertido",
                justificacion=f"Credito #{credito.id} creado",
            ))
        db.query(Notificacion).filter(
            Notificacion.clave == f"refinanciacion-{credito.credito_refinanciado_id}"
        ).update({Notificacion.estado: "resuelta", Notificacion.resuelta_en: datetime.now(timezone.utc), Notificacion.resuelta_por: usuario_actual.id}, synchronize_session=False)

    _registrar_historial(
        db=db,
        credito_id=credito.id,
        usuario_id=usuario_actual.id,
        estado_anterior=None,
        estado_nuevo=credito.estado,
        observacion="Crédito creado",
    )

    registrar_log(
        db=db,
        usuario_id=usuario_actual.id,
        tabla_afectada="creditos",
        registro_afectado=credito.id,
        tipo_accion="crear",
        valores_despues={**payload, "estado": "Prospecto"},
    )

    db.commit()
    db.refresh(credito)
    return credito


def listar_creditos(
    db: Session,
    pensionado_id: int | None = None,
    asesor_id: int | None = None,
    oficina_id: int | None = None,
    estado: str | None = None,
) -> list[Credito]:
    query = db.query(Credito).filter(Credito.is_active == True)  # noqa: E712

    if pensionado_id is not None:
        query = query.filter(Credito.pensionado_id == pensionado_id)
    if asesor_id is not None:
        query = query.filter(Credito.asesor_id == asesor_id)
    if oficina_id is not None:
        query = query.filter(Credito.oficina_id == oficina_id)
    if estado is not None:
        query = query.filter(Credito.estado == estado)

    return query.order_by(Credito.created_at.desc()).all()


def obtener_credito(db: Session, credito_id: int) -> Credito:
    credito = _get_credito_or_404(db, credito_id)
    if not credito.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Crédito con id {credito_id} no encontrado",
        )
    return credito


def obtener_historial_credito(
    db: Session, credito_id: int
) -> list[HistorialCreditoRead]:
    obtener_credito(db, credito_id)
    historial = (
        db.query(HistorialCredito)
        .filter(HistorialCredito.credito_id == credito_id)
        .order_by(HistorialCredito.created_at.asc(), HistorialCredito.id.asc())
        .all()
    )

    return [
        HistorialCreditoRead(
            id=item.id,
            credito_id=item.credito_id,
            usuario_id=item.usuario_id,
            usuario_nombre=item.usuario.nombre if item.usuario else None,
            estado_anterior=item.estado_anterior,
            estado_nuevo=item.estado_nuevo,
            observacion=item.observacion,
            created_at=item.created_at,
        )
        for item in historial
    ]


def actualizar_credito(
    db: Session,
    credito_id: int,
    data: CreditoUpdate,
    usuario_actual: Usuario,
) -> Credito:
    credito = obtener_credito(db, credito_id)
    _validar_credito_editable(credito)

    cambios = data.model_dump(exclude_unset=True)
    if not cambios:
        return credito

    valores_antes = {
        campo: getattr(credito, campo)
        for campo in cambios.keys()
    }

    if "pagaduria_id" in cambios:
        _get_pagaduria_activa_or_404(db, cambios["pagaduria_id"])
    if "cooperativa_id" in cambios:
        _get_cooperativa_activa_or_404(db, cambios["cooperativa_id"])
    if (
        "tipo_credito" in cambios
        or "credito_refinanciado_id" in cambios
        or "entidad_financiera_origen" in cambios
    ):
        tipo_credito = cambios.get("tipo_credito", credito.tipo_credito)
        if tipo_credito == "Nuevo":
            cambios["credito_refinanciado_id"] = None
            cambios["entidad_financiera_origen"] = None
        elif tipo_credito == "Refinanciacion":
            cambios["entidad_financiera_origen"] = None
        elif tipo_credito == "Compra de cartera":
            cambios["credito_refinanciado_id"] = None

        _validar_tipo_credito(
            db,
            credito.pensionado_id,
            tipo_credito,
            cambios.get("credito_refinanciado_id", credito.credito_refinanciado_id),
            cambios.get(
                "entidad_financiera_origen",
                credito.entidad_financiera_origen,
            ),
        )

    if "tiene_documentos_pendientes" in cambios or "documentos_pendientes" in cambios:
        tiene_documentos_pendientes, documentos_pendientes = _normalizar_pendientes_documentales(
            cambios.get("tiene_documentos_pendientes", credito.tiene_documentos_pendientes),
            cambios.get("documentos_pendientes", credito.documentos_pendientes),
        )
        if tiene_documentos_pendientes is not None:
            cambios["tiene_documentos_pendientes"] = tiene_documentos_pendientes
        cambios["documentos_pendientes"] = documentos_pendientes

    cooperativa_id = cambios.get("cooperativa_id", credito.cooperativa_id)
    monto = cambios.get("monto_solicitado", float(credito.monto_solicitado))
    plazo = cambios.get("plazo", credito.plazo)

    _validar_reglas_credito(
        db=db,
        pensionado_id=credito.pensionado_id,
        cooperativa_id=cooperativa_id,
        monto=monto,
        plazo=plazo,
    )

    for campo, valor in cambios.items():
        setattr(credito, campo, valor)

    registrar_log(
        db=db,
        usuario_id=usuario_actual.id,
        tabla_afectada="creditos",
        registro_afectado=credito.id,
        tipo_accion="actualizar",
        valores_antes=valores_antes,
        valores_despues=cambios,
    )

    db.commit()
    db.refresh(credito)
    return credito


def cambiar_estado(
    db: Session,
    credito_id: int,
    data: CreditoCambioEstado,
    usuario_actual: Usuario,
) -> Credito:
    credito = obtener_credito(db, credito_id)
    estado_actual = credito.estado
    estado_nuevo = data.estado_nuevo

    if estado_nuevo == estado_actual:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El crédito ya se encuentra en ese estado",
        )

    permitidos = TRANSICIONES_VALIDAS.get(estado_actual, set())
    if estado_nuevo not in permitidos:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No se permite pasar de '{estado_actual}' a '{estado_nuevo}'",
        )

    if estado_nuevo == "Aprobado" and (
        credito.tiene_documentos_pendientes
        or credito_tiene_pendientes_abiertos(db, credito.id)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede aprobar un credito con documentos o tareas pendientes",
        )

    credito.estado = estado_nuevo

    if estado_nuevo == "Aprobado":
        credito.monto_aprobado = data.monto_aprobado
        credito.valor_cuota = data.valor_cuota
        credito.fecha_desembolso = data.fecha_desembolso
        credito.fecha_fin_estimada = data.fecha_fin_estimada

    _registrar_historial(
        db=db,
        credito_id=credito.id,
        usuario_id=usuario_actual.id,
        estado_anterior=estado_actual,
        estado_nuevo=estado_nuevo,
        observacion=data.observaciones,
    )

    registrar_log(
        db=db,
        usuario_id=usuario_actual.id,
        tabla_afectada="creditos",
        registro_afectado=credito.id,
        tipo_accion="cambiar_estado",
        valores_antes={"estado": estado_actual},
        valores_despues={
            "estado": estado_nuevo,
            "monto_aprobado": data.monto_aprobado,
            "valor_cuota": data.valor_cuota,
            "fecha_desembolso": data.fecha_desembolso,
            "fecha_fin_estimada": data.fecha_fin_estimada,
        },
    )

    db.commit()
    db.refresh(credito)
    return credito


def desactivar_credito(
    db: Session, credito_id: int, usuario_actual: Usuario
) -> Credito:
    credito = _get_credito_or_404(db, credito_id)
    if not credito.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El crédito ya está desactivado",
        )
    credito.is_active = False

    registrar_log(
        db=db,
        usuario_id=usuario_actual.id,
        tabla_afectada="creditos",
        registro_afectado=credito.id,
        tipo_accion="desactivar",
        valores_antes={"is_active": True},
        valores_despues={"is_active": False},
    )

    db.commit()
    db.refresh(credito)
    return credito
