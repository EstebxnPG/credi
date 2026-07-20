import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.schemas.usuario import LoginRequest
from app.services.usuario_service import LOGIN_ERROR, UsuarioService


class UsuariosTests(unittest.TestCase):
    def test_login_no_revela_si_correo_existe(self):
        service = UsuarioService(MagicMock())
        service.repo.get_by_correo = MagicMock(return_value=None)

        with self.assertRaises(HTTPException) as error:
            service.login(
                LoginRequest(
                    correo="noexiste@crediconfiemos.com",
                    contrasena="cualquier-password",
                )
            )

        self.assertEqual(error.exception.status_code, 401)
        self.assertEqual(error.exception.detail, LOGIN_ERROR)

    def test_login_con_password_incorrecto_usa_mismo_mensaje_generico(self):
        service = UsuarioService(MagicMock())
        usuario = SimpleNamespace(
            id=1,
            correo="admin@crediconfiemos.com",
            contrasena="hash",
            is_active=True,
            intentos_fallidos=0,
        )
        service.repo.get_by_correo = MagicMock(return_value=usuario)
        service.repo.incrementar_intentos = MagicMock()

        with patch("app.services.usuario_service.verify_password", return_value=False):
            with self.assertRaises(HTTPException) as error:
                service.login(
                    LoginRequest(
                        correo="admin@crediconfiemos.com",
                        contrasena="password-malo",
                    )
                )

        self.assertEqual(error.exception.status_code, 401)
        self.assertEqual(error.exception.detail, LOGIN_ERROR)
        service.repo.incrementar_intentos.assert_called_once_with(usuario)


if __name__ == "__main__":
    unittest.main()
