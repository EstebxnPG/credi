"""
credito_service.py
Lógica de negocio de Créditos.
Implementa CRUD, validación contra cooperativa y máquina de estados.
"""
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import Date, String, cast, func, or_, text
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload

from app.db.models.cooperativa import Cooperativa, CooperativaRefinanciacionRegla
from app.db.models.credito import Credito
from app.db.models.historial_credito import HistorialCredito
from app.db.models.oficina import Oficina
from app.db.models.pagaduria import Pagaduria
from app.db.models.pensionado import Pensionado, PensionadoOficina
from app.db.models.usuario import Usuario
from app.db.models.refinanciacion import OportunidadRefinanciacion, HistorialOportunidadRefinanciacion
from app.db.models.notificacion import Notificacion
from app.schemas.credito import (
    CreditoCambioEstado,
    CreditoCerrarManual,
    CreditoCreate,
    CreditoMarcarInconsistente,
    CreditoObservacionesUpdate,
    CreditoResolverSituacion,
    CreditoUpdate,
    SITUACIONES_CREDITO_VALIDAS,
    TRANSICIONES_VALIDAS,
    normalizar_tipo_credito,
)
from app.schemas.historial_credito import HistorialCreditoRead
from app.services.cooperativa_service import validar_credito_contra_cooperativa
from app.services.log_service import registrar_log
from app.services.pendiente_credito_service import credito_tiene_pendientes_abiertos


CAMPOS_CORRECCION_APROBADO = {
    "monto_solicitado",
    "monto_aprobado",
    "plazo",
    "valor_cuota",
    "cooperativa_id",
    "tipo_credito",
    "entidad_financiera_origen",
    "motivo_finalizacion",
    "nro_libranza",
    "observaciones",
}


def _calcular_edad(fecha_nacimiento: date, fecha_referencia: date | None = None) -> int:
    fecha_referencia = fecha_referencia or date.today()
    return fecha_referencia.year - fecha_nacimiento.year - (
        (fecha_referencia.month, fecha_referencia.day)
        < (fecha_nacimiento.month, fecha_nacimiento.day)
    )


def _get_credito_or_404(db: Session, credito_id: int) -> Credito:
    credito = (
        db.query(Credito)
        .options(
            joinedload(Credito.asesor),
            joinedload(Credito.pensionado),
            joinedload(Credito.cooperativa),
            joinedload(Credito.pagaduria),
        )
        .filter(Credito.id == credito_id)
        .first()
    )
    if not credito:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Crédito con id {credito_id} no encontrado",
        )
    return credito


def _validar_alcance_credito(credito: Credito, usuario_actual: Usuario) -> None:
    if usuario_actual.rol == "administrador":
        return
    if credito.oficina_id != usuario_actual.oficina_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Crédito con id {credito.id} no encontrado",
        )


def _pensionado_vinculado_a_oficina(db: Session, pensionado_id: int, oficina_id: int) -> bool:
    return db.query(PensionadoOficina.id).filter(
        PensionadoOficina.pensionado_id == pensionado_id,
        PensionadoOficina.oficina_id == oficina_id,
        PensionadoOficina.is_active == True,  # noqa: E712
    ).first() is not None


def _validar_alcance_lectura_credito(db: Session, credito: Credito, usuario_actual: Usuario) -> None:
    if usuario_actual.rol == "administrador":
        return
    if credito.oficina_id == usuario_actual.oficina_id:
        return
    if _pensionado_vinculado_a_oficina(db, credito.pensionado_id, usuario_actual.oficina_id):
        return
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"CrÃ©dito con id {credito.id} no encontrado",
    )


def _obtener_credito_autorizado(db: Session, credito_id: int, usuario_actual: Usuario) -> Credito:
    credito = _get_credito_or_404(db, credito_id)
    _validar_alcance_credito(credito, usuario_actual)
    return credito


def _obtener_credito_lectura_autorizada(db: Session, credito_id: int, usuario_actual: Usuario) -> Credito:
    credito = _get_credito_or_404(db, credito_id)
    _validar_alcance_lectura_credito(db, credito, usuario_actual)
    return credito


def _obtener_credito_operable_activo(db: Session, credito_id: int, usuario_actual: Usuario) -> Credito:
    credito = _obtener_credito_autorizado(db, credito_id, usuario_actual)
    if not credito.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CrÃ©dito con id {credito_id} no encontrado",
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


