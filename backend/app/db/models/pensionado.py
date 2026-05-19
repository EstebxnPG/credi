from datetime import date
from sqlalchemy import String, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.db.mixins import TimestampMixin, SoftDeleteMixin


class Pensionado(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "pensionados"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    documento: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    fecha_nacimiento: Mapped[date] = mapped_column(Date, nullable=False)
    telefono: Mapped[str | None] = mapped_column(String(20))
    celular: Mapped[str | None] = mapped_column(String(20))
    direccion: Mapped[str] = mapped_column(String(200), nullable=False)
    fecha_inicio_pension: Mapped[date] = mapped_column(Date, nullable=False)

    creditos: Mapped[list["Credito"]] = relationship(back_populates="pensionado")
    seguimientos: Mapped[list["Seguimiento"]] = relationship(back_populates="pensionado")
