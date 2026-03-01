# Apprenticeship Web App

Local, free, no-API-key web app that scrapes England apprenticeship listings and shows only roles posted within the last 45 days for:
- Tech
- Business
- Data Analyst
- Finance

## Stack
- Scraper: Crawlee + Playwright
- API: Fastify + better-sqlite3
- Frontend: React + Vite
- Storage: SQLite

## Quick Start

```bash
cd ~/apprenticeship-webapp
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install
npm run dev
```

- API: `http://localhost:3001`
- Web: `http://localhost:5173`

To crawl data manually:

```bash
curl -X POST http://localhost:3001/api/crawl/run
```

## Scraper Configuration

The scraper defaults to `tech`, `business`, `data_analyst`, and `finance`.

- `TARGET_CATEGORIES`: Comma-separated subset of `tech,business,data_analyst,finance`
- `LINKEDIN_KEYWORDS`: Comma-separated LinkedIn search keywords
- `LINKEDIN_LOCATION`: LinkedIn location query (default: `England, United Kingdom`)
- `LINKEDIN_LIST_ONLY`: When `true` (default), use LinkedIn list-card extraction only and skip LinkedIn detail pages.
- `CRAWL_MAX_REQUESTS`: Max requests per crawl run (default: `80`)
- `CRAWL_MAX_CONCURRENCY`: Parallel requests (default: `1`)
- `CRAWL_MAX_RETRIES`: Retry attempts for failed requests (default: `0`)
- `CRAWL_JITTER_MIN_MS` / `CRAWL_JITTER_MAX_MS`: Random delay range between requests (defaults: `1500` / `5000`)

Example:

```bash
TARGET_CATEGORIES=tech,business,data_analyst,finance \
LINKEDIN_KEYWORDS="software apprentice,business apprentice,data analyst apprentice,finance apprentice" \
LINKEDIN_LOCATION="England, United Kingdom" \
LINKEDIN_LIST_ONLY=true \
CRAWL_MAX_REQUESTS=80 \
CRAWL_MAX_CONCURRENCY=1 \
CRAWL_MAX_RETRIES=0 \
CRAWL_JITTER_MIN_MS=1500 \
CRAWL_JITTER_MAX_MS=5000 \
npm run dev:api
```

## Scheduling (every 6 hours)

```bash
crontab -e
```

Add:

```cron
0 */6 * * * cd /Users/Timothy/apprenticeship-webapp && /usr/bin/curl -s -X POST http://localhost:3001/api/crawl/run >/tmp/apprenticeship-crawl.log 2>&1
```

## Notes
- Primary sources:
  - `findapprenticeship.service.gov.uk`
  - `linkedin.com/jobs`
- Cutoff uses `Europe/London` date handling.
- If Playwright browser is missing, run: `npx playwright install chromium`.
