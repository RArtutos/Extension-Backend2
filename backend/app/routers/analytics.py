from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, List
from ..core.auth import get_current_user
from ..core.analytics_manager import AnalyticsManager
from ..schemas.analytics import AccountActivity

router = APIRouter()
analytics_manager = AnalyticsManager()

@router.post("/track")
async def track_activity(
    activity: AccountActivity,
    current_user: dict = Depends(get_current_user)
):
    """Track user activity"""
    if not current_user["is_admin"] and current_user["email"] != activity.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return analytics_manager.track_activity(activity)

@router.post("/events/batch")
async def track_events(
    events: List[Dict],
    current_user: dict = Depends(get_current_user)
):
    """Track multiple events in batch"""
    return analytics_manager.track_events(events)

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