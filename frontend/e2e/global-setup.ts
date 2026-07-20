import { chromium, request, type FullConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const ADMIN = {
  correo: "admin.e2e@crediconfiemos.com",
  contrasena: "AdminE2E2026*",
};

const ASESORA = {
  correo: "asesora.e2e@crediconfiemos.com",
  contrasena: "AsesoraE2E2026*",
};

function dockerExecPython(code: string) {
  execFileSync("docker", ["exec", "credi_backend", "python", "-c", code], {
    cwd: path.resolve(__dirname, "../.."),
    stdio: "inherit",
  });
}

async function waitForHttp(url: string) {
  const context = await request.newContext();
  const deadline = Date.now() + 30_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await context.get(url);
      if (response.ok()) {
        await context.dispose();
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  await context.dispose();
  throw new Error(`No respondió ${url}. Último error: ${String(lastError)}`);
}

async function writeStorageState(baseURL: string, user: typeof ADMIN, outputPath: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  await page.goto("/login");
  await page.getByPlaceholder("Ingresa tu correo").fill(user.correo);
  await page.getByPlaceholder("Ingresa tu contraseña").fill(user.contrasena);
  await page.getByRole("button", { name: "Entrar al panel" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
  await page.context().storageState({ path: outputPath });
  await browser.close();
}

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL as string;
  await waitForHttp(`${baseURL}/login`);
  await waitForHttp("http://localhost:8000/health");

  dockerExecPython(`
from datetime import datetime, timezone
from app.db.session import SessionLocal
from app.db.models.usuario import Usuario
from app.db.models.notificacion import Notificacion, NotificacionLectura
from app.core.security import hash_password

db = SessionLocal()

def upsert_user(correo, password, nombre, documento, rol, oficina_id):
    user = db.query(Usuario).filter(Usuario.correo == correo).first()
    if not user:
        user = Usuario(
            oficina_id=oficina_id,
            nombre=nombre,
            documento=documento,
            correo=correo,
            contrasena=hash_password(password),
            rol=rol,
            intentos_fallidos=0,
            is_active=True,
        )
        db.add(user)
    else:
        user.nombre = nombre
        user.contrasena = hash_password(password)
        user.rol = rol
        user.oficina_id = oficina_id
        user.is_active = True
        user.intentos_fallidos = 0
    db.flush()
    return user

admin = upsert_user("${ADMIN.correo}", "${ADMIN.contrasena}", "Admin E2E", "990000001", "administrador", 1)
asesora = upsert_user("${ASESORA.correo}", "${ASESORA.contrasena}", "Asesora E2E", "990000002", "asesora", 1)

def upsert_notification(clave, oficina_id, titulo, mensaje, responsable_id=None):
    item = db.query(Notificacion).filter(Notificacion.clave == clave).first()
    if not item:
        item = Notificacion(clave=clave)
        db.add(item)
    item.oficina_id = oficina_id
    item.responsable_id = responsable_id
    item.tipo = "e2e_alerta"
    item.clase = "accion"
    item.estado = "pendiente"
    item.titulo = titulo
    item.mensaje = mensaje
    item.prioridad = "alta"
    item.href = "/creditos"
    item.entidad_tipo = "e2e"
    item.entidad_id = oficina_id
    item.pensionado_id = None
    item.fecha = datetime.now(timezone.utc)
    item.leida = False
    item.leida_en = None
    item.pospuesta_hasta = None
    item.justificacion = None
    item.resuelta_en = None
    item.resuelta_por = None

upsert_notification("e2e-admin-oficina-1", 1, "E2E oficina principal", "Alerta visible para admin y asesora oficina 1")
upsert_notification("e2e-admin-oficina-2", 2, "E2E oficina dos", "Alerta visible para admin, no para asesora oficina 1")

e2e_ids = [
    row[0]
    for row in db.query(Notificacion.id)
    .filter(Notificacion.clave.in_(["e2e-admin-oficina-1", "e2e-admin-oficina-2"]))
    .all()
]
if e2e_ids:
    db.query(NotificacionLectura).filter(NotificacionLectura.notificacion_id.in_(e2e_ids)).delete(synchronize_session=False)

db.commit()
db.close()
`);

  const authDir = path.resolve(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });
  await writeStorageState(baseURL, ADMIN, path.join(authDir, "admin.json"));
  await writeStorageState(baseURL, ASESORA, path.join(authDir, "asesora.json"));
}

export default globalSetup;
