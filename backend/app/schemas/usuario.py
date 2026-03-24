from pydantic import BaseModel, EmailStr
from typing import Optional
from enum import Enum

class RolEnum(str, Enum):
    administrador = "administrador"
    asesora = "asesora"

class UsuarioBase(BaseModel):
    nombre: str
    documento: str
    correo: EmailStr
    rol: RolEnum
    oficina_id: int

class UsuarioCreate(UsuarioBase):
    contrasena: str  # la recibimos en texto plano, la hasheamos en el servicio

class UsuarioUpdate(BaseModel):
    nombre: Optional[str] = None
    correo: Optional[EmailStr] = None
    oficina_id: Optional[int] = None
    rol: Optional[RolEnum] = None

class UsuarioRead(UsuarioBase):
    id: int
    is_active: bool
    intentos_fallidos: int

    model_config = {"from_attributes": True}

# Schema especial para el login
class LoginRequest(BaseModel):
    correo: EmailStr
    contrasena: str

# Schema para la respuesta del login
class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    rol: str
    nombre: str