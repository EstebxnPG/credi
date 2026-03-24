from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas.pensionado import PensionadoCreate, PensionadoRead, PensionadoUpdate
from app.services.pensionado_service import PensionadoService
from typing import List

router = APIRouter(prefix="/pensionados", tags=["Pensionados"])

@router.post("/", response_model=PensionadoRead, status_code=201)
def crear_pensionado(data: PensionadoCreate, db: Session = Depends(get_db)):
    return PensionadoService(db).crear(data)

@router.get("/", response_model=List[PensionadoRead])
def listar_pensionados(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return PensionadoService(db).listar(skip=skip, limit=limit)

@router.get("/{pensionado_id}", response_model=PensionadoRead)
def obtener_pensionado(pensionado_id: int, db: Session = Depends(get_db)):
    return PensionadoService(db).obtener_o_404(pensionado_id)

@router.patch("/{pensionado_id}", response_model=PensionadoRead)
def actualizar_pensionado(pensionado_id: int, data: PensionadoUpdate, db: Session = Depends(get_db)):
    return PensionadoService(db).actualizar(pensionado_id, data)

@router.delete("/{pensionado_id}", response_model=PensionadoRead)
def eliminar_pensionado(pensionado_id: int, db: Session = Depends(get_db)):
    return PensionadoService(db).eliminar(pensionado_id)