import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from pydantic import ValidationError

from app.schemas.seguimiento import SeguimientoCreate, SeguimientoSolucionCreate, SeguimientoUpdate
from app.services.seguimiento_service import actualizar_seguimiento, agregar_solucion, crear_seguimiento


class SeguimientosTests(unittest.TestCase):
    def test_pendiente_exige_fecha_y_hora_en_creacion(self):
        with self.assertRaises(ValidationError):
            SeguimientoCreate(
                pensionado_id=1,
                oficina_id=1,
                tipo="llamada",
                estado="pendiente",
                comentario="Cliente pide llamada",
            )

    def test_pendiente_exige_fecha_y_hora_en_actualizacion(self):
        with self.assertRaises(ValidationError):
            SeguimientoUpdate(estado="pendiente")

    def test_solucion_pendiente_exige_fecha_y_hora(self):
        with self.assertRaises(ValidationError):
            SeguimientoSolucionCreate(
                comentario="No contesto llamada",
                estado_resultante="pendiente",
            )

    def test_fecha_proximo_contacto_no_permite_antes_de_las_ocho(self):
        with self.assertRaises(ValidationError):
            SeguimientoCreate(
                pensionado_id=1,
                oficina_id=1,
                tipo="llamada",
                estado="pendiente",
                comentario="Cliente pide llamada",
                fecha_proximo_contacto=datetime(2026, 1, 1, 7, 59, tzinfo=timezone.utc),
            )

    def test_fecha_proximo_contacto_no_permite_despues_de_cinco_y_media(self):
        with self.assertRaises(ValidationError):
            SeguimientoSolucionCreate(
                comentario="Reagendar contacto con cliente",
                estado_resultante="pendiente",
                fecha_proximo_contacto=datetime(2026, 1, 1, 17, 31, tzinfo=timezone.utc),
            )

    def test_fecha_proximo_contacto_permite_cinco_y_media(self):
        item = SeguimientoUpdate(
            estado="pendiente",
            fecha_proximo_contacto=datetime(2026, 1, 1, 17, 30, tzinfo=timezone.utc),
        )

        self.assertEqual(item.fecha_proximo_contacto.hour, 17)
        self.assertEqual(item.fecha_proximo_contacto.minute, 30)

    def test_crear_seguimiento_sincroniza_solo_alerta_puntual(self):
        db = MagicMock()
        usuario = SimpleNamespace(id=9, rol="asesora", oficina_id=1)
        data = SeguimientoCreate(
            pensionado_id=10,
            oficina_id=1,
            tipo="llamada",
            estado="abierto",
            comentario="Cliente pide seguimiento",
        )

        with patch("app.services.seguimiento_service._get_pensionado_activo_or_404"), patch(
            "app.services.seguimiento_service._get_oficina_activa_or_404"
        ), patch("app.services.seguimiento_service.registrar_log"), patch(
            "app.services.seguimiento_service.obtener_seguimiento", return_value="ok"
        ), patch("app.services.notificacion_service.sincronizar_seguimiento") as sync:
            result = crear_seguimiento(db, data, usuario)

        self.assertEqual(result, "ok")
        seguimiento = sync.call_args.args[1]
        self.assertEqual(seguimiento.pensionado_id, 10)
        self.assertEqual(seguimiento.oficina_id, 1)
        self.assertEqual(seguimiento.usuario_id, 9)
        sync.assert_called_once_with(db, seguimiento)
        db.commit.assert_called_once()

    def test_actualizar_seguimiento_cambia_estado(self):
        db = MagicMock()
        seguimiento = SimpleNamespace(
            id=5,
            oficina_id=1,
            estado="abierto",
            resultado=None,
            fecha_proximo_contacto=None,
        )
        usuario = SimpleNamespace(id=9, rol="asesora", oficina_id=1)
        data = SeguimientoUpdate(
            estado="esperando",
            resultado="revision_interna",
            fecha_proximo_contacto=None,
        )

        with patch("app.services.seguimiento_service._get_seguimiento_activo_or_404", return_value=seguimiento), patch(
            "app.services.seguimiento_service.obtener_seguimiento", return_value="ok"
        ), patch("app.services.seguimiento_service.registrar_log"), patch(
            "app.services.notificacion_service.sincronizar_seguimiento"
        ) as sync:
            result = actualizar_seguimiento(db, 5, data, usuario)

        self.assertEqual(result, "ok")
        self.assertEqual(seguimiento.estado, "esperando")
        self.assertEqual(seguimiento.resultado, "revision_interna")
        sync.assert_called_once_with(db, seguimiento)
        db.commit.assert_called_once()

    def test_agregar_solucion_actualiza_estado_resultante(self):
        db = MagicMock()
        seguimiento = SimpleNamespace(
            id=5,
            oficina_id=1,
            estado="pendiente",
            resultado=None,
            fecha_proximo_contacto=datetime.now(timezone.utc),
        )
        usuario = SimpleNamespace(id=9, rol="asesora", oficina_id=1)
        data = SeguimientoSolucionCreate(
            comentario="Luisa no contesto, se cierra por ahora",
            resultado="no_contesto",
            estado_resultante="cerrado",
        )

        with patch("app.services.seguimiento_service._get_seguimiento_activo_or_404", return_value=seguimiento), patch(
            "app.services.seguimiento_service.obtener_seguimiento", return_value="ok"
        ), patch("app.services.seguimiento_service.registrar_log"), patch(
            "app.services.notificacion_service.sincronizar_seguimiento"
        ) as sync:
            result = agregar_solucion(db, 5, data, usuario)

        self.assertEqual(result, "ok")
        self.assertEqual(seguimiento.estado, "cerrado")
        self.assertEqual(seguimiento.resultado, "no_contesto")
        self.assertIsNone(seguimiento.fecha_proximo_contacto)
        sync.assert_called_once_with(db, seguimiento)
        db.add.assert_called_once()
        db.commit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
