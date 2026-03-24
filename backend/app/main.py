from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Crediconfiemos API",
    description="Sistema de gestión para intermediación de créditos a pensionados",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "crediconfiemos-backend"}

# En app/main.py, agrega:
from app.api.v1 import pensionados

app.include_router(pensionados.router, prefix="/api/v1")

from app.api.v1 import auth, usuarios

app.include_router(auth.router, prefix="/api/v1")
app.include_router(usuarios.router, prefix="/api/v1")