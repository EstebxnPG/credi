from datetime import date
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.db.models.usuario import Usuario
from app.services.reporte_service import obtener_metricas_reporte, obtener_resumen_creditos_reporte, obtener_resumen_reportes
from app.services.credito_export_service import DEFAULT_COLUMNS, exportar_creditos


router = APIRouter(prefix="/reportes", tags=["Reportes"])


@router.get("/resumen")
def obtener_resumen(
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return obtener_resumen_reportes(db, usuario_actual)


@router.get("/creditos/resumen")
def obtener_resumen_creditos(
    desde: date | None = None,
    hasta: date | None = None,
    oficina_id: int | None = None,
    texto: str | None = Query(None),
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return obtener_resumen_creditos_reporte(
        db,
        usuario_actual,
        oficina_id=oficina_id,
        fecha_desde=desde,
        fecha_hasta=hasta,
        texto=texto,
    )


@router.get("/{reporte}/metricas")
def obtener_metricas(
    reporte: str,
    desde: date | None = None,
    hasta: date | None = None,
    oficina_id: int | None = None,
    texto: str | None = Query(None),
    estado_comercial: str | None = Query(None),
    db: Session = Depends(get_db),
    usuario_actual: Usuario = Depends(get_current_user),
):
    return obtener_metricas_reporte(
        db,
        usuario_actual,
        reporte=reporte,
        oficina_id=oficina_id,
        fecha_desde=desde,
        fecha_hasta=hasta,
        texto=texto,
        estado_comercial=estado_comercial,
    )


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
