from datetime import datetime
from sqlalchemy import String, Integer, Numeric, ForeignKey, DateTime, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class Refinanciacion(Base):
    __tablename__ = "refinanciaciones"

    id: Mapped[int] = mapped_column(primary_key=True)
    credito_id: Mapped[int] = mapped_column(ForeignKey("creditos.id"), nullable=False)
    obligacion_externa: Mapped[str | None] = mapped_column(String(100))
    entidad: Mapped[str | None] = mapped_column(String(100))
    valor_refinanciacion: Mapped[float | None] = mapped_column(Numeric(12, 2))
    valor_cuota_recoge: Mapped[float | None] = mapped_column(Numeric(12, 2))
    cuotas_recoge: Mapped[int | None] = mapped_column(Integer)
    nro_cuotas_anterior: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )

    credito: Mapped["Credito"] = relationship(back_populates="refinanciaciones")