def _sincronizar_creditos_finalizados(
    db: Session,
    usuario_id: int | None = None,
    oficina_id: int | None = None,
) -> None:
    hoy = date.today()
    if usuario_id is not None:
        reactivar_query = db.query(Credito).filter(
            Credito.estado == "Aprobado",
            Credito.situacion_credito == "ACTIVO_INCONSISTENTE",
            Credito.fecha_reactivacion.isnot(None),
            Credito.fecha_reactivacion <= hoy,
            Credito.is_active == True,  # noqa: E712
        )
        if oficina_id is not None:
            reactivar_query = reactivar_query.filter(Credito.oficina_id == oficina_id)

        for credito in reactivar_query.all():
            credito.situacion_credito = "PENDIENTE_CIERRE"
            credito.observacion_situacion = "Reactivado por fecha programada; validar cierre o nueva gestion"
            credito.fecha_reactivacion = None
            _registrar_historial(
                db=db,
                credito_id=credito.id,
                usuario_id=usuario_id,
                estado_anterior="Aprobado/ACTIVO_INCONSISTENTE",
                estado_nuevo="Aprobado/PENDIENTE_CIERRE",
                observacion="Reactivado automaticamente por fecha programada",
            )

    query = db.query(Credito).filter(
        Credito.estado == "Aprobado",
        Credito.situacion_credito == "NORMAL",
        Credito.fecha_fin_estimada.isnot(None),
        Credito.fecha_fin_estimada <= hoy,
        Credito.is_active == True,  # noqa: E712
    )
    if oficina_id is not None:
        query = query.filter(Credito.oficina_id == oficina_id)

    for credito in query.all():
        if credito.situacion_credito == "PENDIENTE_CIERRE":
            continue
        situacion_anterior = credito.situacion_credito
        credito.situacion_credito = "PENDIENTE_CIERRE"
        credito.observacion_situacion = "Credito cumplio fecha fin estimada; requiere validacion manual de cierre"
        credito.fecha_reactivacion = None
        if usuario_id is not None:
            _registrar_historial(
                db=db,
                credito_id=credito.id,
                usuario_id=usuario_id,
                estado_anterior=f"Aprobado/{situacion_anterior}",
                estado_nuevo="Aprobado/PENDIENTE_CIERRE",
                observacion="Marcado para cierre manual por fecha fin estimada",
            )


def _validar_reglas_credito(
    db: Session,
    pensionado_id: int,
    cooperativa_id: int,
    monto: float,
    plazo: int,
) -> None:
    pensionado = _get_pensionado_activo_or_404(db, pensionado_id)
    cooperativa = _get_cooperativa_activa_or_404(db, cooperativa_id)

    edad = (
        _calcular_edad(pensionado.fecha_nacimiento)
        if pensionado.fecha_nacimiento is not None
        else None
    )
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
    pensionado: Pensionado,
    data: CreditoCreate,
    usuario_actual: Usuario,
    asesor: Usuario,
    db: Session | None = None,
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

    if asesor.oficina_id != data.oficina_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El asesor asignado debe pertenecer a la oficina del crédito",
        )
    if pensionado.oficina_id != data.oficina_id:
        if db is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El pensionado debe estar vinculado a la oficina del crédito",
            )
        vinculo = db.query(PensionadoOficina.id).filter(
            PensionadoOficina.pensionado_id == pensionado.id,
            PensionadoOficina.oficina_id == data.oficina_id,
            PensionadoOficina.is_active == True,  # noqa: E712
        ).first()
        if vinculo:
            return
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El pensionado debe estar vinculado a la oficina del crédito",
        )


def _validar_tipo_credito(
    db: Session,
    pensionado_id: int,
    tipo_credito: str | None,
    credito_refinanciado_id: int | None,
    entidad_financiera_origen: str | None,
    credito_actual_id: int | None = None,
) -> None:
    tipo_credito = normalizar_tipo_credito(tipo_credito)

    if tipo_credito == "NUEVO":
        if credito_refinanciado_id or entidad_financiera_origen:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Un credito nuevo no debe tener credito anterior ni entidad financiera de origen",
            )
        return

    if tipo_credito == "COMPRA CARTERA":
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
            detail="El credito refinanciado debe estar aprobado y pertenecer al mismo pensionado",
        )

    from app.services.refinanciacion_service import validar_credito_refinanciable

    validar_credito_refinanciable(db, credito_anterior)

    duplicado_query = db.query(Credito.id).filter(
        Credito.credito_refinanciado_id == credito_refinanciado_id,
        Credito.is_active == True,  # noqa: E712
    )
    if credito_actual_id is not None:
        duplicado_query = duplicado_query.filter(Credito.id != credito_actual_id)

    duplicado = duplicado_query.first()
    if duplicado:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Este credito ya tiene una refinanciacion asociada",
        )


