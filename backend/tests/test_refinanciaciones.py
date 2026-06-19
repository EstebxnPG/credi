import unittest
from datetime import date
from pydantic import ValidationError

from app.schemas.refinanciacion import OportunidadEstadoUpdate
from app.services.refinanciacion_service import _meses_desde, _sumar_meses


class RefinanciacionesTests(unittest.TestCase):
    def test_suma_meses_ajusta_fin_de_mes(self):
        self.assertEqual(_sumar_meses(date(2026, 1, 31), 1), date(2026, 2, 28))

    def test_meses_completos_no_redondea_antes_del_dia(self):
        self.assertEqual(_meses_desde(date(2026, 1, 20), date(2026, 2, 19)), 0)
        self.assertEqual(_meses_desde(date(2026, 1, 20), date(2026, 2, 20)), 1)

    def test_estado_comercial_invalido_es_rechazado(self):
        with self.assertRaises(ValidationError):
            OportunidadEstadoUpdate(estado="convertido")


if __name__ == "__main__":
    unittest.main()
