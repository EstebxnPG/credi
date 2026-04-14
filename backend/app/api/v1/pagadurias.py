"""
api/v1/pagadurias.py
Router de Pagadurías - sin lógica, solo delega al servicio.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db, solo_admin
from app.db.models.usuario import Usuario
from app.schemas.pagaduria import PagaduriaCreate, PagaduriaRead, PagaduriaUpdate
from app.services import pagaduria_service

router = APIRouter(prefix="/pagadurias", tags=["Pagadurías"])


@router.post("/", response_model=PagaduriaRead, status_code=201)
def crear_pagaduria(
    data: PagaduriaCreate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(solo_admin),
):
    return pagaduria_service.crear_pagaduria(db, data)


@router.get("/", response_model=list[PagaduriaRead])
def listar_pagadurias(
    solo_activas: bool = Query(True, description="Filtrar solo pagadurías activas"),
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return pagaduria_service.listar_pagadurias(db, solo_activas)


@router.get("/{pagaduria_id}", response_model=PagaduriaRead)
def obtener_pagaduria(
    pagaduria_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    return pagaduria_service.obtener_pagaduria(db, pagaduria_id)


@router.patch("/{pagaduria_id}", response_model=PagaduriaRead)
def actualizar_pagaduria(
    pagaduria_id: int,
    data: PagaduriaUpdate,
    db: Session = Depends(get_db),
    _: Usuario = Depends(solo_admin),
):
    return pagaduria_service.actualizar_pagaduria(db, pagaduria_id, data)


@router.delete("/{pagaduria_id}", response_model=PagaduriaRead)
def desactivar_pagaduria(
    pagaduria_id: int,
    db: Session = Depends(get_db),
    _: Usuario = Depends(solo_admin),
):
    """Soft delete: marca is_active=False. No elimina el registro."""
    return pagaduria_service.desactivar_pagaduria(db, pagaduria_id)