def _validar_regla_refinanciacion_configurada(credito: Credito) -> None:
    regla = next(
        (
            regla
            for regla in credito.cooperativa.reglas_refinanciacion
            if regla.plazo_minimo <= credito.plazo <= regla.plazo_maximo
        ),
        None,
    )
    if regla is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "No se puede aprobar: la cooperativa no tiene regla de refinanciacion "
                f"para plazo {credito.plazo} meses"
            ),
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
    pensionado = _get_pensionado_activo_or_404(db, data.pensionado_id)
    _get_oficina_activa_or_404(db, data.oficina_id)
    _get_pagaduria_activa_or_404(db, data.pagaduria_id)
    _validar_contexto_creacion(pensionado, data, usuario_actual, asesor, db=db)
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

    if credito.tipo_credito == "REFINANCIACION" and credito.credito_refinanciado_id:
        credito_anterior = db.query(Credito).filter(Credito.id == credito.credito_refinanciado_id).first()
        if credito_anterior:
            estado_anterior = credito_anterior.estado
            credito_anterior.estado = "Finalizado"
            credito_anterior.motivo_finalizacion = "REFINANCIADO"
            _registrar_historial(
                db=db,
                credito_id=credito_anterior.id,
                usuario_id=usuario_actual.id,
                estado_anterior=estado_anterior,
                estado_nuevo="Finalizado",
                observacion=f"Finalizado por refinanciacion con credito #{credito.id}",
            )
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

    from app.services.notificacion_service import sincronizar_documentos_credito

    sincronizar_documentos_credito(db, credito)
    db.commit()
    db.refresh(credito)
    return credito


def listar_creditos(
    db: Session,
    pensionado_id: int | None = None,
    asesor_id: int | None = None,
    oficina_id: int | None = None,
    estado: str | None = None,
    situacion_credito: str | None = None,
    tipo_credito: str | None = None,
    refinanciacion: str | None = None,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    texto: str | None = None,
    usuario_actual: Usuario | None = None,
    skip: int = 0,
    limit: int = 15,
    orden_registro: str = "desc",
) -> list[Credito]:
    scope_oficina = (
        usuario_actual.oficina_id
        if usuario_actual and usuario_actual.rol != "administrador"
        else None
    )
    if usuario_actual:
        _sincronizar_creditos_finalizados(db, usuario_actual.id, scope_oficina)
        db.commit()

    query = (
        db.query(Credito)
        .options(
            joinedload(Credito.asesor),
            joinedload(Credito.pensionado),
            joinedload(Credito.cooperativa),
            joinedload(Credito.pagaduria),
        )
        .filter(Credito.is_active == True)  # noqa: E712
    )

    if pensionado_id is None:
        query = query.join(Pensionado, Pensionado.id == Credito.pensionado_id).filter(
            Pensionado.is_active == True  # noqa: E712
        )

    if pensionado_id is not None:
        query = query.filter(Credito.pensionado_id == pensionado_id)
        if usuario_actual and usuario_actual.rol != "administrador":
            if not _pensionado_vinculado_a_oficina(db, pensionado_id, usuario_actual.oficina_id):
                query = query.filter(Credito.oficina_id == usuario_actual.oficina_id)
    elif usuario_actual and usuario_actual.rol != "administrador":
        query = query.filter(Credito.oficina_id == usuario_actual.oficina_id)
    if asesor_id is not None:
        query = query.filter(Credito.asesor_id == asesor_id)
    if oficina_id is not None:
        query = query.filter(Credito.oficina_id == oficina_id)
    if estado is not None:
        if estado == "Devuelto por correccion":
            estado = "Devuelto por corrección"
        query = query.filter(Credito.estado == estado)
    if situacion_credito is not None:
        situacion_credito = situacion_credito.strip().upper()
        if situacion_credito not in SITUACIONES_CREDITO_VALIDAS:
            raise HTTPException(status_code=422, detail="Filtro de situacion_credito no valido")
        query = query.filter(Credito.situacion_credito == situacion_credito)

    if tipo_credito is not None:
        query = query.filter(Credito.tipo_credito.ilike(tipo_credito))
    if fecha_desde is not None:
        query = query.filter(cast(Credito.fecha_registro, Date) >= fecha_desde)
    if fecha_hasta is not None:
        query = query.filter(cast(Credito.fecha_registro, Date) <= fecha_hasta)
    if texto:
        term = f"%{texto.strip()}%"
        if pensionado_id is not None:
            query = query.join(Pensionado, Pensionado.id == Credito.pensionado_id)
        query = query.outerjoin(Oficina, Oficina.id == Credito.oficina_id)
        query = query.outerjoin(Cooperativa, Cooperativa.id == Credito.cooperativa_id)
        query = query.filter(
            or_(
                cast(Credito.id, String).ilike(term),
                Credito.estado.ilike(term),
                Credito.tipo_credito.ilike(term),
                Credito.nro_libranza.ilike(term),
                Credito.entidad_financiera_origen.ilike(term),
                Credito.documentos_pendientes.ilike(term),
                cast(Credito.monto_solicitado, String).ilike(term),
                cast(Credito.monto_aprobado, String).ilike(term),
                cast(Credito.plazo, String).ilike(term),
                Pensionado.nombre.ilike(term),
                Pensionado.segundo_nombre.ilike(term),
                Pensionado.apellidos.ilike(term),
                Pensionado.documento.ilike(term),
                Oficina.nombre.ilike(term),
                Cooperativa.nombre.ilike(term),
            )
        )

    query = _filtrar_por_refinanciacion(db, query, refinanciacion)

    order_columns = (
        [Credito.fecha_registro.asc(), Credito.id.asc()]
        if orden_registro == "asc"
        else [Credito.fecha_registro.desc(), Credito.id.desc()]
    )

    return query.order_by(*order_columns).offset(skip).limit(limit).all()


