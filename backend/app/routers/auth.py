from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from datetime import datetime
from ..core.auth import (
    verify_password, 
    create_access_token, 
    get_password_hash, 
    decode_access_token,
    get_current_user
)
from ..core.config import settings
from ..db.database import Database

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
db = Database()

@router.post("/login")
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    user = db.get_user_by_email(form_data.username)
    if not user or not verify_password(form_data.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Verificar si el usuario ha expirado
    if user.get("expires_at"):
        expires_at = datetime.fromisoformat(user["expires_at"])
        if datetime.utcnow() > expires_at:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account has expired"
            )
    
    # Verificar límite de dispositivos
    if user["active_sessions"] >= user.get("max_devices", 1):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum number of devices reached"
        )
    
    # Incrementar active_sessions
    db.users.update_active_sessions(user["email"], user["active_sessions"] + 1)
    
    # Registrar analítica de login
    db.analytics.create_activity({
        "user_id": user["email"],
        "action": "login",
        "timestamp": datetime.utcnow().isoformat(),
        "ip_address": request.client.host,
        "user_agent": request.headers.get("user-agent")
    })
    
    access_token = create_access_token(data={"sub": user["email"], "is_admin": user.get("is_admin", False)})
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    # Decrementar active_sessions
    db.users.update_active_sessions(current_user["email"], max(0, current_user["active_sessions"] - 1))
    
    # Registrar analítica de logout
    db.analytics.create_activity({
        "user_id": current_user["email"],
        "action": "logout",
        "timestamp": datetime.utcnow().isoformat()
    })
    
    return {"message": "Logged out successfully"}

@router.get("/validate")
async def validate_token(current_user: dict = Depends(get_current_user)):
    # Verificar si el usuario ha expirado
    if current_user.get("expires_at"):
        expires_at = datetime.fromisoformat(current_user["expires_at"])
        if datetime.utcnow() > expires_at:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account has expired"
            )
    
    # Verificar si el usuario está activo
    if not current_user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive"
        )
    
    return {
        "email": current_user["email"],
        "is_admin": current_user.get("is_admin", False),
        "active_sessions": current_user.get("active_sessions", 0),
        "max_devices": current_user.get("max_devices", 1),
        "expires_at": current_user.get("expires_at"),
        "is_active": current_user.get("is_active", True)
    }
