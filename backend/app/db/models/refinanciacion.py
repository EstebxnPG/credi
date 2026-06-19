from datetime import datetime
from sqlalchemy import String, Integer, Numeric, ForeignKey, DateTime, Text, UniqueConstraint, text
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


class OportunidadRefinanciacion(Base):
    __tablename__ = "oportunidades_refinanciacion"
    __table_args__ = (UniqueConstraint("credito_id", name="uq_oportunidad_refinanciacion_credito"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    credito_id: Mapped[int] = mapped_column(ForeignKey("creditos.id"), nullable=False)
    oficina_id: Mapped[int] = mapped_column(ForeignKey("oficinas.id"), nullable=False, index=True)
    responsable_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="disponible", index=True)
    justificacion: Mapped[str | None] = mapped_column(Text)
    reactivar_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    credito_nuevo_id: Mapped[int | None] = mapped_column(ForeignKey("creditos.id"), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), onupdate=text("now()"), nullable=False)

    credito: Mapped["Credito"] = relationship(foreign_keys=[credito_id])
    responsable: Mapped["Usuario | None"] = relationship(foreign_keys=[responsable_id])
    historial: Mapped[list["HistorialOportunidadRefinanciacion"]] = relationship(back_populates="oportunidad", cascade="all, delete-orphan")


class HistorialOportunidadRefinanciacion(Base):
    __tablename__ = "historial_oportunidades_refinanciacion"
    id: Mapped[int] = mapped_column(primary_key=True)
    oportunidad_id: Mapped[int] = mapped_column(ForeignKey("oportunidades_refinanciacion.id", ondelete="CASCADE"), nullable=False, index=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    estado_anterior: Mapped[str | None] = mapped_column(String(20))
    estado_nuevo: Mapped[str] = mapped_column(String(20), nullable=False)
    justificacion: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    oportunidad: Mapped["OportunidadRefinanciacion"] = relationship(back_populates="historial")
