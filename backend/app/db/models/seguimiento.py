from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.db.mixins import SoftDeleteMixin


class Seguimiento(Base, SoftDeleteMixin):
    __tablename__ = "seguimientos"

    id: Mapped[int] = mapped_column(primary_key=True)
    pensionado_id: Mapped[int] = mapped_column(ForeignKey("pensionados.id"), nullable=False)
    oficina_id: Mapped[int] = mapped_column(ForeignKey("oficinas.id"), nullable=False)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False)
    tipo: Mapped[str] = mapped_column(String(40), nullable=False)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="abierto", index=True)
    comentario: Mapped[str] = mapped_column(Text, nullable=False)
    resultado: Mapped[str | None] = mapped_column(String(80))
    fecha_proximo_contacto: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )

    pensionado: Mapped["Pensionado"] = relationship(back_populates="seguimientos")
    oficina: Mapped["Oficina"] = relationship(back_populates="seguimientos")
    usuario: Mapped["Usuario"] = relationship(back_populates="seguimientos")
    soluciones: Mapped[list["SeguimientoSolucion"]] = relationship(
        back_populates="seguimiento",
        cascade="all, delete-orphan",
        order_by="SeguimientoSolucion.created_at.desc()",
    )


class SeguimientoSolucion(Base):
    __tablename__ = "seguimiento_soluciones"

    id: Mapped[int] = mapped_column(primary_key=True)
    seguimiento_id: Mapped[int] = mapped_column(
        ForeignKey("seguimientos.id"), nullable=False, index=True
    )
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False, index=True)
    comentario: Mapped[str] = mapped_column(Text, nullable=False)
    resultado: Mapped[str | None] = mapped_column(String(80))
    estado_resultante: Mapped[str | None] = mapped_column(String(20))
    fecha_proximo_contacto: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()"), nullable=False
    )

    seguimiento: Mapped["Seguimiento"] = relationship(back_populates="soluciones")
    usuario: Mapped["Usuario"] = relationship()
