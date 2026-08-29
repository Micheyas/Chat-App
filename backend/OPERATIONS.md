# Production operations checklist

Before a public release:

- Run `node migrate-v5.js` after the existing migrations.
- Use a managed PostgreSQL backup schedule and test restoring it at least once.
- Set `ALLOWED_ORIGINS` to the exact deployed frontend URLs.
- Keep `JWT_SECRET` private and rotate it if exposed. Rotation logs every user out.
- Put a shared rate limiter in front of the API. The built-in limiter protects a single instance only.
- Configure your hosting health check to request `GET /health`.
- Add an error-monitoring DSN through your provider's dashboard; do not commit it to this repository.

For reliable calls across mobile networks, configure the existing frontend TURN variables:

```env
VITE_TURN_URLS=turn:turn.example.com:3478,turns:turn.example.com:5349
VITE_TURN_USERNAME=issued-user
VITE_TURN_CREDENTIAL=issued-credential
```

Use time-limited TURN credentials from your TURN provider where possible. Never publish a long-lived administrator password in a client build.
