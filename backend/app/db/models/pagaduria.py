from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.db.mixins import TimestampMixin, SoftDeleteMixin


class Pagaduria(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "pagadurias"

    id: Mapped[int] = mapped_column(primary_key=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)

    creditos: Mapped[list["Credito"]] = relationship(back_populates="pagaduria")