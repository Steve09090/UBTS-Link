import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .api import router
from .config import settings
from .database import SessionLocal, init_db
from .services import ServiceError
from .services.replenishment import run_sweep

log = logging.getLogger("ubts_link")
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


async def _sweep_loop(interval: int) -> None:
    while True:
        await asyncio.sleep(interval)
        try:
            await asyncio.to_thread(_run_sweep_once)
        except Exception:  # keep the scheduler alive
            log.exception("scheduled sweep failed")


def _run_sweep_once() -> dict:
    with SessionLocal() as db:
        result = run_sweep(db)
    log.info("sweep complete: %s", result)
    return result


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    task = None
    if settings.sweep_interval_seconds > 0:
        task = asyncio.create_task(_sweep_loop(settings.sweep_interval_seconds))
    try:
        yield
    finally:
        if task:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task


app = FastAPI(title="UBTS-Link", version="0.1.0", lifespan=lifespan)
app.include_router(router)


@app.exception_handler(ServiceError)
async def _service_error(_: Request, exc: ServiceError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content={"detail": exc.message})


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
