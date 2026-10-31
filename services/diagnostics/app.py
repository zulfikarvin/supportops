import base64
import binascii
import hmac
import os
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, ValidationError
from engine import diagnose

app = FastAPI(title="SupportOps diagnostics", docs_url=None, redoc_url=None, openapi_url=None)
bearer = HTTPBearer(auto_error=False)


def authorize(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    secret = os.getenv("DIAGNOSTICS_API_TOKEN", "")
    if len(secret) < 32:
        raise HTTPException(503, "Diagnostic service token is not configured.")
    if not credentials or not hmac.compare_digest(credentials.credentials, secret):
        raise HTTPException(401, "Unauthorized diagnostic request.")


class Payload(BaseModel):
    csv_base64: str = Field(max_length=7_000_000)
    baseline: list[str] | None = Field(default=None, max_length=100)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/diagnose", dependencies=[Depends(authorize)])
async def run(request: Request):
    chunks = []; size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > 7_100_000:
            raise HTTPException(413, "Diagnostic request is too large.")
        chunks.append(chunk)
    try:
        payload = Payload.model_validate_json(b"".join(chunks))
        raw = base64.b64decode(payload.csv_base64, validate=True)
        return diagnose(raw, payload.baseline)
    except (ValidationError, ValueError, binascii.Error):
        raise HTTPException(400, "Invalid CSV sample, schema or request. Use a well-formed UTF-8 CSV with consistent rows.") from None
