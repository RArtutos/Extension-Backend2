from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import List
from ..db.database import Database
from ..schemas.account import Account, AccountCreate
from ..core.auth import get_current_user
from ..core.config import settings

router = APIRouter()
db = Database()

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
    
    if db.accounts.increment_active_users(account_id):
        return {"success": True, "message": "Active users incremented"}
    raise HTTPException(
        status_code=400,
        detail="Failed to increment active users"
    )

@router.delete("/{account_id}/active")
async def decrement_active_users(
    account_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Decrement active users count"""
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
        
    # Verify user has access to this account
    user_accounts = db.get_user_accounts(current_user["email"])
    if account_id not in user_accounts:
        raise HTTPException(status_code=403, detail="Not authorized to access this account")
    
    if db.accounts.decrement_active_users(account_id):
        return {"success": True, "message": "Active users decremented"}
    raise HTTPException(
        status_code=400,
        detail="Failed to decrement active users"
    )

@router.get("/{account_id}/session")
async def get_session_info(
    account_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Get session information for an account"""
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
        
    # Verify user has access to this account
    user_accounts = db.get_user_accounts(current_user["email"])
    if account_id not in user_accounts:
        raise HTTPException(status_code=403, detail="Not authorized to access this account")
    
    active_sessions = db.get_active_sessions(account_id)
    return {
        "active_sessions": len(active_sessions),
        "max_concurrent_users": account.get("max_concurrent_users", 1)
    }