from datetime import date
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.db.models.usuario import Usuario
from app.services.reporte_service import obtener_resumen_reportes
from app.services.credito_export_service import DEFAULT_COLUMNS, exportar_creditos


router = APIRouter(prefix="/reportes", tags=["Reportes"])


@router.get("/resumen")
def obtener_resumen(
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return obtener_resumen_reportes(db, usuario_actual)


@router.get("/creditos/exportar.xlsx")
def exportar_reporte_creditos(
    columnas: str | None = Query(None), desde: date | None = None, hasta: date | None = None,
    oficina_id: int | None = None, monto_desde: float | None = Query(None, ge=0), monto_hasta: float | None = Query(None, ge=0),
    db: Session = Depends(get_db), usuario_actual: Usuario = Depends(get_current_user),
):
    seleccion = columnas.split(",") if columnas else DEFAULT_COLUMNS
    archivo = exportar_creditos(db, usuario_actual, seleccion, desde, hasta, oficina_id, monto_desde, monto_hasta)
    nombre = f"creditos_{date.today().isoformat()}.xlsx"
    return StreamingResponse(archivo, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{nombre}"'})
