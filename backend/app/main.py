from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import auth, accounts, proxies, analytics, sessions
from .routers.admin import users, analytics as admin_analytics, presets, accounts as admin_accounts
from .core.config import settings
from .routers import devices

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
app.include_router(devices.router, prefix="/api/devices", tags=["devices"])


@app.on_event("startup")
async def startup_event():
    settings.init_data_file()
