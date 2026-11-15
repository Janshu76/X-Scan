from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from backend.app.file_registration import RegistrationError, register_upload

router = APIRouter()


@router.post("/api/data/register", status_code=201)
async def register_data_file(
    region_id: str = Form(...),
    source: str = Form(...),
    license_name: str = Form(...),
    acquired: str = Form(...),
    file: UploadFile = File(...),
):
    try:
        return await register_upload(region_id=region_id, source=source, license_name=license_name, acquired=acquired, upload=file)
    except RegistrationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.code) from None
    finally:
        await file.close()
