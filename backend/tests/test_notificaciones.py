import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from app.db.models.notificacion import Notificacion
from app.db.models.usuario import Usuario
from app.schemas.notificacion import NotificacionEstadoUpdate
from app.services.notificacion_service import (
    _alcance,
    _aplicar_lectura_usuario,
    _crear_si_falta,
    _datos_seguimiento,
    _reactivar,
    sincronizar_reglas,
    cambiar_estado,
)


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

    def test_reactivar_resuelta_no_reabre_sin_forzar(self):
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

        self.assertFalse(cambio)
        self.assertEqual(item.estado, "resuelta")
        self.assertEqual(item.titulo, "Anterior")

    def test_reactivar_resuelta_limpia_campos_de_cierre_si_se_fuerza(self):
        item = SimpleNamespace(
            estado="resuelta",
            leida=True,
            leida_en=datetime.now(timezone.utc),
            resuelta_en=datetime.now(timezone.utc),
            resuelta_por=1,
            pospuesta_hasta=None,
            titulo="Anterior",
        )

        cambio = _reactivar(item, {"estado": "pendiente", "titulo": "Nueva"}, True)

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

    def test_reactivar_no_deja_fecha_lectura_si_queda_sin_leer(self):
        item = SimpleNamespace(
            estado="pendiente",
            leida=False,
            leida_en=datetime.now(timezone.utc),
            resuelta_en=None,
            resuelta_por=None,
            pospuesta_hasta=None,
            titulo="Anterior",
        )

        cambio = _reactivar(item, {"estado": "pendiente", "leida": False, "titulo": "Nueva"}, False)

        self.assertTrue(cambio)
        self.assertFalse(item.leida)
        self.assertIsNone(item.leida_en)

    def test_reactivar_preserva_lectura_en_alerta_existente(self):
        leida_en = datetime.now(timezone.utc)
        item = SimpleNamespace(
            estado="pendiente",
            leida=True,
            leida_en=leida_en,
            resuelta_en=None,
            resuelta_por=None,
            pospuesta_hasta=None,
            responsable_id=None,
            titulo="Anterior",
        )

        cambio = _reactivar(item, {"leida": False, "leida_en": None, "titulo": "Nueva"}, False)

        self.assertTrue(cambio)
        self.assertTrue(item.leida)
        self.assertEqual(item.leida_en, leida_en)
        self.assertEqual(item.titulo, "Nueva")

    def test_reactivar_preserva_responsable_manual_si_regla_no_asigna(self):
        item = SimpleNamespace(
            estado="pendiente",
            leida=False,
            leida_en=None,
            resuelta_en=None,
            resuelta_por=None,
            pospuesta_hasta=None,
            responsable_id=3,
            titulo="Anterior",
        )

        cambio = _reactivar(item, {"responsable_id": None, "titulo": "Nueva"}, False)

        self.assertTrue(cambio)
        self.assertEqual(item.responsable_id, 3)
        self.assertEqual(item.titulo, "Nueva")

    def test_responsable_nombre_sale_de_la_relacion(self):
        item = Notificacion()
        item.responsable = Usuario(nombre="LUIS")

        self.assertEqual(item.responsable_nombre, "LUIS")

    def test_en_progreso_asigna_usuario_si_no_hay_responsable(self):
        db = MagicMock()
        item = SimpleNamespace(
            id=13,
            clase="accion",
            estado="pendiente",
            responsable_id=None,
            justificacion=None,
            pospuesta_hasta=None,
            resuelta_en=None,
            resuelta_por=None,
        )
        usuario = SimpleNamespace(id=3, rol="asesora", oficina_id=1)

        with patch("app.services.notificacion_service._get", return_value=item), patch(
            "app.services.notificacion_service.registrar_log"
        ):
            cambiar_estado(db, usuario, 13, NotificacionEstadoUpdate(estado="en_progreso"))

        self.assertEqual(item.estado, "en_progreso")
        self.assertEqual(item.responsable_id, 3)
        db.commit.assert_called_once()

    def test_en_progreso_no_reasigna_si_ya_tiene_responsable(self):
        db = MagicMock()
        item = SimpleNamespace(
            id=13,
            clase="accion",
            estado="pendiente",
            responsable_id=2,
            justificacion=None,
            pospuesta_hasta=None,
            resuelta_en=None,
            resuelta_por=None,
        )
        usuario = SimpleNamespace(id=3, rol="asesora", oficina_id=1)

        with patch("app.services.notificacion_service._get", return_value=item), patch(
            "app.services.notificacion_service.registrar_log"
        ):
            cambiar_estado(db, usuario, 13, NotificacionEstadoUpdate(estado="en_progreso"))

        self.assertEqual(item.estado, "en_progreso")
        self.assertEqual(item.responsable_id, 2)

    def test_lectura_calculada_no_depende_del_estado_global(self):
        leida_en = datetime.now(timezone.utc)
        item = SimpleNamespace(id=100, leida=True, leida_en=leida_en)

        _aplicar_lectura_usuario([item], {})

        self.assertFalse(item.leida)
        self.assertIsNone(item.leida_en)

        _aplicar_lectura_usuario([item], {100: leida_en})

        self.assertTrue(item.leida)
        self.assertEqual(item.leida_en, leida_en)

    def test_regla_seguimiento_manana_genera_alerta_media(self):
        hoy = datetime(2026, 7, 20, tzinfo=timezone.utc).date()
        fecha_contacto = datetime(2026, 7, 21, 8, 0, tzinfo=timezone.utc)

        self.assertEqual(
            _datos_seguimiento(fecha_contacto, hoy),
            ("antes", "Seguimiento mañana", "media"),
        )

    def test_regla_seguimiento_hoy_genera_alerta_alta(self):
        hoy = datetime(2026, 7, 20, tzinfo=timezone.utc).date()
        fecha_contacto = datetime(2026, 7, 20, 8, 0, tzinfo=timezone.utc)

        self.assertEqual(
            _datos_seguimiento(fecha_contacto, hoy),
            ("hoy", "Seguimiento para hoy", "alta"),
        )

    def test_regla_seguimiento_vencido_genera_alerta_alta(self):
        hoy = datetime(2026, 7, 20, tzinfo=timezone.utc).date()
        fecha_contacto = datetime(2026, 7, 19, 8, 0, tzinfo=timezone.utc)

        self.assertEqual(
            _datos_seguimiento(fecha_contacto, hoy),
            ("vencido", "Seguimiento vencido", "alta"),
        )

    def test_cumpleanos_usa_fecha_de_negocio_colombia(self):
        pensionado = SimpleNamespace(
            id=99,
            oficina_id=1,
            fecha_nacimiento=datetime(2001, 7, 20, tzinfo=timezone.utc).date(),
            nombre_completo="CLIENTE PRUEBA",
        )
        query = MagicMock()
        query.filter.return_value.all.side_effect = [[pensionado], [], []]
        query.filter.return_value.first.return_value = None
        query.all.return_value = []
        db = MagicMock()
        db.query.return_value = query

        with patch("app.services.notificacion_service.listar_creditos_elegibles", return_value=[]):
            cambios = sincronizar_reglas(
                db,
                referencia=datetime(2026, 7, 21, 4, 57, tzinfo=timezone.utc),
                commit=False,
            )

        self.assertEqual(cambios, 1)
        self.assertEqual(db.add.call_args.args[0].clave, "cumpleanos-99-2026-07-20")

    def test_notificacion_informativa_no_puede_pasarse_a_en_progreso(self):
        db = MagicMock()
        item = SimpleNamespace(
            id=13,
            clase="informativa",
            estado="pendiente",
            responsable_id=None,
            justificacion=None,
            pospuesta_hasta=None,
            resuelta_en=None,
            resuelta_por=None,
        )
        usuario = SimpleNamespace(id=3, rol="asesora", oficina_id=1)

        with patch("app.services.notificacion_service._get", return_value=item):
            with self.assertRaises(HTTPException):
                cambiar_estado(db, usuario, 13, NotificacionEstadoUpdate(estado="en_progreso"))

    def test_descartar_exige_justificacion_para_evitar_cierres_silenciosos(self):
        db = MagicMock()
        item = SimpleNamespace(
            id=13,
            clase="accion",
            estado="pendiente",
            responsable_id=None,
            justificacion=None,
            pospuesta_hasta=None,
            resuelta_en=None,
            resuelta_por=None,
        )
        usuario = SimpleNamespace(id=3, rol="asesora", oficina_id=1)

        with patch("app.services.notificacion_service._get", return_value=item):
            with self.assertRaises(HTTPException):
                cambiar_estado(db, usuario, 13, NotificacionEstadoUpdate(estado="descartada"))

    def test_posponer_exige_fecha_futura(self):
        db = MagicMock()
        item = SimpleNamespace(
            id=13,
            clase="accion",
            estado="pendiente",
            responsable_id=None,
            justificacion=None,
            pospuesta_hasta=None,
            resuelta_en=None,
            resuelta_por=None,
        )
        usuario = SimpleNamespace(id=3, rol="asesora", oficina_id=1)

        with patch("app.services.notificacion_service._get", return_value=item):
            with self.assertRaises(HTTPException):
                cambiar_estado(
                    db,
                    usuario,
                    13,
                    NotificacionEstadoUpdate(
                        estado="pospuesta",
                        pospuesta_hasta=datetime.now(timezone.utc) - timedelta(minutes=1),
                    ),
                )

    def test_asesora_no_reabre_notificacion_descartada(self):
        db = MagicMock()
        item = SimpleNamespace(
            id=13,
            clase="accion",
            estado="descartada",
            responsable_id=None,
            justificacion="No aplica",
            pospuesta_hasta=None,
            resuelta_en=datetime.now(timezone.utc),
            resuelta_por=1,
        )
        usuario = SimpleNamespace(id=3, rol="asesora", oficina_id=1)

        with patch("app.services.notificacion_service._get", return_value=item):
            with self.assertRaises(HTTPException):
                cambiar_estado(db, usuario, 13, NotificacionEstadoUpdate(estado="pendiente"))


if __name__ == "__main__":
    unittest.main()
