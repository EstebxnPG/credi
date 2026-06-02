from datetime import date, datetime
from sqlalchemy import String, Integer, Numeric, Date, DateTime, ForeignKey, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.db.mixins import TimestampMixin, SoftDeleteMixin


class Credito(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "creditos"

    id: Mapped[int] = mapped_column(primary_key=True)
    pensionado_id: Mapped[int] = mapped_column(ForeignKey("pensionados.id"), nullable=False)
    asesor_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    oficina_id: Mapped[int] = mapped_column(ForeignKey("oficinas.id"), nullable=False)
    cooperativa_id: Mapped[int] = mapped_column(ForeignKey("cooperativas.id"), nullable=False)
    pagaduria_id: Mapped[int] = mapped_column(ForeignKey("pagadurias.id"), nullable=False)
    nro_libranza: Mapped[str | None] = mapped_column(String(50))
    tipo_credito: Mapped[str | None] = mapped_column(String(50))
    monto_solicitado: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    monto_aprobado: Mapped[float | None] = mapped_column(Numeric(12, 2))
    plazo: Mapped[int] = mapped_column(Integer, nullable=False)
    estado: Mapped[str] = mapped_column(String(30), nullable=False, default="Prospecto")
    valor_cuota: Mapped[float | None] = mapped_column(Numeric(12, 2))
    fecha_desembolso: Mapped[date | None] = mapped_column(Date)
    fecha_fin_estimada: Mapped[date | None] = mapped_column(Date)
    observaciones: Mapped[str | None] = mapped_column(Text)
    tiene_documentos_pendientes: Mapped[bool] = mapped_column(default=False, nullable=False)
    documentos_pendientes: Mapped[str | None] = mapped_column(Text)
    fecha_registro: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )

    pensionado: Mapped["Pensionado"] = relationship(back_populates="creditos")
    asesor: Mapped["Usuario"] = relationship(back_populates="creditos")
    oficina: Mapped["Oficina"] = relationship(back_populates="creditos")
    cooperativa: Mapped["Cooperativa"] = relationship(back_populates="creditos")
    pagaduria: Mapped["Pagaduria"] = relationship(back_populates="creditos")
    documentos: Mapped[list["Documento"]] = relationship(back_populates="credito")
    pendientes: Mapped[list["PendienteCredito"]] = relationship(back_populates="credito")
    historial: Mapped[list["HistorialCredito"]] = relationship(back_populates="credito")
    refinanciaciones: Mapped[list["Refinanciacion"]] = relationship(back_populates="credito")