def contar_creditos(
    db: Session,
    pensionado_id: int | None = None,
    asesor_id: int | None = None,
    oficina_id: int | None = None,
    estado: str | None = None,
    situacion_credito: str | None = None,
    tipo_credito: str | None = None,
    refinanciacion: str | None = None,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    texto: str | None = None,
    usuario_actual: Usuario | None = None,
) -> int:
    query = db.query(Credito).filter(Credito.is_active == True)  # noqa: E712

    if pensionado_id is None:
        query = query.join(Pensionado, Pensionado.id == Credito.pensionado_id).filter(
            Pensionado.is_active == True  # noqa: E712
        )

    if pensionado_id is not None:
        query = query.filter(Credito.pensionado_id == pensionado_id)
        if usuario_actual and usuario_actual.rol != "administrador":
            if not _pensionado_vinculado_a_oficina(db, pensionado_id, usuario_actual.oficina_id):
                query = query.filter(Credito.oficina_id == usuario_actual.oficina_id)
    elif usuario_actual and usuario_actual.rol != "administrador":
        query = query.filter(Credito.oficina_id == usuario_actual.oficina_id)
    if asesor_id is not None:
        query = query.filter(Credito.asesor_id == asesor_id)
    if oficina_id is not None:
        query = query.filter(Credito.oficina_id == oficina_id)
    if estado is not None:
        if estado == "Devuelto por correccion":
            estado = "Devuelto por correcciÃ³n"
        query = query.filter(Credito.estado == estado)
    if situacion_credito is not None:
        situacion_credito = situacion_credito.strip().upper()
        if situacion_credito not in SITUACIONES_CREDITO_VALIDAS:
            raise HTTPException(status_code=422, detail="Filtro de situacion_credito no valido")
        query = query.filter(Credito.situacion_credito == situacion_credito)
    if tipo_credito is not None:
        query = query.filter(Credito.tipo_credito.ilike(tipo_credito))
    if fecha_desde is not None:
        query = query.filter(cast(Credito.fecha_registro, Date) >= fecha_desde)
    if fecha_hasta is not None:
        query = query.filter(cast(Credito.fecha_registro, Date) <= fecha_hasta)
    if texto:
        term = f"%{texto.strip()}%"
        if pensionado_id is not None:
            query = query.join(Pensionado, Pensionado.id == Credito.pensionado_id)
        query = query.outerjoin(Oficina, Oficina.id == Credito.oficina_id)
        query = query.outerjoin(Cooperativa, Cooperativa.id == Credito.cooperativa_id)
        query = query.filter(
            or_(
                cast(Credito.id, String).ilike(term),
                Credito.estado.ilike(term),
                Credito.tipo_credito.ilike(term),
                Credito.nro_libranza.ilike(term),
                Credito.entidad_financiera_origen.ilike(term),
                Credito.documentos_pendientes.ilike(term),
                cast(Credito.monto_solicitado, String).ilike(term),
                cast(Credito.monto_aprobado, String).ilike(term),
                cast(Credito.plazo, String).ilike(term),
                Pensionado.nombre.ilike(term),
                Pensionado.segundo_nombre.ilike(term),
                Pensionado.apellidos.ilike(term),
                Pensionado.documento.ilike(term),
                Oficina.nombre.ilike(term),
                Cooperativa.nombre.ilike(term),
            )
        )

    query = _filtrar_por_refinanciacion(db, query, refinanciacion)

    return query.count()


