from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Notificacion(Base):
    __tablename__ = "notificaciones"
    __table_args__ = (UniqueConstraint("clave", name="uq_notificaciones_clave"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    clave: Mapped[str] = mapped_column(String(200), nullable=False)
    oficina_id: Mapped[int] = mapped_column(ForeignKey("oficinas.id"), nullable=False, index=True)
    responsable_id: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"), index=True)
    tipo: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    clase: Mapped[str] = mapped_column(String(20), nullable=False, default="accion")
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="pendiente", index=True)
    titulo: Mapped[str] = mapped_column(String(150), nullable=False)
    mensaje: Mapped[str] = mapped_column(Text, nullable=False)
    prioridad: Mapped[str] = mapped_column(String(20), nullable=False)
    href: Mapped[str] = mapped_column(String(300), nullable=False)
    entidad_tipo: Mapped[str | None] = mapped_column(String(40), index=True)
    entidad_id: Mapped[int | None] = mapped_column(Integer, index=True)
    pensionado_id: Mapped[int | None] = mapped_column(ForeignKey("pensionados.id"), index=True)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    leida: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    leida_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pospuesta_hasta: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resuelta_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resuelta_por: Mapped[int | None] = mapped_column(ForeignKey("usuarios.id"))
    justificacion: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), onupdate=text("now()"), nullable=False)

    responsable: Mapped["Usuario | None"] = relationship(foreign_keys=[responsable_id], back_populates="notificaciones")
    lecturas: Mapped[list["NotificacionLectura"]] = relationship(
        back_populates="notificacion",
        cascade="all, delete-orphan",
    )

    @property
    def responsable_nombre(self) -> str | None:
        return self.responsable.nombre if self.responsable else None


class NotificacionLectura(Base):
    __tablename__ = "notificacion_lecturas"
    __table_args__ = (UniqueConstraint("notificacion_id", "usuario_id", name="uq_notificacion_lectura_usuario"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    notificacion_id: Mapped[int] = mapped_column(ForeignKey("notificaciones.id"), nullable=False, index=True)
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuarios.id"), nullable=False, index=True)
    leida_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"), nullable=False)

    notificacion: Mapped["Notificacion"] = relationship(back_populates="lecturas")
    usuario: Mapped["Usuario"] = relationship(back_populates="notificacion_lecturas")
