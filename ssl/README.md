# SSL certificates

This folder is for TLS certificates used when HTTPS is enabled.

## Local test certificate

Generate a self-signed certificate for local testing:

```bash
mkdir -p ssl
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout ssl/key.pem \
  -out ssl/cert.pem \
  -days 365 \
  -subj "/CN=localhost"
```

Then set in `.env`:

```env
USE_HTTPS=true
SSL_KEY_PATH=./ssl/key.pem
SSL_CERT_PATH=./ssl/cert.pem
```

> Browsers may still show a warning for self-signed certs in local testing.

## Production

For production, replace test files with real CA-issued certificates and keep the same path variables (or update paths in `.env`).
