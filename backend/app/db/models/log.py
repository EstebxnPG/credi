from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, DateTime, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB
from app.db.base import Base


class Log(Base):
    __tablename__ = "logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    tabla_afectada: Mapped[str] = mapped_column(String(50), nullable=False)
    registro_afectado: Mapped[int] = mapped_column(Integer, nullable=False)
    tipo_accion: Mapped[str] = mapped_column(String(20), nullable=False)
    valores_antes: Mapped[dict | None] = mapped_column(JSONB)
    valores_despues: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )

    usuario: Mapped["Usuario"] = relationship(back_populates="logs")
