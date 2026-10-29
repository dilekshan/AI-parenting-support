"""Bounded, authenticated raster uploads; originals and metadata are never stored."""
from io import BytesIO
from pathlib import Path
import re
import uuid
import warnings
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from starlette.concurrency import run_in_threadpool
from app.core.dependencies import current_user
from app.database.connection import get_db
from app.models.user import User

router = APIRouter(tags=["Profile photos"])
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "profile-photos"
MAX_BYTES = 2 * 1024 * 1024


# Decode and re-encode supported images to remove source metadata.
def sanitize_photo(data):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as image:
                if image.format not in {'JPEG', 'PNG', 'WEBP'}:
                    raise ValueError()
                if image.width * image.height > 16_000_000:
                    raise ValueError()
                image.verify()
            with Image.open(BytesIO(data)) as image:
                image.seek(0)
                image.load()
                clean = ImageOps.exif_transpose(image).convert('RGB')
                clean.thumbnail((512, 512))
                # A fresh image drops EXIF, comments, ICC and other source metadata.
                raster = Image.new('RGB', clean.size)
                raster.paste(clean)
                output = BytesIO()
                raster.save(output, format='WEBP', quality=85)
                return output.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(422, 'Choose a valid JPG, JPEG, PNG or WebP image (maximum 16 million pixels).') from None


# Save a unique image file and commit its reference to the verified owner.
def save_photo(data, user, db):
    clean = sanitize_photo(data)
    filename = uuid.uuid4().hex + '.webp'
    path = UPLOAD_DIR / filename
    created = False
    try:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        with path.open('xb') as output:
            created = True
            output.write(clean)
        # No user ID comes from the request; only the verified JWT owner is updated.
        user.profile_photo = filename
        db.commit()
    # Roll back failed saves and remove only the newly created image file.
    except (OSError, SQLAlchemyError):
        db.rollback()
        if created:
            path.unlink(missing_ok=True)
        raise HTTPException(503, 'Unable to save profile photo. Please try again.') from None
    return {'profile_photo_url': '/api/profile-photos/' + filename}


# Bound incoming image bytes before processing the authenticated upload.
@router.post('/api/auth/me/profile-photo')
async def upload_photo(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role not in {'parent', 'admin'}:
        raise HTTPException(403, 'Parent or admin account required')
    # Raw body avoids multipart spool files and caps bytes as they arrive.
    data = bytearray()
    # Stop oversized uploads while reading, before buffering more image data.
    async for chunk in request.stream():
        if len(data) + len(chunk) > MAX_BYTES:
            raise HTTPException(413, 'Profile photo must be 2 MB or smaller.')
        data.extend(chunk)
    if not data:
        raise HTTPException(422, 'Please choose a photo.')
    return await run_in_threadpool(save_photo, bytes(data), user, db)


# Serve only safe generated image names, never arbitrary filesystem paths.
@router.get('/api/profile-photos/{filename}')
def serve_photo(filename: str):
    if not re.fullmatch(r'[0-9a-f]{32}\.webp', filename):
        raise HTTPException(404, 'Photo not found')
    path = UPLOAD_DIR / filename
    if not path.is_file() or path.is_symlink():
        raise HTTPException(404, 'Photo not found')
    return FileResponse(path, media_type='image/webp', headers={
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'public, max-age=86400',
    })
