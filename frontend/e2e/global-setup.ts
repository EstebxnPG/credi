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
      lastError = `HTTP ${response.status()} ${response.statusText()}`;
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
from datetime import date
from app.db.session import SessionLocal
from app.db.models.oficina import Oficina
from app.db.models.usuario import Usuario
from app.db.models.pensionado import Pensionado, PensionadoOficina
from app.db.models.cooperativa import Cooperativa
from app.db.models.pagaduria import Pagaduria
from app.db.models.credito import Credito
from app.db.models.notificacion import Notificacion, NotificacionLectura
from app.core.security import hash_password

db = SessionLocal()

def upsert_office(office_id, nombre, color):
    office = db.get(Oficina, office_id)
    if not office:
        office = Oficina(id=office_id, nombre=nombre, direccion=f"Direccion {nombre}", color=color)
        db.add(office)
    else:
        office.nombre = nombre
        office.direccion = f"Direccion {nombre}"
        office.color = color
        office.is_active = True
    db.flush()
    return office

office_one = upsert_office(1, "E2E oficina principal", "teal")
office_two = upsert_office(2, "E2E oficina dos", "blue")

def upsert_user(correo, password, nombre, documento, rol, oficina_id):
    user = db.query(Usuario).filter(
        (Usuario.correo == correo) | (Usuario.documento == documento)
    ).first()
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
        user.documento = documento
        user.correo = correo
        user.contrasena = hash_password(password)
        user.rol = rol
        user.oficina_id = oficina_id
        user.is_active = True
        user.intentos_fallidos = 0
    db.flush()
    return user

admin = upsert_user("${ADMIN.correo}", "${ADMIN.contrasena}", "Admin E2E", "990000001", "administrador", 1)
asesora = upsert_user("${ASESORA.correo}", "${ASESORA.contrasena}", "Asesora E2E", "990000002", "asesora", 1)

def upsert_cooperativa():
    item = db.query(Cooperativa).filter(Cooperativa.nombre == "Cooperativa E2E").first()
    if not item:
        item = Cooperativa(nombre="Cooperativa E2E")
        db.add(item)
    item.edad_minima = 18
    item.edad_maxima = 95
    item.monto_minimo = 100000
    item.monto_maximo = 50000000
    item.plazo_minimo = 6
    item.plazo_maximo = 84
    item.simulador_url = "https://example.com/simulador-e2e"
    item.is_active = True
    db.flush()
    return item

def upsert_pagaduria():
    item = db.query(Pagaduria).filter(Pagaduria.nombre == "Pagaduria E2E").first()
    if not item:
        item = Pagaduria(nombre="Pagaduria E2E")
        db.add(item)
    item.is_active = True
    db.flush()
    return item

cooperativa = upsert_cooperativa()
pagaduria = upsert_pagaduria()

def upsert_pensionado(documento, nombre, oficina_id):
    item = db.query(Pensionado).filter(Pensionado.documento == documento).first()
    if not item:
        item = Pensionado(documento=documento)
        db.add(item)
    item.oficina_id = oficina_id
    item.created_by = admin.id
    item.nombre = nombre
    item.segundo_nombre = None
    item.apellidos = "Prueba QA"
    item.genero = "No especificado"
    item.fecha_nacimiento = date(1962, 5, 20)
    item.correo = f"{documento}@e2e.test"
    item.telefono = "6015550101"
    item.celular = "3005550101"
    item.direccion = "Direccion E2E"
    item.is_active = True
    db.flush()
    link = db.query(PensionadoOficina).filter(
        PensionadoOficina.pensionado_id == item.id,
        PensionadoOficina.oficina_id == oficina_id,
    ).first()
    if not link:
        db.add(PensionadoOficina(pensionado_id=item.id, oficina_id=oficina_id, created_by=admin.id))
    return item

pensionado_main = upsert_pensionado("880001001", "Alfa E2E", 1)
pensionado_other = upsert_pensionado("880001002", "Beta E2E", 2)

def upsert_credito(nro_libranza, pensionado, asesor, oficina_id, estado="Prospecto"):
    item = db.query(Credito).filter(Credito.nro_libranza == nro_libranza).first()
    if not item:
        item = Credito(nro_libranza=nro_libranza)
        db.add(item)
    item.pensionado_id = pensionado.id
    item.asesor_id = asesor.id
    item.oficina_id = oficina_id
    item.cooperativa_id = cooperativa.id
    item.pagaduria_id = pagaduria.id
    item.credito_refinanciado_id = None
    item.tipo_credito = "NUEVO"
    item.entidad_financiera_origen = None
    item.monto_solicitado = 2500000
    item.monto_aprobado = 2500000 if estado == "Aprobado" else None
    item.plazo = 24
    item.estado = estado
    item.valor_cuota = 125000 if estado == "Aprobado" else None
    item.fecha_desembolso = date(2026, 1, 15) if estado == "Aprobado" else None
    item.fecha_fin_estimada = date(2028, 1, 15) if estado == "Aprobado" else None
    item.observaciones = "Credito semilla E2E"
    item.tiene_documentos_pendientes = False
    item.documentos_pendientes = None
    item.is_active = True
    db.flush()
    return item

upsert_credito("E2E-LIB-001", pensionado_main, asesora, 1)
upsert_credito("E2E-LIB-002", pensionado_other, admin, 2)

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