def _filtrar_por_refinanciacion(query_db: Session, query, refinanciacion: str | None):
    if not refinanciacion:
        return query

    if refinanciacion == "sin":
        return (
            query.outerjoin(
                OportunidadRefinanciacion,
                OportunidadRefinanciacion.credito_id == Credito.id,
            )
            .filter(OportunidadRefinanciacion.id.is_(None))
        )

    if refinanciacion not in {"listos", "programados"}:
        raise HTTPException(status_code=422, detail="Filtro de refinanciacion no valido")

    aprobacion_subquery = (
        query_db.query(
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
    hoy = date.today()

    query = (
        query.join(OportunidadRefinanciacion, OportunidadRefinanciacion.credito_id == Credito.id)
        .join(Cooperativa, Credito.cooperativa_id == Cooperativa.id)
        .join(
            CooperativaRefinanciacionRegla,
            (CooperativaRefinanciacionRegla.cooperativa_id == Credito.cooperativa_id)
            & (CooperativaRefinanciacionRegla.plazo_minimo <= Credito.plazo)
            & (CooperativaRefinanciacionRegla.plazo_maximo >= Credito.plazo),
        )
        .outerjoin(aprobacion_subquery, aprobacion_subquery.c.credito_id == Credito.id)
        .filter(
            Credito.estado == "Aprobado",
            Cooperativa.is_active == True,  # noqa: E712
            OportunidadRefinanciacion.estado.notin_(["convertido", "rechazado"]),
        )
    )

    if refinanciacion == "listos":
        return query.filter(disponible_desde_expr <= hoy)

    return query.filter(disponible_desde_expr > hoy)


def obtener_credito(db: Session, credito_id: int, usuario_actual: Usuario) -> Credito:
    scope_oficina = None if usuario_actual.rol == "administrador" else usuario_actual.oficina_id
    _sincronizar_creditos_finalizados(db, usuario_actual.id, scope_oficina)
    db.commit()
    credito = _obtener_credito_lectura_autorizada(db, credito_id, usuario_actual)
    if not credito.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Crédito con id {credito_id} no encontrado",
        )
    return credito


def obtener_historial_credito(
    db: Session, credito_id: int, usuario_actual: Usuario
) -> list[HistorialCreditoRead]:
    credito = _obtener_credito_lectura_autorizada(db, credito_id, usuario_actual)
    if not credito.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CrÃ©dito con id {credito_id} no encontrado",
        )
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


def _sumar_meses_credito(fecha: date, meses: int) -> date:
    mes_total = fecha.month - 1 + meses
    year = fecha.year + mes_total // 12
    month = mes_total % 12 + 1
    dias_mes = [
        31,
        29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ]
    day = min(fecha.day, dias_mes[month - 1])
    return date(year, month, day)


def _validar_fecha_fin_por_plazo(
    fecha_desembolso: date | None,
    fecha_fin_estimada: date | None,
    plazo: int,
) -> None:
    if fecha_desembolso is None or fecha_fin_estimada is None:
        return
    fecha_esperada = _sumar_meses_credito(fecha_desembolso, plazo)
    if fecha_fin_estimada != fecha_esperada:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "La fecha fin estimada debe coincidir con el plazo: "
                f"{plazo} cuotas desde {fecha_desembolso.isoformat()} terminan "
                f"el {fecha_esperada.isoformat()}"
            ),
        )


