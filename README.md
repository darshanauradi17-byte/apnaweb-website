# ApnaWeb

A website for a local web design service, with its own request system.

- Visitors read about the service and fill in a request form.
- Each request gets an ID like `APW-2026-0001`, which the customer can use on the tracking page.
- The owner signs in to a private dashboard to search requests, call or WhatsApp customers, and move each request through New, Contacted, In Progress and Delivered.
- The portfolio page has a message form. Messages show up in the dashboard too.

## Run it locally

You need Node.js 18 or newer.

```bash
cp .env.example .env     # then set ADMIN_USER and ADMIN_PASS
npm install
npm start
```

Open:

- `http://localhost:3000` for the website
- `http://localhost:3000/portfolio` for the portfolio
- `http://localhost:3000/dashboard` for the owner dashboard

The server will not start without `ADMIN_USER` and `ADMIN_PASS`. The login is never stored in the code.

## Environment variables

| Variable | Required | What it does |
| --- | --- | --- |
| `ADMIN_USER` | yes | Owner dashboard username |
| `ADMIN_PASS` | yes | Owner dashboard password. Use a long, unique one. |
| `PORT` | no | Port to listen on. Default 3000. |
| `TRUST_PROXY` | no | Set to `1` behind Nginx, Render, Railway or similar, so rate limits use the visitor's real IP. |
| `DATA_DIR` | no | Where to keep `submissions.json` and `messages.json`. Default `./data`. |

## Project layout

```
server.js            Express server and API
data/                Leads and messages (JSON files, created on first run)
public/
  index.html         Home page, request form, tracking
  portfolio.html     Portfolio and message form
  dashboard.html     Owner dashboard (not indexed by search engines)
  404.html           Page not found
  css/               site.css (shared), dashboard.css
  js/                site.js (forms, menu, tracking), dashboard.js
  images/            Screenshots (WebP)
  favicon.*, icon-*.png, apple-touch-icon.png, site.webmanifest
```

The header and footer are repeated in `index.html`, `portfolio.html` and `404.html`. If you change a nav link or contact detail, change it in all three.

## API

| Route | Access | Purpose |
| --- | --- | --- |
| `POST /api/submit` | public, rate limited | Create a website request |
| `GET /api/track/:requestId` | public, rate limited | Status only: business, city, stage, dates |
| `POST /api/contact` | public, rate limited | Portfolio message |
| `POST /api/login`, `POST /api/logout` | owner | Dashboard session |
| `GET/PATCH/DELETE /api/submissions` | owner | Manage requests |
| `GET/DELETE /api/messages` | owner | Manage messages |

## Before you launch

1. Connect your custom domain and make sure HTTPS is on.
2. Set a strong `ADMIN_PASS` in the host's environment settings, not in a file in the repository.
3. Once the domain is known, add a `<link rel="canonical">` and Open Graph image and URL to the home page, and publish a `sitemap.xml`.
4. Clear any test requests from `data/submissions.json`.
5. Add real GitHub and LinkedIn links to the portfolio contact list if you want them.
6. Add a photo of yourself to the portfolio only if it is a real photograph.
7. Use a host with a persistent disk, or move the JSON files to a database. Hosts that wipe the disk on each deploy will lose requests.
