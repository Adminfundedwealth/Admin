# Admin OS CSRF protection

Authenticated Admin OS mutations use the shared protection in `src/middleware.ts` and `src/lib/security/csrf.ts`.

The middleware validates the `session_token` against the active staff session before checking CSRF. It requires both the `__csrf_token` cookie and matching `x-csrf-token` request header on every authenticated `POST`, `PUT`, `PATCH`, and `DELETE`. The CSRF value is an HMAC-SHA-256 token keyed by the high-entropy session token and includes that session's expiration. Missing, mismatched, invalid, expired, and other-session tokens are rejected before the route handler runs.

The HMAC-derived value is stable for the lifetime of a session, so concurrent requests and browser tabs share one token. A new session produces a different token. Authenticated safe requests set or repair the host-only, `Path=/`, `SameSite=Strict` CSRF cookie; it is `Secure` in production and expires with the session. Session errors and logout clear both session and CSRF cookies.

Client mutations must use `apiFetch` from `src/lib/api/fetch.ts`. It obtains the current token from the authenticated, no-cache `GET /api/auth/csrf` endpoint before each mutation and sends credentials plus the CSRF header. Login and 2FA bootstrap routes are exempt because no authenticated session exists yet. Cron jobs and webhooks use their own bearer-secret authentication and are not browser-session routes.
