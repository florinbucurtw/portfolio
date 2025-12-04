# Deployment Guide

This guide explains how to deploy the Portfolio app to a production server using Nginx as a reverse proxy and Node.js for the API.

## Prerequisites
- Ubuntu/Debian or similar Linux server
- Node.js 18+
- SQLite installed or bundled, writable data directory
- Nginx (or Apache) with TLS certificates (e.g., Let’s Encrypt)
- A domain name (e.g., portfolio.example.com)

## Environment Variables
Set the following environment variables before starting the server:

- AUTH_SECRET: Strong random secret for signing tokens
- DB_PATH: Path to SQLite database file (e.g., /var/lib/portfolio/portfolio.db)
- SMTP_HOST: SMTP server hostname (optional for activation emails)
- SMTP_PORT: SMTP port (587 for STARTTLS, 465 for SSL)
- SMTP_USER: SMTP username
- SMTP_PASS: SMTP password
- MAIL_FROM: From header (e.g., "Portfolio <no-reply@example.com>")
- PORT: Internal Node server port (e.g., 3000)

Example:
```
export AUTH_SECRET="change-this-strong-secret"
export DB_PATH="/var/lib/portfolio/portfolio.db"
export SMTP_HOST="smtp.yourprovider.com"
export SMTP_PORT="587"
export SMTP_USER="your_user"
export SMTP_PASS="your_pass"
export MAIL_FROM="Portfolio <no-reply@example.com>"
export PORT=3000
```

## File Layout
Upload the following files to `/var/www/portfolio` (or your chosen path):
- index.html
- login.html
- register.html
- new.html
- style.css
- script.js
- login.js
- register.js
- assets/**

Keep `server.js` and Node runtime managed via a process manager (PM2/systemd).

## Systemd Service (Node)
Create `/etc/systemd/system/portfolio.service`:
```
[Unit]
Description=Portfolio API Server
After=network.target

[Service]
Environment=AUTH_SECRET=change-this-strong-secret
Environment=DB_PATH=/var/lib/portfolio/portfolio.db
Environment=SMTP_HOST=smtp.yourprovider.com
Environment=SMTP_PORT=587
Environment=SMTP_USER=your_user
Environment=SMTP_PASS=your_pass
Environment=MAIL_FROM=Portfolio <no-reply@example.com>
Environment=PORT=3000
WorkingDirectory=/var/www/portfolio
ExecStart=/usr/bin/node /var/www/portfolio/server.js
Restart=always
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```
Reload and enable:
```
sudo systemctl daemon-reload
sudo systemctl enable --now portfolio
```

## Nginx Reverse Proxy
Example `/etc/nginx/sites-available/portfolio`:
```
server {
  listen 80;
  server_name portfolio.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl;
  server_name portfolio.example.com;
  # ssl_certificate /etc/letsencrypt/live/portfolio.example.com/fullchain.pem;
  # ssl_certificate_key /etc/letsencrypt/live/portfolio.example.com/privkey.pem;

  root /var/www/portfolio;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Connection "";
  }
}
```
Enable and reload:
```
sudo ln -s /etc/nginx/sites-available/portfolio /etc/nginx/sites-enabled/portfolio
sudo nginx -t && sudo systemctl reload nginx
```

## SMTP and Email Deliverability
- Use a reputable provider (SendGrid/Mailgun/SES)
- Set SPF, DKIM, and DMARC records for your domain
- Verify sending domain to avoid spam folders

## Security Notes
- Always run behind HTTPS
- Keep `AUTH_SECRET` private and long
- Restrict DB file permissions to `www-data`
- Consider adding rate limiting to `/api/login` and `/api/register`

## Health Check
You can verify tokens via `/api/me`:
- Send `Authorization: Bearer <token>` and expect a JSON payload with the user.

## Backup
Before restarting/stopping, the server exports data (`backup-data.json`). Ensure `/var/www/portfolio` is writable by the service user.

## Deployment Workflow
- Push to `main`
- Pull onto server (or use CI/CD)
- Restart service
```
sudo systemctl restart portfolio
```

## Troubleshooting
- 404/401 on API: ensure same origin (UI and API via Nginx) and valid token
- Email not sent: check SMTP env vars and server logs
- Port in use: verify systemd service running and Nginx proxy pointing to correct upstream
