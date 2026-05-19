from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.db.mixins import TimestampMixin, SoftDeleteMixin


class Usuario(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(primary_key=True)
    oficina_id: Mapped[int] = mapped_column(ForeignKey("oficinas.id"), nullable=False)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    documento: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    correo: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    contrasena: Mapped[str] = mapped_column(String(255), nullable=False)
    rol: Mapped[str] = mapped_column(String(20), nullable=False)
    intentos_fallidos: Mapped[int] = mapped_column(Integer, default=0)
    ultimo_acceso: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    oficina: Mapped["Oficina"] = relationship(back_populates="usuarios")
    creditos: Mapped[list["Credito"]] = relationship(back_populates="asesor")
    historial: Mapped[list["HistorialCredito"]] = relationship(back_populates="usuario")
    logs: Mapped[list["Log"]] = relationship(back_populates="usuario")
    seguimientos: Mapped[list["Seguimiento"]] = relationship(back_populates="usuario")
