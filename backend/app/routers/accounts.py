from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import List
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

    account_ids = set()
    for session in sessions:
        account_id = session["account_id"]
        account_ids.add(account_id)
        # Eliminar la sesión
        if not db.delete_session(session["id"]):
            raise HTTPException(status_code=400, detail=f"Failed to remove session {session['id']}")

    # Decrementar usuarios activos de cada cuenta
    for account_id in account_ids:
        if not db.accounts.decrement_active_users(account_id):
            raise HTTPException(status_code=400, detail=f"Failed to decrement active users for account {account_id}")

    return {"success": True, "message": "Sessions removed and active users decremented"}


# Mantener la función del primer código
@router.get("/", response_model=List[Account])
async def get_accounts(current_user: dict = Depends(get_current_user)):
    """Get all accounts for the current user"""
    return db.get_accounts(current_user["email"])

# Usar la del segundo código ya que tiene el mismo nombre
@router.get("/{account_id}/access", response_model=dict)
async def access_account(
    account_id: int,
    domain: str,
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """Register account access and verify limits"""
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
        
    # Verify user has access to this account
    user_accounts = db.get_user_accounts(current_user["email"])
    if account_id not in user_accounts:
        raise HTTPException(status_code=403, detail="Not authorized to access this account")
    
    # Check concurrent users limit
    active_users = db.analytics.get_active_users_count(account_id)
    if active_users >= account.get("max_concurrent_users", 1):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum concurrent users reached"
        )
    
    # Record access
    db.analytics.record_account_access(
        current_user["email"],
        account_id,
        domain,
        request.client.host,
        request.headers.get("user-agent")
    )
    
    return {
        "success": True,
        "active_users": active_users,
        "max_users": account.get("max_concurrent_users", 1)
    }

# Mantener la función del primer código
@router.get("/{account_id}", response_model=Account)
async def get_account(account_id: int, current_user: dict = Depends(get_current_user)):
    """Get a specific account"""
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
        
    # Verify user has access to this account
    user_accounts = db.get_user_accounts(current_user["email"])
    if account["id"] not in user_accounts:
        raise HTTPException(status_code=403, detail="Not authorized to access this account")
        
    return account

# Mantener la función del primer código
@router.get("/{account_id}/session")
async def get_session_info(account_id: int, current_user: dict = Depends(get_current_user)):
    """Get session information for an account"""
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
        
    # Verify user has access to this account
    user_accounts = db.get_user_accounts(current_user["email"])
    if account["id"] not in user_accounts:
        raise HTTPException(status_code=403, detail="Not authorized to access this account")
    
    active_sessions = db.get_active_sessions(account_id)
    return {
        "active_sessions": len(active_sessions),
        "max_concurrent_users": account.get("max_concurrent_users", 1)
    }

# Mantener la función del primer código
@router.post("/", response_model=Account)
async def create_account(account: AccountCreate, current_user: dict = Depends(get_current_user)):
    """Create a new account"""
    if not current_user["is_admin"]:
        raise HTTPException(status_code=403, detail="Not enough privileges")
        
    created_account = db.create_account(account.dict())
    if created_account:
        db.assign_account_to_user(current_user["email"], created_account["id"])
    return created_account

# Mantener la función del primer código
@router.put("/{account_id}", response_model=Account)
async def update_account(account_id: int, account: AccountCreate, current_user: dict = Depends(get_current_user)):
    """Update an existing account"""
    if not current_user["is_admin"]:
        raise HTTPException(status_code=403, detail="Not enough privileges")
        
    updated_account = db.update_account(account_id, account.dict())
    if not updated_account:
        raise HTTPException(status_code=404, detail="Account not found")
    return updated_account

# Mantener la función del primer código
@router.delete("/{account_id}")
async def delete_account(account_id: int, current_user: dict = Depends(get_current_user)):
    """Delete an account"""
    if not current_user["is_admin"]:
        raise HTTPException(status_code=403, detail="Not enough privileges")
        
    if db.delete_account(account_id):
        return {"message": "Account deleted successfully"}
    raise HTTPException(status_code=404, detail="Account not found")

# Usar la del segundo código para logout
@router.post("/{account_id}/logout")
async def logout_account(
    account_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Register account logout"""
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
        
    # Record logout
    db.analytics.record_account_logout(current_user["email"], account_id)
    
    return {"success": True, "message": "Logged out successfully"}

# Añadir nuevos endpoints del segundo código
@router.post("/{account_id}/active")
async def increment_active_users(
    account_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Increment active users count"""
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
        
    # Verify user has access to this account
    user_accounts = db.get_user_accounts(current_user["email"])
    if account_id not in user_accounts:
        raise HTTPException(status_code=403, detail="Not authorized to access this account")
    
    # Verificar límite antes de incrementar
    active_sessions = db.get_active_sessions(account_id)
    if len(active_sessions) >= account.get("max_concurrent_users", 1):
        raise HTTPException(
            status_code=400,
            detail="Maximum concurrent users reached"
        )
    
    if db.accounts.increment_active_users(account_id):
        return {"success": True, "message": "Active users incremented"}
    raise HTTPException(
        status_code=400,
        detail="Failed to increment active users"
    )



