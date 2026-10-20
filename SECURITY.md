# Security notes for BrandX Web

## What was checked (audit of the original zip you sent)

| Area | Finding | Status |
| --- | --- | --- |
| Hard-coded secrets / API keys | None in the code; no `.env` in the zip. Scanned with gitleaks: no leaks | OK |
| Git history | The zip has no `.git` folder, so history could not be scanned. Run `gitleaks git .` on your real repository before publishing it | **Action for you** |
| Dashboard session | Token was kept in `sessionStorage` (readable by any script) and sent as a Bearer header | Fixed: HttpOnly, SameSite=Strict cookie + CSRF token, 8h limit, 1h idle limit |
| Admin password | Plain text comparison, weak example value accepted | Fixed: salted scrypt hash supported, weak or example passwords refuse to start |
| Tracking IDs | Sequential numbers (ending in `-2026-0001`), so anyone could walk through every customer's business name and city | Fixed: IDs stay short (`BXW-2026-0001`), but tracking now also needs the last 4 digits of the customer's phone number; wrong tries look identical for unknown and known IDs, and each ID locks for 15 minutes after 5 wrong tries |
| XSS | Output already used `textContent`; stored text could still contain markup | Fixed: markup characters and invisible/bidi characters stripped on input, strict CSP with no inline scripts or styles |
| `mailto:` links | Stored email could add mail headers (`?cc=`) | Fixed: stricter email check and encoded links |
| Security headers | Basic four only | Fixed: CSP, HSTS, COOP, CORP, Referrer-Policy, Permissions-Policy, frame blocking |
| CORS | No CORS headers (good) | Kept; cross-origin writes are also rejected by an Origin check |
| Rate limiting | Hand-written, per route | Replaced with `express-rate-limit`: global, forms, tracking, login (per 15 min and per day) |
| Debug mode | No debug flag, but dev-style errors possible | Fixed: production is the default, stack traces never reach visitors |
| Exposed files | Only `public/` is served; dotfiles ignored | Tests confirm `.env`, `server.js`, `data/`, `package.json`, path traversal all return 404 |
| Customer data in git | `data/*.json` was not git-ignored | Fixed: ignored; files are created with owner-only permissions |
| Fonts | Loaded from Google | Fixed: self-hosted, so the CSP stays strict and visitors' IPs are not sent to Google |
| Dependencies | Express 4.x | Updated to current versions; `npm audit`: 0 vulnerabilities |

## Things to know

- An attacker who keeps guessing wrong digits for one ID can lock that customer's tracking for 15 minutes. The customer can still call or WhatsApp you. This is the price of stopping brute force.
- Rate limits are kept in memory and reset when the server restarts. For several server instances, use a shared store.
- Sessions are also in memory: restarting the server signs the owner out. This is intentional and simple.
- Data is stored in JSON files. For heavy use, move to a database.
- The contact email and phone numbers on the site are public on purpose.
- The assistant sends visitors' questions to the AI provider you configure. Mention that in your privacy notice if you turn it on.

## Reporting a problem

See `/.well-known/security.txt`.
