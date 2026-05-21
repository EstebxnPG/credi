# Crediconfiemos

Crediconfiemos is a full-stack credit intermediation management system designed for teams that handle pensioner loan applications, operational follow-up, document tracking, reporting, and administrative catalogs.

The project combines a FastAPI backend, a Next.js dashboard, PostgreSQL persistence, Alembic migrations, and containerized local infrastructure with Docker Compose.

## Features

- JWT-based authentication and protected dashboard routes.
- Pensioner management with contact, identity, and commercial history data.
- Credit application workflows with status updates and audit history.
- Follow-up tracking for operational and commercial actions.
- Document upload, replacement, versioning, and tracking.
- Administrative catalogs for users, offices, cooperatives, and payroll entities.
- Operational dashboard with credit, follow-up, and document indicators.
- Reporting and audit log endpoints for management visibility.

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Backend | FastAPI, SQLAlchemy, Pydantic, Uvicorn |
| Database | PostgreSQL 16 |
| Migrations | Alembic |
| Object Storage | MinIO-compatible storage |
| Infrastructure | Docker, Docker Compose |
| Authentication | JWT, bcrypt password hashing |

## Architecture

```text
credi/
|-- backend/              # FastAPI application, domain services, schemas, models, API routes
|-- frontend/             # Next.js dashboard and client-side API integration
|-- data/                 # Shared data assets and migration mount point
|-- docs/                 # Project documentation
|-- docker-compose.yml    # Local development infrastructure
`-- .env.example          # Environment variable template
```

The backend exposes REST endpoints under `/api/v1`, while the frontend consumes those endpoints through `NEXT_PUBLIC_API_URL`. PostgreSQL stores application data, Alembic manages schema migrations, and MinIO is prepared for document/object storage workflows.

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Git
- Node.js 20+ and Python 3.11+ only if you want to run services outside Docker

### 1. Clone the repository

```bash
git clone <repository-url>
cd credi
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Update `.env` with secure local values before running the application. Never commit real credentials, production secrets, or customer data.

### 3. Start the local stack

```bash
docker compose up -d --build
```

Services will be available at:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- API documentation: `http://localhost:8000/docs`
- MinIO console: `http://localhost:9001`
- PostgreSQL: `localhost:5432`

### 4. Run database migrations

```bash
docker exec credi_backend alembic -c data/migrations/alembic.ini upgrade head
```

## Development

### Backend

The backend service is located in `backend/` and follows a layered structure:

- `api/v1/`: HTTP route handlers.
- `schemas/`: Pydantic request and response models.
- `db/models/`: SQLAlchemy models.
- `services/`: Business logic.
- `core/`: Configuration, security, and dependency utilities.

Useful local commands:

```bash
docker exec credi_backend uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
docker exec credi_backend alembic -c data/migrations/alembic.ini revision --autogenerate -m "describe change"
docker exec credi_backend alembic -c data/migrations/alembic.ini upgrade head
```

### Frontend

The frontend service is located in `frontend/` and uses the Next.js App Router.

Useful local commands:

```bash
cd frontend
npm install
npm run dev
npm run build
```

## API Overview

Main API modules:

- `/api/v1/auth`
- `/api/v1/usuarios`
- `/api/v1/pensionados`
- `/api/v1/creditos`
- `/api/v1/seguimientos`
- `/api/v1/documentos`
- `/api/v1/reportes`
- `/api/v1/logs`
- `/api/v1/oficinas`
- `/api/v1/cooperativas`
- `/api/v1/pagadurias`
- `/api/v1/refinanciaciones`

Interactive documentation is generated automatically by FastAPI at `/docs`.

## Git Workflow

Recommended branch prefixes:

- `feature/` for new functionality.
- `fix/` for bug fixes.
- `chore/` for maintenance.
- `data/` for data, migrations, or analytics work.

Use Conventional Commits when possible:

```text
feat: add credit follow-up dashboard
fix: validate pensioner document number
chore: update local Docker configuration
```

## Public Repository Checklist

Before making this repository public, review the following:

- Ensure `.env` is not tracked and contains no real secrets in Git history.
- Remove temporary files and generated test artifacts.
- Remove uploaded documents or any personally identifiable information.
- Confirm that sample credentials are safe and clearly marked as development-only.
- Add a license if you want others to know how they may use the project.

## Status

This repository is currently structured as a local development project. Production deployment should include hardened secret management, stricter CORS configuration, persistent object storage configuration, automated tests, CI/CD, observability, backups, and environment-specific deployment settings.
