from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.db.models.usuario import Usuario
from app.services.reporte_service import obtener_resumen_reportes


router = APIRouter(prefix="/reportes", tags=["Reportes"])


@router.get("/resumen")
def obtener_resumen(
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return obtener_resumen_reportes(db, usuario_actual)
