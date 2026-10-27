# Profile photo setup

From the project root, stop the backend, take your usual database backup, and run:

```powershell
.\Backend\venv\Scripts\python.exe -m pip install -r .\Backend\requirements.txt
.\Backend\venv\Scripts\python.exe .\Backend\scripts\migrate_profile_photo.py
```

Then restart the backend and frontend. The migration is NOT run on startup or by this implementation. It adds only nullable `User.profile_photo VARCHAR(64)`, without changing existing values, roles or passwords. Run it before using the updated application: ORM queries and `/api/auth/me` require the column. It is independent of the Google migration.

- `POST /api/auth/me/profile-photo`: Bearer JWT required, active parent/admin only. Send raw image bytes (not multipart) with `Content-Type: application/octet-stream`. No user ID parameter exists. Returns `profile_photo_url`.
- Maximum input: 2 MiB (2,097,152 bytes). Actual JPEG, PNG and WebP content is decoded and verified; images above 16 million pixels are rejected. Only the first animation frame is used. Re-encoded WebP is at most 512 x 512 with metadata removed.
- Files: `Backend/uploads/profile-photos/<random UUID>.webp`. The directory is created on first upload and ignored by Git. Grant the backend write access; use persistent storage for this directory in deployments and include it in backups. Existing older photo files are retained; there is no deletion feature in this task.
- `GET /api/profile-photos/{filename}` serves sanitized WebP only, with a strict filename whitelist, explicit image content type and nosniff headers. URLs are unguessable but anyone holding a URL can view that avatar; they are not JWT-private. There is no directory listing or arbitrary file serving.
- Both navbar avatars use the same uploader. The existing placeholder remains when no photo exists. Images use `object-fit: cover`; validation/upload errors appear next to the avatar without changing navbar dimensions.
- The database reference survives logout/login and refresh. Existing JWT session behavior remains unchanged: authentication is in memory, so refresh may require signing in again, after which the saved photo is loaded from `/api/auth/me`.
- No `.env` or Google OAuth credentials are required or changed.
