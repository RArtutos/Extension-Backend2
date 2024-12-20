from fastapi import APIRouter, Depends, HTTPException
from typing import Dict
from ..core.auth import get_current_user
from ..core.analytics_manager import AnalyticsManager
from ..db.repositories.analytics_cleanup import AnalyticsCleanupRepository

router = APIRouter()
analytics_manager = AnalyticsManager()
analytics_cleanup = AnalyticsCleanupRepository()

@router.get("/user/{user_id}")
async def get_user_analytics(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get analytics for a specific user"""
    if not current_user["is_admin"] and current_user["email"] != user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return analytics_manager.get_user_analytics(user_id)

@router.get("/account/{account_id}")
async def get_account_analytics(
    account_id: int,
    current_user: dict = Depends(get_current_user)
):
    """Get analytics for a specific account"""
    if not current_user["is_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return analytics_manager.get_account_analytics(account_id)

@router.delete("/domain/{domain}")
async def cleanup_domain_analytics(
    domain: str,
    current_user: dict = Depends(get_current_user)
):
    """Cleanup analytics for a specific domain"""
    removed_analytics = analytics_cleanup.cleanup_domain_analytics(
        current_user["email"], 
        domain
    )
    
    session_cleaned = analytics_cleanup.cleanup_session_analytics(
        current_user["email"], 
        domain
    )
    
    return {
        "success": True,
        "removed_analytics": removed_analytics,
        "session_cleaned": session_cleaned
    }
