from sqlalchemy import String, Numeric, Integer, ForeignKey
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
    creditos: Mapped[list["Credito"]] = relationship(back_populates="cooperativa")
    reglas_refinanciacion: Mapped[list["CooperativaRefinanciacionRegla"]] = relationship(
        back_populates="cooperativa",
        cascade="all, delete-orphan",
    )


class CooperativaRefinanciacionRegla(Base):
    __tablename__ = "cooperativa_refinanciacion_reglas"

    id: Mapped[int] = mapped_column(primary_key=True)
    cooperativa_id: Mapped[int] = mapped_column(ForeignKey("cooperativas.id"), nullable=False)
    plazo_minimo: Mapped[int] = mapped_column(Integer, nullable=False)
    plazo_maximo: Mapped[int] = mapped_column(Integer, nullable=False)
    meses_para_refinanciar: Mapped[int] = mapped_column(Integer, nullable=False)

    cooperativa: Mapped["Cooperativa"] = relationship(back_populates="reglas_refinanciacion")
