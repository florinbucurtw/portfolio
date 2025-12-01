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

### Import date existente în D1

Poți migra datele actuale (SQLite) în D1:

1. Generează fișier SQL:

```bash
node scripts/generate-d1-import.js > d1-import.sql
```

2. Creează baza (dacă nu e creată) și aplică migrația structurii:

```bash
wrangler d1 create portfolio
wrangler d1 migrations apply portfolio
```

3. Execută importul:

```bash
wrangler d1 execute portfolio --file=./d1-import.sql
```

4. Verifică:

```bash
wrangler d1 execute portfolio --command "SELECT COUNT(*) AS c FROM stocks;"
wrangler d1 execute portfolio --command "SELECT COUNT(*) AS c FROM deposits;"
wrangler d1 execute portfolio --command "SELECT COUNT(*) AS c FROM dividends;"
```

Nota: Dacă există deja date în D1, inserările duplicate pe `symbol` vor eșua (UNIQUE). Editează `d1-import.sql` manual înainte de executare dacă vrei doar anumite rânduri.

### Override API în producție

În `index.html` există un snippet care setează `window.API_BASE_OVERRIDE` dacă nu e localhost. Actualizează URL-ul Worker după deploy.

## Hosting Frontend: GitHub Pages (Varianta 1)

Site-ul static este în rădăcina repo-ului. Workflow-ul `deploy-pages.yml` publică automat la fiecare push pe `main`.

### Activare manuală (prima dată):

1. Mergi în Settings → Pages.
2. La Source selectează: `GitHub Actions` (dacă apare) sau verifică că workflow-ul rulează.
3. După primul run vei primi un URL: `https://florinbucurtw.github.io/portfolio/`.

### Verificare override API

După ce ai deploy Worker și ai pus URL-ul lui în snippet:

- Deschide pagina publică.
- Console (DevTools): vezi mesajul `API_BASE_OVERRIDE activ: ...`.
- Verifică rețea: cererile către `/api/...` sunt redirecționate spre Worker.

### Ajustare URL Worker

În `index.html` caută:

```html
const workerUrl = 'https://portfolio-api.REPLACE.workers.dev';
```

Înlocuiește cu URL-ul real (ex: `https://portfolio-api.florin.workers.dev`).

### Comenzi utile

Rulare workflow manual:

```bash
gh workflow run Deploy_GitHub_Pages
```

Inspect logs:

```bash
gh run list --workflow Deploy_GitHub_Pages
```

### Notă

- Calea `/api/...` cu override funcționează chiar dacă site-ul e servit la `/portfolio/`.
- Dacă migrezi ulterior la Cloudflare Pages + route Worker, poți elimina complet snippet-ul override.
