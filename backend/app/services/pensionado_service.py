from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.db.repositories.pensionado_repo import PensionadoRepository
from app.schemas.pensionado import PensionadoCreate, PensionadoUpdate

class PensionadoService:

    def __init__(self, db: Session):
        self.repo = PensionadoRepository(db)

    def crear(self, data: PensionadoCreate):
        existente = self.repo.get_by_documento(data.documento)
        if existente:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Ya existe un pensionado con documento {data.documento}"
            )
        return self.repo.create(data)

    def obtener_o_404(self, pensionado_id: int):
        pensionado = self.repo.get_by_id(pensionado_id)
        if not pensionado:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pensionado no encontrado"
            )
        return pensionado

    def listar(self, skip: int = 0, limit: int = 100, solo_activos: bool = False):
        return self.repo.get_all(skip=skip, limit=limit, solo_activos=solo_activos)

    def actualizar(self, pensionado_id: int, data: PensionadoUpdate):
        pensionado = self.obtener_o_404(pensionado_id)
        return self.repo.update(pensionado, data)

    def eliminar(self, pensionado_id: int):
        pensionado = self.obtener_o_404(pensionado_id)
        return self.repo.soft_delete(pensionado)
