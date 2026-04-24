from datetime import datetime
from sqlalchemy import String, ForeignKey, Text, DateTime, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class HistorialCredito(Base):
    __tablename__ = "historial_creditos"

    id: Mapped[int] = mapped_column(primary_key=True)
    credito_id: Mapped[int] = mapped_column(ForeignKey("creditos.id"), nullable=False)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    estado_anterior: Mapped[str | None] = mapped_column(String(30))
    estado_nuevo: Mapped[str] = mapped_column(String(30), nullable=False)
    observacion: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )

    credito: Mapped["Credito"] = relationship(back_populates="historial")
    usuario: Mapped["Usuario"] = relationship(back_populates="historial")
