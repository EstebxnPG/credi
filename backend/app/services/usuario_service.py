from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.db.repositories.usuario_repo import UsuarioRepository
from app.schemas.usuario import UsuarioCreate, UsuarioUpdate, LoginRequest, TokenResponse
from app.core.security import hash_password, verify_password, create_access_token

MAX_INTENTOS = 5
LOGIN_ERROR = "Credenciales inválidas"

class UsuarioService:

    def __init__(self, db: Session):
        self.repo = UsuarioRepository(db)

    def crear(self, data: UsuarioCreate):
        if self.repo.get_by_correo(data.correo):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe un usuario con ese correo"
            )
        if self.repo.get_by_documento(data.documento):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya existe un usuario con ese documento"
            )
        datos = data.model_dump()
        datos["contrasena"] = hash_password(datos["contrasena"])  # nunca guardamos texto plano
        return self.repo.create(datos)

    def obtener_o_404(self, usuario_id: int):
        usuario = self.repo.get_by_id(usuario_id)
        if not usuario:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
        return usuario

    def listar(self, skip: int = 0, limit: int = 100):
        return self.repo.get_all(skip=skip, limit=limit)

    def contar(self):
        return self.repo.count_all()

    def actualizar(self, usuario_id: int, data: UsuarioUpdate):
        usuario = self.obtener_o_404(usuario_id)
        cambios = data.model_dump(exclude_unset=True)

        correo = cambios.get("correo")
        if correo:
            existente = self.repo.get_by_correo(correo)
            if existente and existente.id != usuario.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Ya existe un usuario con ese correo"
                )

        documento = cambios.get("documento")
        if documento:
            existente = self.repo.get_by_documento(documento)
            if existente and existente.id != usuario.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Ya existe un usuario con ese documento"
                )

        contrasena = cambios.get("contrasena")
        if contrasena is not None:
            if not contrasena.strip():
                cambios.pop("contrasena")
            else:
                cambios["contrasena"] = hash_password(contrasena)

        return self.repo.update(usuario, UsuarioUpdate(**cambios))

    def desbloquear(self, usuario_id: int):
        usuario = self.obtener_o_404(usuario_id)
        return self.repo.desbloquear(usuario)

    def eliminar(self, usuario_id: int):
        usuario = self.obtener_o_404(usuario_id)
        self.repo.soft_delete(usuario)

    def login(self, data: LoginRequest) -> TokenResponse:
        usuario = self.repo.get_by_correo(data.correo)

        # Verificamos que exista y esté activo
        if not usuario or not usuario.is_active:
            raise HTTPException(status_code=401, detail=LOGIN_ERROR)

        # Verificamos bloqueo por intentos
        if usuario.intentos_fallidos >= MAX_INTENTOS:
            raise HTTPException(
                status_code=403,
                detail="Cuenta bloqueada. Contacta al administrador."
            )

        # Verificamos la contraseña
        if not verify_password(data.contrasena, usuario.contrasena):
            self.repo.incrementar_intentos(usuario)
            raise HTTPException(
                status_code=401,
                detail=LOGIN_ERROR
            )

        # Login exitoso — reseteamos intentos y generamos token
        self.repo.resetear_intentos(usuario)
        token = create_access_token({
            "sub": str(usuario.id),
            "rol": usuario.rol
        })
        return TokenResponse(
            access_token=token,
            rol=usuario.rol,
            nombre=usuario.nombre,
            oficina_id=usuario.oficina_id,
        )
