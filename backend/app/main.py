from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import auth, accounts, proxies, analytics, sessions, delete
from .routers.admin import users, analytics as admin_analytics, presets, accounts as admin_accounts
from .core.config import settings
from datetime import datetime
import asyncio
import json

app = FastAPI(title="Account Manager API")

# Update CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
    expose_headers=["*"]  # Exposes all headers
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(accounts.router, prefix="/api/accounts", tags=["accounts"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(proxies.router, prefix="/api/proxies", tags=["proxies"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(users.router, prefix="/api/admin/users", tags=["admin-users"])
app.include_router(admin_analytics.router, prefix="/api/admin/analytics", tags=["admin-analytics"])
app.include_router(presets.router, prefix="/api/admin/presets", tags=["admin-presets"])
app.include_router(admin_accounts.router, prefix="/api/admin/accounts", tags=["admin-accounts"])
app.include_router(delete.router, prefix="/delete", tags=["delete"])

import logging

# Configurar logging
logging.basicConfig(level=logging.INFO)

async def cleanup_expired_and_deleted_users():
    while True:
        try:
            logging.info("Starting cleanup process...")
            with open(settings.DATA_FILE, 'r') as f:
                data = json.load(f)

            modified = False
            account_sessions = {}  # Para contar sesiones por cuenta

            # Verificar usuarios expirados
            for user in data.get("users", []):
                if user.get("expires_at"):
                    expires_at = datetime.fromisoformat(user["expires_at"])
                    if datetime.utcnow() > expires_at:
                        logging.info(f"User {user['email']} has expired.")
                        # Encontrar todas las sesiones del usuario
                        for session in data.get("sessions", []):
                            if session.get("user_id") == user["email"] and session.get("active"):
                                account_id = session.get("account_id")
                                if account_id:
                                    account_sessions[account_id] = account_sessions.get(account_id, 0) + 1
                                session["active"] = False
                                session["end_time"] = datetime.utcnow().isoformat()
                                modified = True

            # Verificar usuarios eliminados
            user_emails = {user["email"] for user in data.get("users", [])}
            for session in data.get("sessions", []):
                if session.get("user_id") not in user_emails and session.get("active"):
                    logging.info(f"Session for user {session['user_id']} is inactive as user is deleted.")
                    account_id = session.get("account_id")
                    if account_id:
                        account_sessions[account_id] = account_sessions.get(account_id, 0) + 1
                    session["active"] = False
                    session["end_time"] = datetime.utcnow().isoformat()
                    modified = True

            # Actualizar contadores de usuarios activos en las cuentas
            if account_sessions:
                for account in data.get("accounts", []):
                    if account["id"] in account_sessions:
                        logging.info(f"Updating active user count for account {account['id']}.")
                        account["active_users"] = max(0, account["active_users"] - account_sessions[account["id"]])
                        modified = True

            # Eliminar sesiones inactivas
            initial_session_count = len(data.get("sessions", []))
            data["sessions"] = [session for session in data.get("sessions", []) if session["active"]]
            final_session_count = len(data["sessions"])
            logging.info(f"Removed {initial_session_count - final_session_count} inactive sessions.")

            # Guardar cambios si hubo modificaciones
            if modified:
                with open(settings.DATA_FILE, 'w') as f:
                    json.dump(data, f, indent=2)
                logging.info("Data file updated successfully.")

        except Exception as e:
            logging.error(f"Error in cleanup_expired_and_deleted_users: {e}")

        await asyncio.sleep(120)  # Esperar 2 minutos

@app.on_event("startup")
async def startup_event():
    settings.init_data_file()
    asyncio.create_task(cleanup_expired_and_deleted_users())
