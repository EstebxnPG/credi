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
    comentario: Mapped[str] = mapped_column(Text, nullable=False)
    resultado: Mapped[str | None] = mapped_column(String(80))
    fecha_proximo_contacto: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )

    pensionado: Mapped["Pensionado"] = relationship(back_populates="seguimientos")
    oficina: Mapped["Oficina"] = relationship(back_populates="seguimientos")
    usuario: Mapped["Usuario"] = relationship(back_populates="seguimientos")
