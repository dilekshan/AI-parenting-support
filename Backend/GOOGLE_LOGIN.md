# Google login setup

Implementation only: no tests, builds, browser checks or database migration were run.

## Google Cloud Console

1. Select/create your Google Cloud project. Open **Google Auth Platform**.
2. Under **Branding**, set the JuvCare application name, support email and developer contact. For production, configure your verified application domain, homepage and privacy policy.
3. Under **Audience**, choose External (or Internal only for your Workspace organization). While in Testing, add your own Google account under Test users.
4. Under **Data Access**, request only `openid`, `email`, `profile`.
5. Under **Clients**, create an OAuth client with application type **Web application**.
6. Add this exact Authorized redirect URI:
   `http://localhost:8000/api/auth/google/callback`
7. This implementation uses server redirects, not the Google JavaScript SDK; Authorized JavaScript origins are not required. If you configure an origin, use `http://localhost:5173` (no path).
8. Copy the client ID and client secret into your local ignored `Backend/.env`. Never put the secret in a `VITE_` variable, source control or chat.

Source: https://developers.google.com/identity/openid-connect/openid-connect

## Local environment

Add to `Backend/.env` (replace the empty credential values locally):

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback
FRONTEND_URL=http://localhost:5173
GOOGLE_COOKIE_SECURE=false
```

Keep the existing DB and JWT settings. `JWT_SECRET` also signs the short-lived OAuth state cookie. Use the same host consistently: open `http://localhost:5173`, not `127.0.0.1`. If needed, put `VITE_API_URL=http://localhost:8000` in the ignored `Frontend/.env`. No Google credentials belong in the frontend.

For production, use HTTPS, set `GOOGLE_COOKIE_SECURE=true`, update both URLs and register the exact production callback with Google. Serve frontend/API on the same site (for example `app.example.com` and `api.example.com`) because the handoff cookie intentionally uses SameSite=Strict. Configure SPA fallback for `/auth/google/callback`. Do not log OAuth callback query strings in reverse proxies; start Uvicorn with `--no-access-log` to avoid logging authorization codes.

## Required setup (PowerShell, project root)

Stop the backend and take your usual database backup before migration. Then run:

```powershell
.\Backend\venv\Scripts\python.exe -m pip install -r .\Backend\requirements.txt
.\Backend\venv\Scripts\python.exe .\Backend\scripts\migrate_google_login.py
```

The migration locates the existing User table (including MySQL's lowercase `user` name), makes `password_hash` nullable, and adds nullable, unique, case-sensitive `google_sub VARCHAR(255)`. It creates no users or tables and changes no existing row values. MySQL ALTER statements commit implicitly; the migration is restartable. Apply it before starting the updated backend, because User queries now include `google_sub`.

Start the backend from `Backend`:

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --no-access-log
```

## Behavior and limits

- Google authorization code flow uses PKCE, state and nonce; Authlib verifies Google's signed ID token on the server. Accounts are located only by `sub`.
- New accounts are always active parents with a NULL password hash. Password login explicitly refuses NULL hashes. No fake password is stored.
- Existing email matches are refused without linking or modifying the existing account. Sign in with the existing password instead; a separate verified account-linking flow is not included.
- Google cannot sign in an admin account, create an admin or change any role.
- New users see the optional phone step and Skip; returning linked users go directly to `/parent/home`. Skipping does not cause the step to reappear at the next sign-in.
- JWTs stay in the existing in-memory auth mechanism. The 60-second HttpOnly handoff cookie is cleared on exchange; no JWT is placed in a URL. As with existing login, refreshing the application loses the in-memory session.
- The current Register component had no Google button. A button using existing Register button classes was added; its existing CSS, fields and validation were preserved. Login's existing Google button was wired without design changes.
- Live Google sign-in requires your credentials, consent configuration, dependencies and migration. No successful authentication has been simulated or verified.
