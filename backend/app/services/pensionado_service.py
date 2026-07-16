from datetime import date

from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from fastapi.encoders import jsonable_encoder
from app.db.repositories.pensionado_repo import PensionadoRepository
from app.schemas.pensionado import PensionadoCreate, PensionadoUpdate
from app.db.models.usuario import Usuario
from app.services.log_service import registrar_log

class PensionadoService:

    def __init__(self, db: Session):
        self.repo = PensionadoRepository(db)

    def crear(self, data: PensionadoCreate, usuario: Usuario):
        existente = self.repo.get_by_documento(data.documento)
        if existente:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Ya existe un pensionado con documento {data.documento}"
            )
        pensionado = self.repo.create(data, usuario.oficina_id, usuario.id)
        registrar_log(
            self.repo.db,
            usuario.id,
            "pensionados",
            pensionado.id,
            "crear",
            valores_despues={
                **data.model_dump(),
                "oficina_id": pensionado.oficina_id,
                "created_by": pensionado.created_by,
            },
        )
        self.repo.db.commit()
        return pensionado

    def buscar_por_documento(self, documento: str, usuario: Usuario):
        pensionado = self.repo.get_by_documento(documento.strip())
        if not pensionado or not pensionado.is_active:
            return {"exists": False, "linked_to_current_office": False, "pensionado": None}
        vinculado = (
            True
            if usuario.rol == "administrador"
            else self.repo.esta_vinculado(pensionado.id, usuario.oficina_id)
        )
        return {
            "exists": True,
            "linked_to_current_office": vinculado,
            "pensionado": pensionado,
        }

    def vincular_a_mi_oficina(self, pensionado_id: int, usuario: Usuario):
        if usuario.rol == "administrador":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Un administrador debe operar la vinculacion desde una oficina concreta",
            )
        pensionado = self.repo.get_by_id(pensionado_id, solo_activo=True)
        if not pensionado:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pensionado no encontrado",
            )
        if not self.repo.esta_vinculado(pensionado.id, usuario.oficina_id):
            self.repo.vincular_oficina(pensionado.id, usuario.oficina_id, usuario.id)
            registrar_log(
                self.repo.db,
                usuario.id,
                "pensionado_oficinas",
                pensionado.id,
                "vincular",
                valores_despues={"pensionado_id": pensionado.id, "oficina_id": usuario.oficina_id},
            )
            self.repo.db.commit()
            self.repo.db.refresh(pensionado)
        return pensionado

    def obtener_o_404(self, pensionado_id: int, usuario: Usuario):
        oficina_id = None if usuario.rol == "administrador" else usuario.oficina_id
        pensionado = self.repo.get_by_id(pensionado_id, oficina_id)
        if not pensionado:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pensionado no encontrado"
            )
        return pensionado

    def listar(
        self,
        usuario: Usuario,
        skip: int = 0,
        limit: int = 100,
        solo_activos: bool = False,
        texto: str | None = None,
        activo: bool | None = None,
        oficina_id: int | None = None,
        fecha_desde: date | None = None,
        fecha_hasta: date | None = None,
    ):
        oficina_id = oficina_id if usuario.rol == "administrador" else usuario.oficina_id
        return self.repo.get_all(
            skip=skip,
            limit=limit,
            solo_activos=solo_activos,
            oficina_id=oficina_id,
            texto=texto,
            activo=activo,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
        )

    def contar(
        self,
        usuario: Usuario,
        solo_activos: bool = False,
        texto: str | None = None,
        activo: bool | None = None,
        oficina_id: int | None = None,
        fecha_desde: date | None = None,
        fecha_hasta: date | None = None,
    ) -> int:
        oficina_id = oficina_id if usuario.rol == "administrador" else usuario.oficina_id
        return self.repo.count_all(
            solo_activos=solo_activos,
            oficina_id=oficina_id,
            texto=texto,
            activo=activo,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
        )

    def actualizar(self, pensionado_id: int, data: PensionadoUpdate, usuario: Usuario):
        pensionado = self.obtener_o_404(pensionado_id, usuario)
        cambios = data.model_dump(exclude_unset=True)
        valores_antes = {}
        valores_despues = {}
        for campo, valor_nuevo in cambios.items():
            valor_anterior = getattr(pensionado, campo)
            if jsonable_encoder(valor_anterior) != jsonable_encoder(valor_nuevo):
                valores_antes[campo] = valor_anterior
                valores_despues[campo] = valor_nuevo

        pensionado = self.repo.update(pensionado, data)
        if valores_despues:
            registrar_log(
                self.repo.db,
                usuario.id,
                "pensionados",
                pensionado.id,
                "actualizar",
                valores_antes=valores_antes,
                valores_despues=valores_despues,
            )
            self.repo.db.commit()
        return pensionado

    def eliminar(self, pensionado_id: int, usuario: Usuario):
        pensionado = self.obtener_o_404(pensionado_id, usuario)
        pensionado = self.repo.soft_delete(pensionado)
        registrar_log(
            self.repo.db,
            usuario.id,
            "pensionados",
            pensionado.id,
            "desactivar",
            valores_antes={"is_active": True},
            valores_despues={"is_active": False},
        )
        self.repo.db.commit()
        return pensionado
