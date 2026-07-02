import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import HTTPException

from app.schemas.cooperativa import CooperativaUpdate
from app.services.cooperativa_service import actualizar_cooperativa


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


if __name__ == "__main__":
    unittest.main()
