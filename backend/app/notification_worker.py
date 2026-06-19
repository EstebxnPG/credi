import logging
import time
from app.db.session import SessionLocal
from app.services.notificacion_service import sincronizar_reglas

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("notification-worker")

def run_once():
    with SessionLocal() as db:
        creadas = sincronizar_reglas(db)
        log.info("Sincronización terminada: %s alertas creadas", creadas)

if __name__ == "__main__":
    while True:
        try: run_once()
        except Exception: log.exception("Falló la sincronización")
        time.sleep(3600)
