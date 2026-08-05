import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.schemas.credito import CreditoCambioEstado
from app.services.credito_service import (
    cambiar_estado,
    _validar_regla_refinanciacion_configurada,
    _validar_alcance_lectura_credito,
    _validar_campos_editables,
    _validar_contexto_creacion,
    _validar_credito_editable,
    _normalizar_pendientes_documentales,
    _validar_tipo_credito,
)


class CreditosTests(unittest.TestCase):
    def test_asesora_puede_leer_credito_de_pensionado_hibrido(self):
        query = MagicMock()
        query.filter.return_value.first.return_value = (1,)
        db = MagicMock()
        db.query.return_value = query
        credito = SimpleNamespace(id=10, oficina_id=2, pensionado_id=5)
        usuario = SimpleNamespace(rol="asesora", oficina_id=1)

        _validar_alcance_lectura_credito(db, credito, usuario)

    def test_asesora_no_lee_credito_de_pensionado_no_vinculado(self):
        query = MagicMock()
        query.filter.return_value.first.return_value = None
        db = MagicMock()
        db.query.return_value = query
        credito = SimpleNamespace(id=10, oficina_id=2, pensionado_id=5)
        usuario = SimpleNamespace(rol="asesora", oficina_id=1)

        with self.assertRaises(HTTPException):
            _validar_alcance_lectura_credito(db, credito, usuario)

    def test_credito_aprobado_es_editable_para_correcciones_operativas(self):
        credito = SimpleNamespace(is_active=True, estado="Aprobado")

        _validar_credito_editable(credito)
        _validar_campos_editables(
            credito,
            {
                "monto_solicitado": 10_000_000,
                "monto_aprobado": 10_000_000,
                "plazo": 84,
                "valor_cuota": 145_000,
                "cooperativa_id": 2,
                "tipo_credito": "NUEVO",
                "motivo_finalizacion": "REFINANCIADO",
                "nro_libranza": "000",
                "observaciones": "0000",
            },
        )

    def test_credito_aprobado_rechaza_campos_fuera_de_correccion_operativa(self):
        credito = SimpleNamespace(is_active=True, estado="Aprobado")

        with self.assertRaises(HTTPException):
            _validar_campos_editables(credito, {"pagaduria_id": 1})

    def test_credito_aprobado_permite_compra_cartera_sin_entidad_en_correccion(self):
        credito = SimpleNamespace(is_active=True, estado="Aprobado")

        _validar_campos_editables(credito, {"tipo_credito": "COMPRA CARTERA"})

    def test_credito_finalizado_o_rechazado_no_es_editable(self):
        for estado in ["Finalizado", "Rechazado"]:
            with self.subTest(estado=estado):
                credito = SimpleNamespace(is_active=True, estado=estado)

                with self.assertRaises(HTTPException):
                    _validar_credito_editable(credito)

    def test_credito_no_aprobado_es_editable(self):
        credito = SimpleNamespace(is_active=True, estado="Enviado a cooperativa")

        _validar_credito_editable(credito)

    def test_asesora_no_crea_credito_fuera_de_su_oficina(self):
        pensionado = SimpleNamespace(oficina_id=2)
        data = SimpleNamespace(asesor_id=7, oficina_id=2)
        usuario = SimpleNamespace(id=7, rol="asesora", oficina_id=1)
        asesor = SimpleNamespace(rol="asesora", oficina_id=2)

        with self.assertRaises(HTTPException):
            _validar_contexto_creacion(pensionado, data, usuario, asesor)

    def test_pensionado_debe_pertenecer_a_la_oficina_del_credito(self):
        pensionado = SimpleNamespace(oficina_id=1)
        data = SimpleNamespace(asesor_id=7, oficina_id=2)
        usuario = SimpleNamespace(id=99, rol="administrador", oficina_id=1)
        asesor = SimpleNamespace(rol="asesora", oficina_id=2)

        with self.assertRaises(HTTPException):
            _validar_contexto_creacion(pensionado, data, usuario, asesor)

    def test_validar_refinanciacion_excluye_credito_actual_en_duplicados(self):
        credito_anterior_query = MagicMock()
        credito_anterior_query.filter.return_value.first.return_value = SimpleNamespace(
            id=10,
            estado="Aprobado",
            is_active=True,
            plazo=12,
            fecha_desembolso=None,
            cooperativa=SimpleNamespace(
                is_active=True,
                reglas_refinanciacion=[
                    SimpleNamespace(plazo_minimo=12, plazo_maximo=24, meses_para_refinanciar=1)
                ],
            ),
        )

        historial_query = MagicMock()
        historial_query.filter.return_value.order_by.return_value.first.return_value = SimpleNamespace(
            created_at=__import__("datetime").datetime(2025, 1, 1)
        )

        duplicado_query = MagicMock()
        duplicado_query.filter.return_value = duplicado_query
        duplicado_query.first.return_value = None

        db = MagicMock()
        db.query.side_effect = [credito_anterior_query, historial_query, duplicado_query]

        _validar_tipo_credito(
            db,
            pensionado_id=5,
            tipo_credito="Refinanciacion",
            credito_refinanciado_id=10,
            entidad_financiera_origen=None,
            credito_actual_id=20,
        )

        self.assertEqual(duplicado_query.filter.call_count, 2)

    def test_aprobar_exige_fechas_de_desembolso_y_fin(self):
        credito = SimpleNamespace(
            id=10,
            estado="Enviado a cooperativa",
            plazo=12,
            tiene_documentos_pendientes=False,
            cooperativa=SimpleNamespace(
                reglas_refinanciacion=[
                    SimpleNamespace(plazo_minimo=1, plazo_maximo=120, meses_para_refinanciar=6)
                ]
            ),
        )
        data = CreditoCambioEstado(estado_nuevo="Aprobado", monto_aprobado=1000)

        with patch(
            "app.services.credito_service._obtener_credito_operable_activo",
            return_value=credito,
        ), patch(
            "app.services.credito_service.credito_tiene_pendientes_abiertos",
            return_value=False,
        ), self.assertRaises(HTTPException) as exc:
            cambiar_estado(MagicMock(), 10, data, SimpleNamespace(id=1))

        self.assertEqual(exc.exception.status_code, 400)
        self.assertIn("fecha_desembolso", exc.exception.detail)

    def test_reabrir_finalizado_sin_cumplir_ciclo_vuelve_a_normal(self):
        credito = SimpleNamespace(
            id=10,
            estado="Finalizado",
            plazo=12,
            monto_aprobado=None,
            monto_solicitado=1000,
            valor_cuota=None,
            fecha_desembolso=None,
            fecha_fin_estimada=date(2026, 12, 1),
            motivo_finalizacion="ANULADO",
            situacion_credito="CIERRE_VALIDADO",
            fecha_reactivacion=None,
            observacion_situacion=None,
            cooperativa=SimpleNamespace(
                reglas_refinanciacion=[
                    SimpleNamespace(plazo_minimo=1, plazo_maximo=120, meses_para_refinanciar=6)
                ]
            ),
        )
        data = CreditoCambioEstado(
            estado_nuevo="Aprobado",
            monto_aprobado=1000,
            observaciones="Reapertura por cierre errado",
        )

        with patch(
            "app.services.credito_service._obtener_credito_operable_activo",
            return_value=credito,
        ), patch("app.services.credito_service._registrar_historial"), patch(
            "app.services.credito_service.registrar_log"
        ), patch("app.services.credito_service._reabrir_oportunidades_por_reversion_cierre"), patch(
            "app.services.refinanciacion_service.listar_creditos_elegibles"
        ):
            resultado = cambiar_estado(MagicMock(), 10, data, SimpleNamespace(id=1))

        self.assertEqual(resultado.estado, "Aprobado")
        self.assertIsNone(resultado.fecha_desembolso)
        self.assertEqual(resultado.situacion_credito, "NORMAL")

    def test_reabrir_finalizado_con_ciclo_cumplido_queda_pendiente_cierre(self):
        credito = SimpleNamespace(
            id=10,
            estado="Finalizado",
            plazo=12,
            monto_aprobado=1000,
            monto_solicitado=1000,
            valor_cuota=None,
            fecha_desembolso=None,
            fecha_fin_estimada=date(2024, 12, 1),
            motivo_finalizacion="ANULADO",
            situacion_credito="CIERRE_VALIDADO",
            fecha_reactivacion=None,
            observacion_situacion=None,
            cooperativa=SimpleNamespace(
                reglas_refinanciacion=[
                    SimpleNamespace(plazo_minimo=1, plazo_maximo=120, meses_para_refinanciar=6)
                ]
            ),
        )
        data = CreditoCambioEstado(
            estado_nuevo="Aprobado",
            monto_aprobado=1000,
            observaciones="Reapertura por cierre errado",
        )

        with patch(
            "app.services.credito_service._obtener_credito_operable_activo",
            return_value=credito,
        ), patch("app.services.credito_service._registrar_historial"), patch(
            "app.services.credito_service.registrar_log"
        ), patch("app.services.credito_service._reabrir_oportunidades_por_reversion_cierre"), patch(
            "app.services.refinanciacion_service.listar_creditos_elegibles"
        ):
            resultado = cambiar_estado(MagicMock(), 10, data, SimpleNamespace(id=1))

        self.assertEqual(resultado.estado, "Aprobado")
        self.assertEqual(resultado.situacion_credito, "PENDIENTE_CIERRE")

    def test_aprobar_exige_fecha_fin_posterior_a_desembolso(self):
        with self.assertRaises(ValueError):
            CreditoCambioEstado(
                estado_nuevo="Aprobado",
                monto_aprobado=1000,
                fecha_desembolso=date(2026, 1, 1),
                fecha_fin_estimada=date(2026, 1, 1),
            )

    def test_finalizar_exige_motivo_finalizacion(self):
        with self.assertRaises(ValueError):
            CreditoCambioEstado(estado_nuevo="Finalizado")

    def test_finalizar_normaliza_motivo_finalizacion(self):
        data = CreditoCambioEstado(
            estado_nuevo="Finalizado",
            motivo_finalizacion=" refinanciado ",
        )

        self.assertEqual(data.motivo_finalizacion, "REFINANCIADO")

    def test_finalizar_acepta_compra_cartera_como_motivo(self):
        for motivo in ["COMPRA_CARTERA_INTERNA", "COMPRA_CARTERA_EXTERNA"]:
            data = CreditoCambioEstado(
                estado_nuevo="Finalizado",
                motivo_finalizacion=motivo,
            )

            self.assertEqual(data.motivo_finalizacion, motivo)

    def test_aprobar_exige_fecha_fin_exacta_segun_plazo(self):
        from app.services.credito_service import _validar_fecha_fin_por_plazo

        with self.assertRaises(HTTPException):
            _validar_fecha_fin_por_plazo(
                date(2026, 1, 1),
                date(2026, 12, 1),
                12,
            )

    def test_aprobar_exige_regla_refinanciacion_para_plazo(self):
        credito = SimpleNamespace(
            plazo=24,
            cooperativa=SimpleNamespace(
                reglas_refinanciacion=[
                    SimpleNamespace(plazo_minimo=12, plazo_maximo=14, meses_para_refinanciar=6)
                ]
            ),
        )

        with self.assertRaises(HTTPException):
            _validar_regla_refinanciacion_configurada(credito)

    def test_documentos_pendientes_exigen_descripcion_visible_en_ui(self):
        with self.assertRaises(HTTPException):
            _normalizar_pendientes_documentales(True, "   \n  ")

    def test_documentos_pendientes_limpia_lineas_vacias_para_notificacion(self):
        tiene_pendientes, documentos = _normalizar_pendientes_documentales(
            True,
            " Cedula ampliada \n\n  Libranza firmada  ",
        )

        self.assertTrue(tiene_pendientes)
        self.assertEqual(documentos, "Cedula ampliada\nLibranza firmada")

    def test_documentos_pendientes_se_resuelven_al_desactivar_flag(self):
        tiene_pendientes, documentos = _normalizar_pendientes_documentales(
            False,
            "Cedula ampliada",
        )

        self.assertFalse(tiene_pendientes)
        self.assertIsNone(documentos)

    def test_credito_nuevo_rechaza_datos_de_refinanciacion_o_compra_cartera(self):
        with self.assertRaises(HTTPException):
            _validar_tipo_credito(
                MagicMock(),
                pensionado_id=1,
                tipo_credito="NUEVO",
                credito_refinanciado_id=10,
                entidad_financiera_origen=None,
            )

        with self.assertRaises(HTTPException):
            _validar_tipo_credito(
                MagicMock(),
                pensionado_id=1,
                tipo_credito="NUEVO",
                credito_refinanciado_id=None,
                entidad_financiera_origen="Banco externo",
            )

    def test_compra_cartera_exige_entidad_externa_y_no_credito_interno(self):
        with self.assertRaises(HTTPException):
            _validar_tipo_credito(
                MagicMock(),
                pensionado_id=1,
                tipo_credito="COMPRA CARTERA",
                credito_refinanciado_id=None,
                entidad_financiera_origen=None,
            )

        with self.assertRaises(HTTPException):
            _validar_tipo_credito(
                MagicMock(),
                pensionado_id=1,
                tipo_credito="COMPRA CARTERA",
                credito_refinanciado_id=10,
                entidad_financiera_origen="Banco externo",
            )


if __name__ == "__main__":
    unittest.main()
