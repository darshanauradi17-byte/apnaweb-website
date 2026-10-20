# BrandX Web

**We build. You grow.** A website for a local web design studio with its own request system.

- Visitors read about the service and fill in a request form.
- Each request gets a short ID like `BXW-2026-0001`. To track it, the customer also enters the last 4 digits of their phone number, so nobody can look up other people's requests by counting IDs.
- A launch banner and launch package section explain the build, host and launch service.
- A cost guide suggests one of your four budget ranges and pre-fills the request form.
- The owner signs in to a private dashboard to search requests, call or WhatsApp customers, and move each request through New, Contacted, In Progress and Delivered.
- The portfolio page has a message form. Messages show up in the dashboard too.
- Optional AI assistant (text and voice) that stays hidden until you configure it.

## Run it locally

Needs Node.js 20 or newer.

```bash
npm install
npm run hash-password        # prints ADMIN_PASS_HASH, paste it into .env
cp .env.example .env         # then fill in ADMIN_USER and ADMIN_PASS_HASH
npm run dev                  # development mode (http://localhost:3000)
```

`npm start` runs in production mode, which is the default and the safe one.
The server refuses to start without a strong owner login.

Pages: `/` home, `/portfolio`, `/dashboard` (owner only).

## Environment variables

See `.env.example` for the full list with comments. The important ones:

| Variable | Required | What it does |
| --- | --- | --- |
| `ADMIN_USER` | yes | Dashboard username (3+ characters) |
| `ADMIN_PASS_HASH` | yes* | Salted hash from `npm run hash-password` (recommended) |
| `ADMIN_PASS` | yes* | Plain password, 12+ characters. Use instead of the hash only if you must |
| `SITE_URL` | no | Your domain, e.g. `https://example.com`. Adds canonical and share-preview tags |
| `TRUST_PROXY` | no | Set to `1` behind Nginx, Render, Railway, Cloudflare |
| `FORCE_HTTPS` | no | Set to `1` once HTTPS is on |
| `ADMIN_ALLOWED_IPS` | no | Only these IPs can reach the owner login |
| `DATA_DIR` | no | Where leads are stored (default `./data`) |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | no | Both needed to switch the assistant on |

\* One of the two.

## Tests and checks

```bash
npm test         # 23 security and behaviour checks against the real server
npm run audit    # known-vulnerability check of dependencies
```

## Project layout

```
server.js            Express server and API
scripts/             hash-password.js
tests/               security.test.js
data/                Leads and messages (created on first run, git-ignored)
public/
  index.html  portfolio.html  dashboard.html  404.html
  js/estimator.js    the cost guide (edit the scoring here)
  css/  js/  images/  fonts/ (self-hosted)
  security.txt, robots.txt, site.webmanifest, icons
```

## API

| Route | Access | Purpose |
| --- | --- | --- |
| `POST /api/submit` | public, rate limited | Create a website request |
| `POST /api/track` | public, rate limited | Status only (business, city, stage, dates). Needs request ID + last 4 phone digits |
| `POST /api/contact` | public, rate limited | Portfolio message |
| `GET /api/chat/status`, `POST /api/chat` | public, rate limited | Optional assistant |
| `POST /api/login` | owner, rate limited | Starts a session (HttpOnly cookie) |
| `GET /api/session`, `POST /api/logout` | owner | Session state / sign out |
| `GET/PATCH/DELETE /api/submissions` | owner + CSRF | Manage requests |
| `GET/DELETE /api/messages` | owner + CSRF | Manage messages |

## Before you launch

1. Generate `ADMIN_PASS_HASH` and set it in your host's environment settings, not in a file in the repository.
2. Put the site behind HTTPS, then set `FORCE_HTTPS=1`, and `TRUST_PROXY=1` if you use a proxy.
3. Set `SITE_URL` to your domain.
4. Use a host with a persistent disk (or move the JSON files to a database), and back up `DATA_DIR`.
5. When you decide your prices, tell me or add them to the launch package section in `public/index.html`. No price is shown on the site now, apart from the budget ranges that were already in the request form.
6. Read `SECURITY.md`.
