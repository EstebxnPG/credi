from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.schemas.usuario import UsuarioCreate, UsuarioRead, UsuarioUpdate
from app.services.usuario_service import UsuarioService
from app.core.dependencies import solo_admin

router = APIRouter(prefix="/usuarios", tags=["Usuarios"])

@router.post("/", response_model=UsuarioRead, status_code=201)
def crear_usuario(
    data: UsuarioCreate,
    db: Session = Depends(get_db),
    _: object = Depends(solo_admin)  # solo admin puede crear usuarios
):
    return UsuarioService(db).crear(data)

@router.get("/", response_model=List[UsuarioRead])
def listar_usuarios(
    skip: int = 0, limit: int = 100,
    db: Session = Depends(get_db),
    _: object = Depends(solo_admin)
):
    return UsuarioService(db).listar(skip=skip, limit=limit)

@router.get("/{usuario_id}", response_model=UsuarioRead)
def obtener_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(solo_admin)
):
    return UsuarioService(db).obtener_o_404(usuario_id)

@router.patch("/{usuario_id}", response_model=UsuarioRead)
def actualizar_usuario(
    usuario_id: int,
    data: UsuarioUpdate,
    db: Session = Depends(get_db),
    _: object = Depends(solo_admin)
):
    return UsuarioService(db).actualizar(usuario_id, data)

@router.patch("/{usuario_id}/desbloquear", response_model=UsuarioRead)
def desbloquear_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(solo_admin)
):
    return UsuarioService(db).desbloquear(usuario_id)

@router.delete("/{usuario_id}", status_code=204)
def eliminar_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(solo_admin)
):
    UsuarioService(db).eliminar(usuario_id)
