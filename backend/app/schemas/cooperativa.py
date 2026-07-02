from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator, model_validator


class CooperativaRefinanciacionReglaBase(BaseModel):
    plazo_minimo: int
    plazo_maximo: int
    meses_para_refinanciar: int

    @field_validator("plazo_minimo", "plazo_maximo", "meses_para_refinanciar")
    @classmethod
    def valores_positivos(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("El valor debe ser mayor a 0")
        return value

    @model_validator(mode="after")
    def rango_coherente(self):
        if self.plazo_minimo > self.plazo_maximo:
            raise ValueError("plazo_minimo debe ser menor o igual que plazo_maximo")
        if self.meses_para_refinanciar > self.plazo_maximo:
            raise ValueError("meses_para_refinanciar no debe superar el plazo maximo")
        return self


class CooperativaRefinanciacionReglaRead(CooperativaRefinanciacionReglaBase):
    id: int

    model_config = {"from_attributes": True}


class CooperativaBase(BaseModel):
    nombre: str
    edad_minima: int
    edad_maxima: int
    monto_minimo: float
    monto_maximo: float
    plazo_minimo: int
    plazo_maximo: int
    simulador_url: Optional[str] = None
    reglas_refinanciacion: list[CooperativaRefinanciacionReglaBase] = []

    @field_validator("nombre")
    @classmethod
    def nombre_no_vacio(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("El nombre no puede estar vacio")
        return value.strip()

    @field_validator("simulador_url")
    @classmethod
    def url_simulador_valida(cls, value: Optional[str]) -> Optional[str]:
        if value is None or not value.strip():
            return None
        value = value.strip()
        if not value.startswith(("https://", "http://")):
            raise ValueError("El enlace de la simuladora debe iniciar con http:// o https://")
        return value

    @field_validator("edad_minima", "edad_maxima")
    @classmethod
    def edad_positiva(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("La edad debe ser mayor a 0")
        return value

    @field_validator("monto_minimo", "monto_maximo")
    @classmethod
    def monto_positivo(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("El monto debe ser mayor a 0")
        return value

    @field_validator("plazo_minimo", "plazo_maximo")
    @classmethod
    def plazo_positivo(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("El plazo debe ser mayor a 0")
        return value

    @model_validator(mode="after")
    def rangos_coherentes(self):
        if self.edad_minima >= self.edad_maxima:
            raise ValueError("edad_minima debe ser menor que edad_maxima")
        if self.monto_minimo >= self.monto_maximo:
            raise ValueError("monto_minimo debe ser menor que monto_maximo")
        if self.plazo_minimo >= self.plazo_maximo:
            raise ValueError("plazo_minimo debe ser menor que plazo_maximo")
        reglas = sorted(self.reglas_refinanciacion, key=lambda regla: regla.plazo_minimo)
        for regla in reglas:
            if regla.plazo_minimo < self.plazo_minimo or regla.plazo_maximo > self.plazo_maximo:
                raise ValueError("Las reglas de refinanciacion deben estar dentro del rango de plazo de la cooperativa")
        for index, regla in enumerate(reglas[1:], start=1):
            anterior = reglas[index - 1]
            if regla.plazo_minimo <= anterior.plazo_maximo:
                raise ValueError("Las reglas de refinanciacion no pueden solaparse")
        return self


class CooperativaCreate(CooperativaBase):
    pass


class CooperativaUpdate(BaseModel):
    nombre: Optional[str] = None
    edad_minima: Optional[int] = None
    edad_maxima: Optional[int] = None
    monto_minimo: Optional[float] = None
    monto_maximo: Optional[float] = None
    plazo_minimo: Optional[int] = None
    plazo_maximo: Optional[int] = None
    simulador_url: Optional[str] = None
    reglas_refinanciacion: Optional[list[CooperativaRefinanciacionReglaBase]] = None
    is_active: Optional[bool] = None

    @field_validator("simulador_url")
    @classmethod
    def url_simulador_valida(cls, value: Optional[str]) -> Optional[str]:
        if value is None or not value.strip():
            return None
        value = value.strip()
        if not value.startswith(("https://", "http://")):
            raise ValueError("El enlace de la simuladora debe iniciar con http:// o https://")
        return value

    @model_validator(mode="after")
    def reglas_no_solapadas(self):
        if self.reglas_refinanciacion is None:
            return self
        reglas = sorted(self.reglas_refinanciacion, key=lambda regla: regla.plazo_minimo)
        for index, regla in enumerate(reglas[1:], start=1):
            anterior = reglas[index - 1]
            if regla.plazo_minimo <= anterior.plazo_maximo:
                raise ValueError("Las reglas de refinanciacion no pueden solaparse")
        return self


class CooperativaRead(CooperativaBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    reglas_refinanciacion: list[CooperativaRefinanciacionReglaRead] = []

    model_config = {"from_attributes": True}
