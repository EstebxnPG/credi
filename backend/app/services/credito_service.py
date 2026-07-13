"""
credito_service.py
Lógica de negocio de Créditos.
Implementa CRUD, validación contra cooperativa y máquina de estados.
"""
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload

from app.db.models.cooperativa import Cooperativa
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
    CreditoCreate,
    CreditoUpdate,
    TRANSICIONES_VALIDAS,
)
from app.schemas.historial_credito import HistorialCreditoRead
from app.services.cooperativa_service import validar_credito_contra_cooperativa
from app.services.log_service import registrar_log
from app.services.pendiente_credito_service import credito_tiene_pendientes_abiertos


ESTADOS_EDITABLES = {"Prospecto", "Devuelto por corrección"}
ESTADOS_FINALES = {"Aprobado", "Rechazado", "Finalizado"}


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


def _obtener_credito_autorizado(db: Session, credito_id: int, usuario_actual: Usuario) -> Credito:
    credito = _get_credito_or_404(db, credito_id)
    _validar_alcance_credito(credito, usuario_actual)
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
    query = db.query(Credito).filter(
        Credito.estado == "Aprobado",
        Credito.fecha_fin_estimada.isnot(None),
        Credito.fecha_fin_estimada <= hoy,
        Credito.is_active == True,  # noqa: E712
    )
    if oficina_id is not None:
        query = query.filter(Credito.oficina_id == oficina_id)

    for credito in query.all():
        credito.estado = "Finalizado"
        if usuario_id is not None:
            _registrar_historial(
                db=db,
                credito_id=credito.id,
                usuario_id=usuario_id,
                estado_anterior="Aprobado",
                estado_nuevo="Finalizado",
                observacion="Finalizado automaticamente por fecha fin estimada",
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
            Credito.estado.in_(["Aprobado", "Finalizado"]),
            Credito.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not credito_anterior:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El credito refinanciado debe ser aprobado y pertenecer al mismo pensionado",
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

    from app.services.notificacion_service import sincronizar_reglas

    sincronizar_reglas(db, commit=False)
    db.commit()
    db.refresh(credito)
    return credito


def listar_creditos(
    db: Session,
    pensionado_id: int | None = None,
    asesor_id: int | None = None,
    oficina_id: int | None = None,
    estado: str | None = None,
    tipo_credito: str | None = None,
    usuario_actual: Usuario | None = None,
    skip: int = 0,
    limit: int = 15,
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
        )
        .filter(Credito.is_active == True)  # noqa: E712
    )

    if usuario_actual and usuario_actual.rol != "administrador":
        query = query.filter(Credito.oficina_id == usuario_actual.oficina_id)

    if pensionado_id is not None:
        query = query.filter(Credito.pensionado_id == pensionado_id)
    if asesor_id is not None:
        query = query.filter(Credito.asesor_id == asesor_id)
    if oficina_id is not None:
        query = query.filter(Credito.oficina_id == oficina_id)
    if estado is not None:
        if estado == "Devuelto por correccion":
            estado = "Devuelto por corrección"
        query = query.filter(Credito.estado == estado)

    if tipo_credito is not None:
        query = query.filter(Credito.tipo_credito.ilike(tipo_credito))

    return (
        query.order_by(Credito.fecha_registro.desc(), Credito.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def contar_creditos(
    db: Session,
    pensionado_id: int | None = None,
    asesor_id: int | None = None,
    oficina_id: int | None = None,
    estado: str | None = None,
    tipo_credito: str | None = None,
    usuario_actual: Usuario | None = None,
) -> int:
    query = db.query(Credito).filter(Credito.is_active == True)  # noqa: E712

    if usuario_actual and usuario_actual.rol != "administrador":
        query = query.filter(Credito.oficina_id == usuario_actual.oficina_id)

    if pensionado_id is not None:
        query = query.filter(Credito.pensionado_id == pensionado_id)
    if asesor_id is not None:
        query = query.filter(Credito.asesor_id == asesor_id)
    if oficina_id is not None:
        query = query.filter(Credito.oficina_id == oficina_id)
    if estado is not None:
        if estado == "Devuelto por correccion":
            estado = "Devuelto por correcciÃ³n"
        query = query.filter(Credito.estado == estado)
    if tipo_credito is not None:
        query = query.filter(Credito.tipo_credito.ilike(tipo_credito))

    return query.count()


def obtener_credito(db: Session, credito_id: int, usuario_actual: Usuario) -> Credito:
    scope_oficina = None if usuario_actual.rol == "administrador" else usuario_actual.oficina_id
    _sincronizar_creditos_finalizados(db, usuario_actual.id, scope_oficina)
    db.commit()
    credito = _obtener_credito_autorizado(db, credito_id, usuario_actual)
    if not credito.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Crédito con id {credito_id} no encontrado",
        )
    return credito


def obtener_historial_credito(
    db: Session, credito_id: int, usuario_actual: Usuario
) -> list[HistorialCreditoRead]:
    credito = _obtener_credito_autorizado(db, credito_id, usuario_actual)
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


def _validar_credito_editable(credito: Credito) -> None:
    if credito.estado in ESTADOS_FINALES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un credito aprobado, finalizado o rechazado no puede editarse",
        )


def actualizar_credito(
    db: Session,
    credito_id: int,
    data: CreditoUpdate,
    usuario_actual: Usuario,
) -> Credito:
    credito = obtener_credito(db, credito_id, usuario_actual)
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

    from app.services.notificacion_service import sincronizar_reglas

    sincronizar_reglas(db, commit=False)
    db.commit()
    db.refresh(credito)
    return credito


def cambiar_estado(
    db: Session,
    credito_id: int,
    data: CreditoCambioEstado,
    usuario_actual: Usuario,
) -> Credito:
    credito = obtener_credito(db, credito_id, usuario_actual)
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

    if estado_nuevo == "Aprobado":
        _validar_fecha_fin_por_plazo(data.fecha_desembolso, data.fecha_fin_estimada, credito.plazo)
        _validar_regla_refinanciacion_configurada(credito)

    if estado_nuevo == "Finalizado" and credito.estado != "Aprobado":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo un credito aprobado puede finalizarse",
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

    if estado_nuevo == "Aprobado":
        from app.services.refinanciacion_service import listar_creditos_elegibles

        listar_creditos_elegibles(db, usuario_actual, commit=False, limit=None)

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
