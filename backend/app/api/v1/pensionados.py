from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas.pensionado import PensionadoCreate, PensionadoLookup, PensionadoRead, PensionadoUpdate
from app.services.pensionado_service import PensionadoService
from typing import List
from app.core.dependencies import get_current_user, solo_admin
from app.db.models.usuario import Usuario

router = APIRouter(prefix="/pensionados", tags=["Pensionados"])

@router.post("/", response_model=PensionadoRead, status_code=201)
def crear_pensionado(
    data: PensionadoCreate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    return PensionadoService(db).crear(data, usuario)

@router.get("/", response_model=List[PensionadoRead])
def listar_pensionados(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    solo_activos: bool = False,
    texto: str | None = None,
    activo: bool | None = None,
    response: Response = None,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    service = PensionadoService(db)
    total = service.contar(usuario=usuario, solo_activos=solo_activos, texto=texto, activo=activo)
    if response is not None:
        response.headers["X-Total-Count"] = str(total)

    return service.listar(
        usuario=usuario, skip=skip,
        limit=limit,
        solo_activos=solo_activos,
        texto=texto,
        activo=activo,
    )

@router.get("/buscar/documento/{documento}", response_model=PensionadoLookup)
def buscar_pensionado_por_documento(
    documento: str,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    return PensionadoService(db).buscar_por_documento(documento, usuario)

@router.post("/{pensionado_id}/vincular-mi-oficina", response_model=PensionadoRead)
def vincular_pensionado_mi_oficina(
    pensionado_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    return PensionadoService(db).vincular_a_mi_oficina(pensionado_id, usuario)

@router.get("/{pensionado_id}", response_model=PensionadoRead)
def obtener_pensionado(
    pensionado_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    return PensionadoService(db).obtener_o_404(pensionado_id, usuario)

@router.patch("/{pensionado_id}", response_model=PensionadoRead)
def actualizar_pensionado(
    pensionado_id: int,
    data: PensionadoUpdate,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    return PensionadoService(db).actualizar(pensionado_id, data, usuario)

@router.delete("/{pensionado_id}", response_model=PensionadoRead)
def eliminar_pensionado(
    pensionado_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(solo_admin),
):
    return PensionadoService(db).eliminar(pensionado_id, usuario)
