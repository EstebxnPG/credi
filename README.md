# Crediconfiemos
Sistema de gestión para intermediación de créditos a pensionados.

## Stack
- Backend: FastAPI + PostgreSQL + SQLAlchemy
- Frontend: React
- Infraestructura: Docker

## Setup
```bash
cp .env.example .env
docker-compose up -d
```

## Estructura
- `backend/` — API REST
- `frontend/` — Interfaz de usuario
- `data/` — Migraciones, seeds, notebooks de análisis
- `docs/` — Documentación del proyecto

## Flujo Git
- Ramas: `feature/`, `fix/`, `chore/`, `data/`
- Commits: Conventional Commits
- PRs siempre hacia `develop`