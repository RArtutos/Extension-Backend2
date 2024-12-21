from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import List
from urllib.parse import unquote  # Importa unquote aquí
from ..db.database import Database
from ..schemas.account import Account, AccountCreate
from ..core.auth import get_current_user
from ..core.config import settings

router = APIRouter()
db = Database()

@router.delete("/sessions")
async def remove_sessions(
    domain: str,
    email: str,
    current_user: dict = Depends(get_current_user)
):
    """Remove sessions and decrement active users count"""
    # Decodificar los parámetros de la URL
    decoded_domain = unquote(domain)
    decoded_email = unquote(email)

    # Obtener las sesiones activas para el dominio y email decodificados
    sessions = db.get_sessions_by_domain_and_email(decoded_domain, decoded_email)
    if not sessions:
        raise HTTPException(status_code=404, detail="No sessions found for the given domain and email")

    for session in sessions:
        account_id = session["account_id"]
        # Eliminar la sesión
        if not db.delete_session(session["id"]):
            raise HTTPException(status_code=400, detail=f"Failed to remove session {session['id']}")
        # Decrementar usuarios activos de cada cuenta
        if not db.accounts.decrement_active_users(account_id):
            raise HTTPException(status_code=400, detail=f"Failed to decrement active users for account {account_id}")

    return {"success": True, "message": "Sessions removed and active users decremented"}
