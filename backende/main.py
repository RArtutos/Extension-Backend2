from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
import json
from typing import List, Optional
from models import *
from auth import *
from database import Database

app = FastAPI(title="Account Manager API")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database
db = Database()

@app.post("/api/auth/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = db.get_user(form_data.username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    if not verify_password(form_data.password, user.get("password", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Asegurarse de que el usuario tenga todos los campos necesarios
    user.setdefault("is_active", True)
    if not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled"
        )
        
    user.setdefault("max_devices", 1)
    user.setdefault("active_sessions", 0)
    
    # Verificar máximo de dispositivos
    if user["active_sessions"] >= user["max_devices"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Maximum number of devices reached"
        )
    
    # Actualizar sesiones activas
    db.update_user_sessions(form_data.username, user["active_sessions"] + 1)
    
    # Crear token de acceso
    access_token = create_access_token(data={"sub": form_data.username})
    
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/api/accounts")
async def get_accounts(current_user: User = Depends(get_current_user)):
    user_accounts = db.get_user_accounts(current_user.email)
    accounts = []
    
    for user_account in user_accounts:
        account = db.get_account(user_account["account_id"])
        if account:
            # Get active sessions count for this account
            active_sessions = db.get_account_active_sessions(account["id"])
            account["active_sessions"] = active_sessions
            accounts.append(account)
    
    return accounts

@app.get("/api/accounts/{account_id}/session")
async def get_session_info(
    account_id: int,
    current_user: User = Depends(get_current_user)
):
    account = db.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
        
    # Verify user has access to this account
    if not db.verify_user_account_access(current_user.email, account_id):
        raise HTTPException(status_code=403, detail="Access denied")
    
    active_sessions = db.get_account_active_sessions(account_id)
    
    return {
        "active_sessions": active_sessions,
        "max_concurrent_users": account["max_concurrent_users"]
    }

@app.post("/api/sessions")
async def create_session(
    session: SessionCreate,
    current_user: User = Depends(get_current_user)
):
    account = db.get_account(session.account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Verify user has access to this account
    if not db.verify_user_account_access(current_user.email, session.account_id):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Check max concurrent users
    active_sessions = db.get_account_active_sessions(session.account_id)
    if active_sessions >= account["max_concurrent_users"]:
        raise HTTPException(
            status_code=403,
            detail="Maximum concurrent users reached"
        )
    
    # Create session
    session_data = {
        "id": f"{current_user.email}_{int(datetime.now().timestamp())}",
        "user_id": current_user.email,
        "account_id": session.account_id,
        "device_id": session.device_id,
        "ip_address": session.ip_address,
        "user_agent": session.user_agent,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_activity": datetime.now(timezone.utc).isoformat(),
        "active": True,
        "domain": session.domain
    }
    
    db.create_session(session_data)
    
    # Track analytics
    analytics_data = {
        "user_id": current_user.email,
        "account_id": session.account_id,
        "action": "session_start",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ip_address": session.ip_address,
        "user_agent": session.user_agent,
        "domain": session.domain
    }
    db.create_analytics_event(analytics_data)
    
    return session_data

@app.delete("/api/sessions/{session_id}")
async def end_session(
    session_id: str,
    current_user: User = Depends(get_current_user)
):
    session = db.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session["user_id"] != current_user.email:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # End session
    db.end_session(session_id)
    
    # Update user's active sessions count
    user = db.get_user(current_user.email)
    if user["active_sessions"] > 0:
        db.update_user_sessions(current_user.email, user["active_sessions"] - 1)
    
    # Track analytics
    analytics_data = {
        "user_id": current_user.email,
        "account_id": session["account_id"],
        "action": "session_end",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ip_address": session["ip_address"],
        "user_agent": session["user_agent"],
        "domain": session["domain"]
    }
    db.create_analytics_event(analytics_data)
    
    return {"message": "Session ended successfully"}

@app.post("/api/analytics/events/batch")
async def create_analytics_events(
    events: List[AnalyticsEvent],
    current_user: User = Depends(get_current_user)
):
    for event in events:
        if event.user_id != current_user.email:
            raise HTTPException(status_code=403, detail="Access denied")
        
        analytics_data = event.dict()
        analytics_data["timestamp"] = datetime.now(timezone.utc).isoformat()
        db.create_analytics_event(analytics_data)
    
    return {"message": "Events recorded successfully"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
