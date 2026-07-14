import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import HTTPException

from app.schemas.credito import CreditoCambioEstado
from app.services.credito_service import (
    _validar_regla_refinanciacion_configurada,
    _validar_contexto_creacion,
    _validar_credito_editable,
    _validar_tipo_credito,
)


class CreditosTests(unittest.TestCase):
    def test_credito_aprobado_no_es_editable_aunque_este_activo(self):
        credito = SimpleNamespace(is_active=True, estado="Aprobado")

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
        with self.assertRaises(ValueError):
            CreditoCambioEstado(estado_nuevo="Aprobado", monto_aprobado=1000)

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


if __name__ == "__main__":
    unittest.main()
