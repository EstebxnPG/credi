import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import HTTPException

from app.db.repositories.pensionado_repo import PensionadoRepository
from app.services.pensionado_service import PensionadoService


class PensionadosTests(unittest.TestCase):
    def test_get_by_id_filtra_inactivos_por_defecto(self):
        db = MagicMock()
        repo = PensionadoRepository(db)

        repo.get_by_id(10)

        stmt = db.execute.call_args.args[0]
        self.assertIn("pensionados.is_active = true", str(stmt))

    def test_busqueda_por_nombre_compuesto_tokeniza_texto(self):
        db = MagicMock()
        repo = PensionadoRepository(db)

        repo.get_all(texto="damian es")

        stmt = db.execute.call_args.args[0]
        compiled = stmt.compile(compile_kwargs={"literal_binds": True})
        sql = str(compiled).lower()

        self.assertIn("%damian%", sql)
        self.assertIn("%es%", sql)
        self.assertNotIn("%damian es%", sql)
        self.assertIn("concat", sql)

    def test_obtener_o_404_no_devuelve_pensionado_inactivo(self):
        service = PensionadoService(MagicMock())
        service.repo.get_by_id = MagicMock(return_value=None)
        usuario = SimpleNamespace(rol="administrador", oficina_id=1)

        with self.assertRaises(HTTPException):
            service.obtener_o_404(10, usuario)

        service.repo.get_by_id.assert_called_once_with(10, None)


if __name__ == "__main__":
    unittest.main()
