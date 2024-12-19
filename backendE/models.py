from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class User(BaseModel):
    email: str
    is_admin: bool = False
    created_at: datetime
    expires_at: Optional[datetime] = None
    preset_id: Optional[int] = None
    max_devices: int = 1
    active_sessions: int = 0
    is_active: bool = True

class Account(BaseModel):
    id: int
    name: str
    group: Optional[str] = None
    max_concurrent_users: int
    cookies: List[dict]

class SessionCreate(BaseModel):
    account_id: int
    device_id: str
    ip_address: str
    user_agent: str
    domain: str

class AnalyticsEvent(BaseModel):
    user_id: str
    account_id: int
    action: str
    ip_address: str
    user_agent: str
    domain: str