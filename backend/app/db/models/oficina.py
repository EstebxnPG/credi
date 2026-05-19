from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.db.mixins import TimestampMixin, SoftDeleteMixin


class Oficina(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "oficinas"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    direccion: Mapped[str] = mapped_column(String(200), nullable=False)

    usuarios: Mapped[list["Usuario"]] = relationship(back_populates="oficina")
    creditos: Mapped[list["Credito"]] = relationship(back_populates="oficina")
    seguimientos: Mapped[list["Seguimiento"]] = relationship(back_populates="oficina")