def _situacion_al_reabrir_cierre(credito: Credito) -> str:
    if credito.fecha_fin_estimada and credito.fecha_fin_estimada <= date.today():
        return "PENDIENTE_CIERRE"
    return "NORMAL"


def _validar_credito_editable(credito: Credito) -> None:
    if credito.estado in {"Finalizado", "Rechazado"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un credito finalizado o rechazado no puede editarse",
        )


def _validar_campos_editables(credito: Credito, cambios: dict) -> None:
    if credito.estado != "Aprobado":
        return

    campos_no_permitidos = set(cambios) - CAMPOS_CORRECCION_APROBADO
    if campos_no_permitidos:
        campos = ", ".join(sorted(campos_no_permitidos))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"En creditos aprobados no se pueden editar estos campos: {campos}",
        )


def actualizar_credito(
    db: Session,
    credito_id: int,
    data: CreditoUpdate,
    usuario_actual: Usuario,
) -> Credito:
    credito = _obtener_credito_operable_activo(db, credito_id, usuario_actual)
    _validar_credito_editable(credito)

    cambios = data.model_dump(exclude_unset=True)
    if not cambios:
        return credito
    _validar_campos_editables(credito, cambios)

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
        if tipo_credito == "NUEVO":
            cambios["credito_refinanciado_id"] = None
            cambios["entidad_financiera_origen"] = None
        elif tipo_credito == "REFINANCIACION":
            cambios["entidad_financiera_origen"] = None
        elif tipo_credito == "COMPRA CARTERA":
            cambios["credito_refinanciado_id"] = None

        if credito.estado != "Aprobado":
            _validar_tipo_credito(
                db,
                credito.pensionado_id,
                tipo_credito,
                cambios.get("credito_refinanciado_id", credito.credito_refinanciado_id),
                cambios.get(
                    "entidad_financiera_origen",
                    credito.entidad_financiera_origen,
                ),
                credito_actual_id=credito.id,
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

    from app.services.notificacion_service import sincronizar_documentos_credito

    sincronizar_documentos_credito(db, credito)
    db.commit()
    db.refresh(credito)
    return credito


def actualizar_observaciones_credito(
    db: Session,
    credito_id: int,
    data: CreditoObservacionesUpdate,
    usuario_actual: Usuario,
) -> Credito:
    credito = _obtener_credito_autorizado(db, credito_id, usuario_actual)
    if not credito.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CrÃ©dito con id {credito_id} no encontrado",
        )

    observaciones = data.observaciones
    if credito.observaciones == observaciones:
        return credito

    valor_anterior = credito.observaciones
    credito.observaciones = observaciones

    registrar_log(
        db=db,
        usuario_id=usuario_actual.id,
        tabla_afectada="creditos",
        registro_afectado=credito.id,
        tipo_accion="observaciones",
        valores_antes={"observaciones": valor_anterior},
        valores_despues={"observaciones": observaciones},
    )

    db.commit()
    db.refresh(credito)
    return credito


def _cerrar_oportunidades_por_cierre_credito(
    db: Session,
    credito: Credito,
    usuario_id: int,
    motivo: str,
) -> None:
    if motivo == "REFINANCIADO":
        return
    oportunidades = (
        db.query(OportunidadRefinanciacion)
        .filter(
            OportunidadRefinanciacion.credito_id == credito.id,
            OportunidadRefinanciacion.estado.notin_(["convertido", "cerrado"]),
        )
        .all()
    )
    for oportunidad in oportunidades:
        anterior = oportunidad.estado
        oportunidad.estado = "cerrado"
        oportunidad.justificacion = f"Cerrada por finalizacion manual del credito ({motivo})"
        oportunidad.reactivar_en = None
        db.add(
            HistorialOportunidadRefinanciacion(
                oportunidad_id=oportunidad.id,
                usuario_id=usuario_id,
                estado_anterior=anterior,
                estado_nuevo="cerrado",
                justificacion=oportunidad.justificacion,
            )
        )


