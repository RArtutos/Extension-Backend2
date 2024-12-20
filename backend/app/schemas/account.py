from pydantic import BaseModel, Field, conint
from typing import List, Optional

class Cookie(BaseModel):
    domain: str
    name: str
    value: str
    path: str = "/"

class AccountBase(BaseModel):
    name: str
    group: Optional[str] = None
    cookies: List[Cookie] = Field(default_factory=list)
    max_concurrent_users: conint(ge=1) = 1
    active_users: int = Field(default=0, description="Number of currently active users")

class AccountCreate(AccountBase):
    pass

class Account(AccountBase):
    id: int