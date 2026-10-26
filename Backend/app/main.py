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

@asynccontextmanager
async def lifespan(app):
    get_settings()
    yield
    get_engine().dispose()

app = FastAPI(title="JuvCare Authentication", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])
app.include_router(router)
app.include_router(admin_router)

@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    # Never echo rejected input (especially passwords) in validation responses.
    return JSONResponse(status_code=422, content={"detail": [{"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]} for e in exc.errors()]})

@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}