def _reabrir_oportunidades_por_reversion_cierre(
    db: Session,
    credito: Credito,
    usuario_id: int,
) -> None:
    oportunidades = (
        db.query(OportunidadRefinanciacion)
        .filter(
            OportunidadRefinanciacion.credito_id == credito.id,
            OportunidadRefinanciacion.estado == "cerrado",
        )
        .all()
    )
    for oportunidad in oportunidades:
        oportunidad.estado = "disponible"
        oportunidad.justificacion = "Reabierta por correccion de cierre del credito"
        db.add(
            HistorialOportunidadRefinanciacion(
                oportunidad_id=oportunidad.id,
                estado_anterior="cerrado",
                estado_nuevo="disponible",
                justificacion="Reapertura por reversion de cierre validado",
            )
        )
        registrar_log(
            db=db,
            usuario_id=usuario_id,
            tabla_afectada="oportunidades_refinanciacion",
            registro_afectado=oportunidad.id,
            tipo_accion="reabrir_refi",
            valores_antes={"estado": "cerrado"},
            valores_despues={"estado": "disponible"},
        )


def cambiar_estado(
    db: Session,
    credito_id: int,
    data: CreditoCambioEstado,
    usuario_actual: Usuario,
) -> Credito:
    credito = _obtener_credito_operable_activo(db, credito_id, usuario_actual)
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

    if estado_nuevo == "Aprobado" and estado_actual != "Finalizado" and (
        credito.tiene_documentos_pendientes
        or credito_tiene_pendientes_abiertos(db, credito.id)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede aprobar un credito con documentos o tareas pendientes",
        )

    if estado_actual == "Finalizado" and estado_nuevo == "Aprobado" and not data.observaciones:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La observacion es obligatoria para revertir un credito finalizado",
        )

    if estado_nuevo == "Aprobado":
        if estado_actual != "Finalizado":
            if not data.fecha_desembolso:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="fecha_desembolso es obligatoria cuando el estado es Aprobado",
                )
            if not data.fecha_fin_estimada:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="fecha_fin_estimada es obligatoria cuando el estado es Aprobado",
                )
            _validar_fecha_fin_por_plazo(data.fecha_desembolso, data.fecha_fin_estimada, credito.plazo)
        _validar_regla_refinanciacion_configurada(credito)

    if estado_nuevo == "Finalizado" and credito.estado != "Aprobado":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo un credito aprobado puede finalizarse",
        )

    credito.estado = estado_nuevo

    if estado_nuevo == "Aprobado":
        if estado_actual != "Finalizado":
            credito.monto_aprobado = data.monto_aprobado
            credito.valor_cuota = data.valor_cuota
            credito.fecha_desembolso = data.fecha_desembolso
            credito.fecha_fin_estimada = data.fecha_fin_estimada
        credito.motivo_finalizacion = None
        credito.situacion_credito = (
            _situacion_al_reabrir_cierre(credito)
            if estado_actual == "Finalizado"
            else "NORMAL"
        )
        credito.fecha_reactivacion = None
        credito.observacion_situacion = (
            data.observaciones
            if estado_actual == "Finalizado"
            else None
        )
        if estado_actual == "Finalizado":
            _reabrir_oportunidades_por_reversion_cierre(db, credito, usuario_actual.id)
    if estado_nuevo == "Finalizado":
        credito.motivo_finalizacion = data.motivo_finalizacion
        credito.situacion_credito = "CIERRE_VALIDADO"
        credito.fecha_reactivacion = None
        credito.observacion_situacion = data.observaciones
        _cerrar_oportunidades_por_cierre_credito(
            db,
            credito,
            usuario_actual.id,
            data.motivo_finalizacion or "OTRO",
        )

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
            "motivo_finalizacion": data.motivo_finalizacion,
            "monto_aprobado": data.monto_aprobado,
            "valor_cuota": data.valor_cuota,
            "fecha_desembolso": data.fecha_desembolso,
            "fecha_fin_estimada": data.fecha_fin_estimada,
        },
    )

    if estado_nuevo == "Aprobado":
        from app.services.refinanciacion_service import listar_creditos_elegibles

        listar_creditos_elegibles(db, usuario_actual, commit=False, limit=None)

    db.commit()
    db.refresh(credito)
    return credito


