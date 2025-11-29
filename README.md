# Aplicația Mea Web

O aplicație web simplă creată cu HTML, CSS și JavaScript.

## Structura Proiectului

- `index.html` - Pagina principală
- `style.css` - Stilizare
- `script.js` - Logica JavaScript

## Cum să rulezi

Deschide fișierul `index.html` în browser.

## Deploy gratuit: Cloudflare Workers + D1

Backend-ul poate rula gratuit pe Cloudflare Workers, cu cron la fiecare minut și bază de date D1.

### Pași de instalare

- Instalează Wrangler: `npm i -g wrangler`
- Autentificare: `wrangler login`
- Creează baza D1: `wrangler d1 create portfolio`
- Copiază `database_id` din output în `wrangler.toml` la `d1_databases.database_id`
- Aplică migrațiile: `wrangler d1 migrations apply portfolio`
- Rulează local: `wrangler dev` (verifică endpoints `/api/*`)
- Deploy: `wrangler deploy`

### Endpoints Worker

- `GET /api/stocks`, `POST /api/stocks`, `PUT /api/stocks/:id`, `DELETE /api/stocks/:id`
- `GET /api/deposits`, `POST /api/deposits`, `PUT /api/deposits/:id`, `DELETE /api/deposits/:id`
- `POST /api/performance-snapshot` (creează baseline automat la primul call)
- `GET /api/performance-snapshots?range=1m|1d|1w|1y|max|ytd|6m|5y`

### Cron

Worker-ul rulează un cron la fiecare minut (configurat în `wrangler.toml`) care:

- Evită dublurile (<55s de la ultimul snapshot)
- Calculează balanța portofoliului și depozitele în EUR
- Salvează snapshot cu procentele portofoliu/depozite/S&P 500/BET față de baseline
