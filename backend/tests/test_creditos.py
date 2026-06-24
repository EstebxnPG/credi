import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from app.services.credito_service import _validar_contexto_creacion, _validar_credito_editable


class CreditosTests(unittest.TestCase):
    def test_credito_aprobado_no_es_editable_aunque_este_activo(self):
        credito = SimpleNamespace(is_active=True, estado="Aprobado")

        with self.assertRaises(HTTPException):
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


if __name__ == "__main__":
    unittest.main()
