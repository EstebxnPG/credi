from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
# imports (arriba)
from app.api.v1 import (
    auth,
    usuarios,
    pensionados,
    oficinas,
    cooperativas,
    creditos,
    pagadurias,
    refinanciaciones,
    logs,
    documentos,
    reportes,
    seguimientos,
    pendientes_credito,
    notificaciones,
)

app = FastAPI(
    title="Crediconfiemos API",
    description="Sistema de gestión para intermediación de créditos a pensionados",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Total-Count",
        "X-Count-Hoy",
        "X-Count-Proximos",
        "X-Count-Gestionados",
        "X-Count-Convertidos",
    ],
)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "crediconfiemos-backend"}


app.include_router(auth.router,         prefix="/api/v1")
app.include_router(usuarios.router,     prefix="/api/v1")
app.include_router(pensionados.router,  prefix="/api/v1")
app.include_router(oficinas.router,     prefix="/api/v1")
app.include_router(cooperativas.router, prefix="/api/v1")
app.include_router(pagadurias.router,   prefix="/api/v1")
app.include_router(refinanciaciones.router, prefix="/api/v1")
app.include_router(logs.router, prefix="/api/v1")
app.include_router(documentos.router, prefix="/api/v1")
app.include_router(reportes.router, prefix="/api/v1")
app.include_router(seguimientos.router, prefix="/api/v1")
app.include_router(pendientes_credito.router, prefix="/api/v1")
app.include_router(notificaciones.router, prefix="/api/v1")

# include_router (abajo)
app.include_router(creditos.router, prefix="/api/v1")
