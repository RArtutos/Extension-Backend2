from fastapi import APIRouter, Depends, HTTPException
from typing import List
from ...core.auth import get_current_admin_user
from ...db.database import Database
from ...schemas.user import UserCreate, UserResponse, UserUpdate

router = APIRouter()
db = Database()

@router.get("/", response_model=List[UserResponse])
async def get_users(current_user: dict = Depends(get_current_admin_user)):
    users = db.get_users()
    return users

@router.post("/", response_model=UserResponse)
async def create_user(user: UserCreate, current_user: dict = Depends(get_current_admin_user)):
    """Create new user and assign preset accounts if specified"""
    if db.get_user_by_email(user.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create the user
    created_user = db.create_user(user.dict())
    if not created_user:
        raise HTTPException(status_code=400, detail="Failed to create user")

    # If preset_id is provided, assign preset accounts
    if user.preset_id:
        preset = db.get_preset(user.preset_id)
        if preset and preset.get("account_ids"):
            for account_id in preset["account_ids"]:
                db.assign_account_to_user(user.email, account_id)

    return created_user

@router.get("/{user_id}/accounts")
async def get_user_accounts(user_id: str, current_user: dict = Depends(get_current_admin_user)):
    """Get accounts assigned to a user"""
    user = db.get_user_by_email(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return db.get_accounts(user_id)

@router.post("/{user_id}/accounts/{account_id}")
async def assign_account(
    user_id: str,
    account_id: int,
    current_user: dict = Depends(get_current_admin_user)
):
    """Assign an account to a user"""
    user = db.get_user_by_email(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    account = db.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if db.assign_account_to_user(user_id, account_id):
        return {"success": True, "message": "Account assigned successfully"}
    raise HTTPException(status_code=400, detail="Failed to assign account")

@router.delete("/{user_id}/accounts/{account_id}")
async def remove_account(
    user_id: str,
    account_id: int,
    current_user: dict = Depends(get_current_admin_user)
):
    """Remove an account from a user"""
    user = db.get_user_by_email(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    account = db.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if db.remove_account_from_user(user_id, account_id):
        return {"success": True, "message": "Account removed successfully"}
    raise HTTPException(status_code=400, detail="Failed to remove account")

@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    user: UserUpdate,
    current_user: dict = Depends(get_current_admin_user)
):
    """Update user details and reassign preset accounts if needed"""
    existing_user = db.get_user_by_email(user_id)
    if not existing_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if existing_user.get("is_admin") and not user.is_admin:
        raise HTTPException(status_code=400, detail="Cannot remove admin status")
    
    # Update user data
    updated_user = db.update_user(user_id, user.dict(exclude_unset=True))
    if not updated_user:
        raise HTTPException(status_code=400, detail="Failed to update user")

    # Handle preset account assignments
    if user.preset_id:
        # Remove existing account assignments
        user_accounts = db.get_user_accounts(user_id)
        for account_id in user_accounts:
            db.remove_account_from_user(user_id, account_id)

        # Assign new preset accounts
        preset = db.get_preset(user.preset_id)
        if preset and preset.get("account_ids"):
            for account_id in preset["account_ids"]:
                db.assign_account_to_user(user_id, account_id)

    return updated_user

@router.delete("/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_admin_user)):
    """Delete a user"""
    if user_id == current_user["email"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    
    existing_user = db.get_user_by_email(user_id)
    if not existing_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if existing_user.get("is_admin"):
        raise HTTPException(status_code=400, detail="Cannot delete admin users")
        
    if db.delete_user(user_id):
        return {"success": True, "message": "User deleted successfully"}
    raise HTTPException(status_code=404, detail="User not found")