import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services.notificacion_service import _alcance, _crear_si_falta


class NotificacionesTests(unittest.TestCase):
    def test_deduplicacion_no_inserta_clave_existente(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = (1,)
        self.assertFalse(_crear_si_falta(db, clave="unica"))
        db.add.assert_not_called()

    def test_administrador_no_es_restringido_por_oficina(self):
        query = MagicMock()
        self.assertIs(_alcance(query, SimpleNamespace(rol="administrador", oficina_id=1)), query)
        query.filter.assert_not_called()

    def test_asesora_es_restringida_a_su_oficina(self):
        query = MagicMock()
        _alcance(query, SimpleNamespace(rol="asesora", oficina_id=7))
        query.filter.assert_called_once()


if __name__ == "__main__":
    unittest.main()