def cerrar_credito_manual(
    db: Session,
    credito_id: int,
    data: CreditoCerrarManual,
    usuario_actual: Usuario,
) -> Credito:
    credito = _obtener_credito_operable_activo(db, credito_id, usuario_actual)
    if credito.estado != "Aprobado":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo un credito aprobado puede cerrarse manualmente",
        )

    estado_anterior = credito.estado
    situacion_anterior = credito.situacion_credito
    credito.estado = "Finalizado"
    credito.motivo_finalizacion = data.motivo_finalizacion
    credito.situacion_credito = "CIERRE_VALIDADO"
    credito.fecha_reactivacion = None
    credito.observacion_situacion = data.observaciones
    _cerrar_oportunidades_por_cierre_credito(db, credito, usuario_actual.id, data.motivo_finalizacion)

    _registrar_historial(
        db=db,
        credito_id=credito.id,
        usuario_id=usuario_actual.id,
        estado_anterior=f"{estado_anterior}/{situacion_anterior}",
        estado_nuevo="Finalizado/CIERRE_VALIDADO",
        observacion=data.observaciones or "Cierre manual validado",
    )
    registrar_log(
        db=db,
        usuario_id=usuario_actual.id,
        tabla_afectada="creditos",
        registro_afectado=credito.id,
        tipo_accion="cerrar_manual",
        valores_antes={"estado": estado_anterior, "situacion_credito": situacion_anterior},
        valores_despues={
            "estado": credito.estado,
            "situacion_credito": credito.situacion_credito,
            "motivo_finalizacion": credito.motivo_finalizacion,
        },
    )
    db.commit()
    db.refresh(credito)
    return credito


def marcar_credito_inconsistente(
    db: Session,
    credito_id: int,
    data: CreditoMarcarInconsistente,
    usuario_actual: Usuario,
) -> Credito:
    credito = _obtener_credito_operable_activo(db, credito_id, usuario_actual)
    if credito.estado != "Aprobado":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo un credito aprobado puede marcarse inconsistente",
        )

    situacion_anterior = credito.situacion_credito
    credito.situacion_credito = "ACTIVO_INCONSISTENTE"
    credito.fecha_reactivacion = data.fecha_reactivacion
    credito.observacion_situacion = data.observacion_situacion

    _registrar_historial(
        db=db,
        credito_id=credito.id,
        usuario_id=usuario_actual.id,
        estado_anterior=f"Aprobado/{situacion_anterior}",
        estado_nuevo="Aprobado/ACTIVO_INCONSISTENTE",
        observacion=data.observacion_situacion,
    )
    registrar_log(
        db=db,
        usuario_id=usuario_actual.id,
        tabla_afectada="creditos",
        registro_afectado=credito.id,
        tipo_accion="marcar_inconsistente",
        valores_antes={"situacion_credito": situacion_anterior},
        valores_despues={
            "situacion_credito": credito.situacion_credito,
            "fecha_reactivacion": credito.fecha_reactivacion,
            "observacion_situacion": credito.observacion_situacion,
        },
    )
    db.commit()
    db.refresh(credito)
    return credito


def resolver_situacion_credito(
    db: Session,
    credito_id: int,
    data: CreditoResolverSituacion,
    usuario_actual: Usuario,
) -> Credito:
    credito = _obtener_credito_operable_activo(db, credito_id, usuario_actual)
    if credito.estado != "Aprobado":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo un credito aprobado puede volver a pendiente de validar cierre",
        )

    situacion_anterior = credito.situacion_credito
    credito.situacion_credito = "PENDIENTE_CIERRE"
    credito.fecha_reactivacion = None
    credito.observacion_situacion = data.observaciones
    _registrar_historial(
        db=db,
        credito_id=credito.id,
        usuario_id=usuario_actual.id,
        estado_anterior=f"Aprobado/{situacion_anterior}",
        estado_nuevo="Aprobado/PENDIENTE_CIERRE",
        observacion=data.observaciones or "Reactivado para validar cierre",
    )
    registrar_log(
        db=db,
        usuario_id=usuario_actual.id,
        tabla_afectada="creditos",
        registro_afectado=credito.id,
        tipo_accion="resolver_situacion",
        valores_antes={"situacion_credito": situacion_anterior},
        valores_despues={"situacion_credito": "PENDIENTE_CIERRE"},
    )
    db.commit()
    db.refresh(credito)
    return credito


def desactivar_credito(
    db: Session, credito_id: int, usuario_actual: Usuario
) -> Credito:
    credito = _obtener_credito_autorizado(db, credito_id, usuario_actual)
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
