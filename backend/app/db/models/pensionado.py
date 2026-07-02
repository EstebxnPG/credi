from datetime import date
from datetime import datetime
from sqlalchemy import String, Date, DateTime, ForeignKey, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
from app.db.mixins import TimestampMixin, SoftDeleteMixin


class Pensionado(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "pensionados"

    id: Mapped[int] = mapped_column(primary_key=True)
    oficina_id: Mapped[int] = mapped_column(ForeignKey("oficinas.id"), nullable=False, index=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), index=True)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    segundo_nombre: Mapped[str | None] = mapped_column(String(150))
    apellidos: Mapped[str] = mapped_column(String(150), nullable=False)
    genero: Mapped[str] = mapped_column(String(30), nullable=False)
    documento: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    fecha_nacimiento: Mapped[date] = mapped_column(Date, nullable=False)
    correo: Mapped[str | None] = mapped_column(String(150))
    telefono: Mapped[str | None] = mapped_column(String(20))
    celular: Mapped[str | None] = mapped_column(String(20))
    direccion: Mapped[str] = mapped_column(String(200), nullable=False)
    creditos: Mapped[list["Credito"]] = relationship(back_populates="pensionado")
    seguimientos: Mapped[list["Seguimiento"]] = relationship(back_populates="pensionado")
    oficinas_vinculadas: Mapped[list["PensionadoOficina"]] = relationship(back_populates="pensionado")
    creador: Mapped["Usuario | None"] = relationship(foreign_keys=[created_by])

    @property
    def nombre_completo(self) -> str:
        apellidos = None if self.apellidos == "Sin registrar" else self.apellidos
        partes = [self.nombre, self.segundo_nombre, apellidos]
        return " ".join(parte.strip() for parte in partes if parte and parte.strip())

    @property
    def creador_nombre(self) -> str | None:
        return self.creador.nombre if self.creador else None


class PensionadoOficina(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "pensionado_oficinas"
    __table_args__ = (
        UniqueConstraint("pensionado_id", "oficina_id", name="uq_pensionado_oficina"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    pensionado_id: Mapped[int] = mapped_column(ForeignKey("pensionados.id"), nullable=False, index=True)
    oficina_id: Mapped[int] = mapped_column(ForeignKey("oficinas.id"), nullable=False, index=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), index=True)
    vinculada_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))

    pensionado: Mapped["Pensionado"] = relationship(back_populates="oficinas_vinculadas")
    oficina: Mapped["Oficina"] = relationship(back_populates="pensionado_vinculos")
    creador: Mapped["Usuario | None"] = relationship(foreign_keys=[created_by])
