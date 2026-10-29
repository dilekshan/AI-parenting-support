from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.database.connection import get_db, get_engine
from app.routers.auth import router
from app.routers.admin import router as admin_router
from app.routers.google_auth import router as google_router
from app.routers.profile_photos import router as photo_router
from app.routers.parent_dashboard import router as parent_router
from app.routers.password_recovery import router as password_recovery_router
from starlette.middleware.sessions import SessionMiddleware

# Check startup configuration and release database connections on shutdown.
@asynccontextmanager
async def lifespan(app):
    get_settings()
    yield
    get_engine().dispose()

app = FastAPI(title="JuvCare Authentication", lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=get_settings().JWT_SECRET.get_secret_value(), session_cookie="juvcare_google_state", max_age=600, same_site="lax", https_only=get_settings().GOOGLE_COOKIE_SECURE, path="/api/auth/google")
app.add_middleware(CORSMiddleware, allow_origins=list({"http://localhost:5173", "http://127.0.0.1:5173", get_settings().FRONTEND_URL.rstrip("/")}), allow_credentials=True, allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])
app.include_router(router)
app.include_router(admin_router)
app.include_router(google_router)
app.include_router(photo_router)
app.include_router(parent_router)
app.include_router(password_recovery_router)

# Return validation details without echoing sensitive submitted values.
@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    # Never echo rejected input (especially passwords) in validation responses.
    return JSONResponse(status_code=422, content={"detail": [{"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]} for e in exc.errors()]})

# Confirm that the application can reach its database.
@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}
