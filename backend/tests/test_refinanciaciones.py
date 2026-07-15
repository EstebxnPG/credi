import unittest
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.refinanciacion import OportunidadEstadoUpdate
from app.services.refinanciacion_service import (
    cambiar_estado_oportunidad,
    validar_credito_refinanciable,
    _meses_desde,
    _sumar_meses,
)


class RefinanciacionesTests(unittest.TestCase):
    def test_suma_meses_ajusta_fin_de_mes(self):
        self.assertEqual(_sumar_meses(date(2026, 1, 31), 1), date(2026, 2, 28))

    def test_meses_completos_no_redondea_antes_del_dia(self):
        self.assertEqual(_meses_desde(date(2026, 1, 20), date(2026, 2, 19)), 0)
        self.assertEqual(_meses_desde(date(2026, 1, 20), date(2026, 2, 20)), 1)

    def test_estado_comercial_invalido_es_rechazado(self):
        with self.assertRaises(ValidationError):
            OportunidadEstadoUpdate(estado="convertido")

    def test_estado_comercial_pospuesto_es_valido(self):
        data = OportunidadEstadoUpdate(
            estado="pospuesto",
            justificacion="Cliente moroso",
            reactivar_en=datetime.now(timezone.utc) + timedelta(days=365),
        )

        self.assertEqual(data.estado, "pospuesto")

    def test_credito_no_refinanciable_antes_de_regla_cooperativa(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None
        credito = SimpleNamespace(
            id=1,
            estado="Aprobado",
            is_active=True,
            plazo=12,
            fecha_desembolso=date.today(),
            cooperativa=SimpleNamespace(
                is_active=True,
                reglas_refinanciacion=[
                    SimpleNamespace(plazo_minimo=12, plazo_maximo=24, meses_para_refinanciar=6)
                ],
            ),
        )

        with self.assertRaises(HTTPException):
            validar_credito_refinanciable(db, credito)

    def test_credito_finalizado_no_es_refinanciable(self):
        db = MagicMock()
        credito = SimpleNamespace(
            id=1,
            estado="Finalizado",
            motivo_finalizacion="REFINANCIADO",
            is_active=True,
            plazo=12,
            fecha_desembolso=date(2025, 1, 1),
            cooperativa=SimpleNamespace(is_active=True, reglas_refinanciacion=[]),
        )

        with self.assertRaises(HTTPException):
            validar_credito_refinanciable(db, credito)

    def test_credito_no_refinanciable_antes_de_porcentaje_requerido(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None
        credito = SimpleNamespace(
            id=1,
            estado="Aprobado",
            is_active=True,
            plazo=100,
            fecha_desembolso=date.today() - timedelta(days=30 * 20),
            cooperativa=SimpleNamespace(
                is_active=True,
                reglas_refinanciacion=[
                    SimpleNamespace(
                        plazo_minimo=1,
                        plazo_maximo=120,
                        tipo_liberacion="porcentaje",
                        meses_para_refinanciar=None,
                        porcentaje_credito=40,
                    )
                ],
            ),
        )

        with self.assertRaises(HTTPException):
            validar_credito_refinanciable(db, credito)

    def test_credito_refinanciable_por_porcentaje_requerido(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None
        credito = SimpleNamespace(
            id=1,
            estado="Aprobado",
            is_active=True,
            plazo=100,
            fecha_desembolso=date.today() - timedelta(days=30 * 45),
            cooperativa=SimpleNamespace(
                is_active=True,
                reglas_refinanciacion=[
                    SimpleNamespace(
                        plazo_minimo=1,
                        plazo_maximo=120,
                        tipo_liberacion="porcentaje",
                        meses_para_refinanciar=None,
                        porcentaje_credito=40,
                    )
                ],
            ),
        )

        validar_credito_refinanciable(db, credito)

    def test_oportunidad_rechazada_no_cambia_antes_de_reactivacion(self):
        credito = SimpleNamespace(
            id=1,
            estado="Aprobado",
            is_active=True,
            plazo=12,
            fecha_desembolso=date(2025, 1, 1),
            cooperativa=SimpleNamespace(
                is_active=True,
                reglas_refinanciacion=[
                    SimpleNamespace(plazo_minimo=12, plazo_maximo=24, meses_para_refinanciar=1)
                ],
            ),
        )
        oportunidad = SimpleNamespace(
            id=9,
            estado="rechazado",
            reactivar_en=datetime.now(timezone.utc) + timedelta(days=5),
            credito=credito,
        )
        query = MagicMock()
        query.filter.return_value = query
        query.first.return_value = oportunidad
        db = MagicMock()
        db.query.return_value = query
        usuario = SimpleNamespace(id=1, rol="administrador", oficina_id=1)
        data = OportunidadEstadoUpdate(estado="contactado")

        with self.assertRaises(HTTPException):
            cambiar_estado_oportunidad(db, 9, data, usuario)

    def test_oportunidad_pospuesta_puede_quitarse_manualmente(self):
        credito = SimpleNamespace(
            id=1,
            estado="Aprobado",
            is_active=True,
            plazo=12,
            fecha_desembolso=date(2025, 1, 1),
            cooperativa=SimpleNamespace(
                is_active=True,
                reglas_refinanciacion=[
                    SimpleNamespace(plazo_minimo=12, plazo_maximo=24, meses_para_refinanciar=1)
                ],
            ),
        )
        oportunidad = SimpleNamespace(
            id=9,
            credito_id=1,
            estado="pospuesto",
            justificacion="Cliente moroso",
            reactivar_en=datetime.now(timezone.utc) + timedelta(days=365),
            credito=credito,
        )
        notificacion = SimpleNamespace(
            estado="resuelta",
            resuelta_en=datetime.now(timezone.utc),
            resuelta_por=3,
        )

        oportunidad_query = MagicMock()
        oportunidad_query.filter.return_value = oportunidad_query
        oportunidad_query.first.return_value = oportunidad
        notificacion_query = MagicMock()
        notificacion_query.filter.return_value = notificacion_query
        notificacion_query.first.return_value = notificacion
        db = MagicMock()
        db.query.side_effect = [oportunidad_query, notificacion_query]
        usuario = SimpleNamespace(id=3, rol="administrador", oficina_id=1)

        with patch("app.services.refinanciacion_service.registrar_log"), patch(
            "app.services.notificacion_service.sincronizar_reglas"
        ):
            cambiar_estado_oportunidad(
                db,
                9,
                OportunidadEstadoUpdate(
                    estado="disponible",
                    justificacion="Se pospuso el credito equivocado",
                ),
                usuario,
            )

        self.assertEqual(oportunidad.estado, "disponible")
        self.assertIsNone(oportunidad.reactivar_en)
        self.assertEqual(notificacion.estado, "pendiente")

    def test_oportunidad_aceptada_resuelve_notificacion(self):
        credito = SimpleNamespace(
            id=1,
            estado="Aprobado",
            is_active=True,
            plazo=12,
            fecha_desembolso=date(2025, 1, 1),
            cooperativa=SimpleNamespace(
                is_active=True,
                reglas_refinanciacion=[
                    SimpleNamespace(plazo_minimo=12, plazo_maximo=24, meses_para_refinanciar=1)
                ],
            ),
        )
        oportunidad = SimpleNamespace(
            id=9,
            credito_id=1,
            estado="contactado",
            justificacion=None,
            reactivar_en=None,
            credito=credito,
        )
        notificacion = SimpleNamespace(
            estado="pendiente",
            resuelta_en=None,
            resuelta_por=None,
        )

        oportunidad_query = MagicMock()
        oportunidad_query.filter.return_value = oportunidad_query
        oportunidad_query.first.return_value = oportunidad
        notificacion_query = MagicMock()
        notificacion_query.filter.return_value = notificacion_query
        notificacion_query.first.return_value = notificacion
        db = MagicMock()
        db.query.side_effect = [oportunidad_query, notificacion_query]
        usuario = SimpleNamespace(id=3, rol="administrador", oficina_id=1)

        with patch("app.services.refinanciacion_service.registrar_log"), patch(
            "app.services.notificacion_service.sincronizar_reglas"
        ):
            cambiar_estado_oportunidad(db, 9, OportunidadEstadoUpdate(estado="aceptado"), usuario)

        self.assertEqual(oportunidad.estado, "aceptado")
        self.assertEqual(notificacion.estado, "resuelta")
        self.assertEqual(notificacion.resuelta_por, 3)


if __name__ == "__main__":
    unittest.main()
