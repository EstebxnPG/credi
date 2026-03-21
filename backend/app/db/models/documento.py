from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.db.mixins import SoftDeleteMixin
from datetime import datetime
from sqlalchemy import DateTime


class Documento(Base, SoftDeleteMixin):
    __tablename__ = "documentos"

    id: Mapped[int] = mapped_column(primary_key=True)
    credito_id: Mapped[int] = mapped_column(ForeignKey("creditos.id"), nullable=False)
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    tipo: Mapped[str] = mapped_column(String(10), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default="now()"
    )

    credito: Mapped["Credito"] = relationship(back_populates="documentos")