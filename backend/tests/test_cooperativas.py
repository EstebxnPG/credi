import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import HTTPException

from app.schemas.cooperativa import CooperativaUpdate
from app.services.cooperativa_service import actualizar_cooperativa, validar_credito_contra_cooperativa


class CooperativasTests(unittest.TestCase):
    def test_update_rechaza_regla_refinanciacion_fuera_del_rango_de_plazo(self):
        db = MagicMock()
        cooperativa = SimpleNamespace(
            id=1,
            nombre="Coop",
            edad_minima=18,
            edad_maxima=90,
            monto_minimo=1_000_000,
            monto_maximo=50_000_000,
            plazo_minimo=6,
            plazo_maximo=24,
        )
        db.query.return_value.filter.return_value.first.return_value = cooperativa
        data = CooperativaUpdate(
            reglas_refinanciacion=[
                {"plazo_minimo": 25, "plazo_maximo": 36, "meses_para_refinanciar": 6}
            ]
        )

        with self.assertRaises(HTTPException):
            actualizar_cooperativa(db, 1, data)

    def test_update_guarda_regla_refinanciacion_por_porcentaje(self):
        db = MagicMock()
        cooperativa = SimpleNamespace(
            id=1,
            nombre="Coop",
            edad_minima=18,
            edad_maxima=90,
            monto_minimo=1_000_000,
            monto_maximo=50_000_000,
            plazo_minimo=6,
            plazo_maximo=36,
            reglas_refinanciacion=[],
        )
        db.query.return_value.filter.return_value.first.return_value = cooperativa
        data = CooperativaUpdate(
            reglas_refinanciacion=[
                {
                    "plazo_minimo": 12,
                    "plazo_maximo": 36,
                    "tipo_liberacion": "porcentaje",
                    "meses_para_refinanciar": None,
                    "porcentaje_credito": 40,
                }
            ]
        )

        actualizar_cooperativa(db, 1, data)

        [regla] = cooperativa.reglas_refinanciacion
        self.assertEqual(regla.tipo_liberacion, "porcentaje")
        self.assertIsNone(regla.meses_para_refinanciar)
        self.assertEqual(regla.porcentaje_credito, 40)

    def test_validacion_credito_permite_fecha_nacimiento_no_registrada(self):
        cooperativa = SimpleNamespace(
            edad_minima=18,
            edad_maxima=79,
            monto_minimo=1,
            monto_maximo=9_999_999_999,
            plazo_minimo=36,
            plazo_maximo=96,
        )

        errores = validar_credito_contra_cooperativa(
            cooperativa=cooperativa,
            edad_pensionado=None,
            monto=3_000_000,
            plazo=63,
        )

        self.assertEqual(errores, [])

    def test_validacion_credito_sigue_validando_edad_si_existe(self):
        cooperativa = SimpleNamespace(
            edad_minima=18,
            edad_maxima=79,
            monto_minimo=1,
            monto_maximo=9_999_999_999,
            plazo_minimo=36,
            plazo_maximo=96,
        )

        errores = validar_credito_contra_cooperativa(
            cooperativa=cooperativa,
            edad_pensionado=80,
            monto=3_000_000,
            plazo=63,
        )

        self.assertIn("maximo permitido: 79", errores[0])


if __name__ == "__main__":
    unittest.main()
