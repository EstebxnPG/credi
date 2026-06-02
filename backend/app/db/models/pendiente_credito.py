from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PendienteCredito(Base):
    __tablename__ = "pendientes_credito"

    id: Mapped[int] = mapped_column(primary_key=True)
    credito_id: Mapped[int] = mapped_column(ForeignKey("creditos.id"), nullable=False)
    documento_id: Mapped[int | None] = mapped_column(ForeignKey("documentos.id"))
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="pendiente")
    origen: Mapped[str] = mapped_column(String(30), nullable=False, default="cooperativa")
    observacion_resolucion: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    resolved_by: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    credito: Mapped["Credito"] = relationship(back_populates="pendientes")
    documento: Mapped["Documento"] = relationship()
    creador: Mapped["Usuario"] = relationship(foreign_keys=[created_by])
    resolvedor: Mapped["Usuario"] = relationship(foreign_keys=[resolved_by])
