from sqlalchemy import String, Numeric, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.db.mixins import TimestampMixin, SoftDeleteMixin


class Cooperativa(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "cooperativas"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    edad_minima: Mapped[int] = mapped_column(Integer, nullable=False)
    edad_maxima: Mapped[int] = mapped_column(Integer, nullable=False)
    monto_minimo: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    monto_maximo: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    plazo_minimo: Mapped[int] = mapped_column(Integer, nullable=False)
    plazo_maximo: Mapped[int] = mapped_column(Integer, nullable=False)
    tiempo_minimo_pension: Mapped[int] = mapped_column(Integer, nullable=False)
    porcentaje_comision: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)

    creditos: Mapped[list["Credito"]] = relationship(back_populates="cooperativa")