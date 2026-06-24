import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

from datetime import datetime, timedelta, timezone

from app.services.notificacion_service import _alcance, _crear_si_falta, _reactivar


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

    def test_reactivar_resuelta_limpia_campos_de_cierre(self):
        item = SimpleNamespace(
            estado="resuelta",
            leida=True,
            leida_en=datetime.now(timezone.utc),
            resuelta_en=datetime.now(timezone.utc),
            resuelta_por=1,
            pospuesta_hasta=None,
            titulo="Anterior",
        )

        cambio = _reactivar(item, {"estado": "pendiente", "titulo": "Nueva"}, False)

        self.assertTrue(cambio)
        self.assertEqual(item.estado, "pendiente")
        self.assertFalse(item.leida)
        self.assertIsNone(item.leida_en)
        self.assertIsNone(item.resuelta_en)
        self.assertIsNone(item.resuelta_por)
        self.assertEqual(item.titulo, "Nueva")

    def test_reactivar_respeta_pospuesta_vigente(self):
        futuro = datetime.now(timezone.utc) + timedelta(days=1)
        item = SimpleNamespace(
            estado="pospuesta",
            leida=True,
            leida_en=datetime.now(timezone.utc),
            resuelta_en=None,
            resuelta_por=None,
            pospuesta_hasta=futuro,
            titulo="Anterior",
        )

        cambio = _reactivar(item, {"estado": "pendiente", "leida": False, "titulo": "Nueva"}, False)

        self.assertTrue(cambio)
        self.assertEqual(item.estado, "pospuesta")
        self.assertTrue(item.leida)
        self.assertEqual(item.pospuesta_hasta, futuro)
        self.assertEqual(item.titulo, "Nueva")


if __name__ == "__main__":
    unittest.main()
