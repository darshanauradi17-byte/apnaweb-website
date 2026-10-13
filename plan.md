# ApnaWeb Security Audit & Hardening Plan

Repo root: `c:\Users\darsh\Downloads\apnaweb-website\apnaweb-website` (git repo, 1 commit `5b07094` on `main`, pushed to PUBLIC GitHub repo `darshanauradi17-byte/apnaweb-website`).
Stack: Node 18+ / Express 4.22.2 / dotenv, static HTML+JS frontend, JSON-file storage. No tests, no linter, no build step.

PROTECTED (never modify): owner dashboard (dashboard.html, js/dashboard.js, css/dashboard.css), portfolio (portfolio.html), and site.js/css (serves portfolio + tracking).

## PHASE 1 AUDIT FINDINGS (awaiting user sign-off)

### Critical
1. **Real customer PII in a PUBLIC GitHub repo** — `data/submissions.json:1-32` (names, phones, emails, city, requirements) is git-tracked, committed in `5b07094`, pushed to public `origin/main` (GitHub API confirms `"visibility": "public"`). `.gitignore` does not exclude `data/`. History rewrite needed for full removal (cannot force-push per rules — user decision).

### High
2. **Weak owner password** — `.env:8` `ADMIN_PASS=appu****` (short, guessable). Never committed to git (verified). Must be rotated.
3. **Critical dependency advisory: proxy-addr** (GHSA-jqcg-44mw-7w3h, IP spoofing via IPv4-mapped IPv6) — transitively used by express; directly undermines `req.ip`-based rate limiting. Plus 3 moderate advisories (qs DoS x2, body-parser/express dependents). All fixable via `npm audit fix` -> express 4.22.3 (in-range, safe).
4. **Rate limiting depends on `TRUST_PROXY` being set correctly at deploy** — `server.js:12-14,99`. Behind Render/Railway/Nginx without it, all users share one bucket (global form lockout) or limiter keys on wrong IP.

### Medium
5. **Cross-site spam possible on public endpoints** — `/api/submit`, `/api/contact` accept `application/x-www-form-urlencoded` (`server.js:169`); cross-origin HTML forms can POST without preflight. Fix: require JSON content-type on /api (server-only).
6. **Missing CSP and HSTS headers** — `server.js:155-166` has X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, x-powered-by off (`:10`), but no CSP/HSTS.
7. **Enumerable request IDs leak business names/city** — `server.js:79-89` sequential `APW-YYYY-NNNN` + public `/api/track/:requestId` (`:269-297`) returns businessName/city/dates. 30 req/min/IP enumeration. Changing format = user decision (affects existing tracking IDs).
8. **Login brute force: 10/15min/IP only** (`server.js:352`), no per-account lockout, failed logins not logged.
9. **Owner token in sessionStorage** (`dashboard.js:4,36,44`) — XSS-theft risk; httpOnly cookie would be safer but file is PROTECTED -> user decision. (Auth via Authorization header = CSRF-safe by design.)
10. **Plaintext password in env + sha256 compare** (`server.js:26,145-149`) — offer optional `ADMIN_PASS_HASH` (scrypt/sha256) so plaintext can be retired; backward compatible, server-only.

### Low
11. `data/messages.json` tracked in git — will collect PII as messages arrive (same fix as #1).
12. Google Fonts loaded from CDN (index/portfolio/dashboard HTML) — privacy/supply-chain; self-hosting touches protected HTML -> user decision; CSP must allow fonts.googleapis.com/gstatic.com.
13. Rate-limit buckets & tokens in-memory — reset on deploy (limiter briefly bypassed; tokens fail closed). Fine for single instance.
14. Sequential-ID privacy also mitigated only by rate limit.

### Verified OK (no action)
- `.env` correctly gitignored (`.gitignore:1-6`), never in history; `.env.example` has placeholders only. Startup exits without creds (`server.js:28-33`).
- No secrets in git history (full `git log -p --all` scan: only `.env.example` placeholder). Nothing to rotate from git.
- All owner APIs behind server-side `authenticate` (`server.js:383,396,422,440,449,467`); no IDOR (single-owner model; track endpoint whitelists fields `:284-292`); no mass assignment (explicit field pick `:239-253`); no CORS headers (secure default); tokens 32-byte random, 12h expiry, timing-safe compares, logout invalidates.
- XSS: zero `innerHTML`/`eval`/`document.write` sinks in all source files; DOM built via createElement/textContent only; no inline scripts.
- No SQL/NoSQL/command exec/file uploads; 20kb body limits; atomic file writes; dotfiles not served; no backups/config leftovers in web root; generic client errors, stack traces server-side only; no source maps/debug routes; no unused deps or dead endpoints.
- Rate limits exist on all public endpoints (submit 5/10min, contact 5/10min, track 30/min, login 10/15min) + honeypot + request-ID regex.


## PHASE 2 (after approval) — branch `security-hardening`, one commit per fix, never push
1. Untrack `data/*.json` + add `data/` to `.gitignore` (keeps local files; history cleanup = user decision).
2. `npm audit fix` (express 4.22.3 / qs / proxy-addr); boot-test server. dotenv 16->18 major = flag only.
3. Require `Content-Type: application/json` on /api POST/PATCH (blocks cross-site form spam).
4. Add HSTS + CSP (allow self, fonts.googleapis.com, fonts.gstatic.com; no unsafe-inline) headers server-side.
5. Stricter login limiter (per-IP + per-username) + failed-login logging (never log passwords).
6. Optional `ADMIN_PASS_HASH` support (timing-safe), documented in `.env.example` + README.
7. README security section update.
Every step: run `node server.js` boot check + smoke-test endpoints; no linter/tests exist (report N/A).

## PHASE 3 — verify
- npm audit, secret re-scan, boot + endpoint smoke tests, `git diff --stat main...security-hardening` to prove zero protected-area changes.
- Final report: fixed / open / secrets to rotate (ADMIN_PASS `appu****`) / external settings (HTTPS+HSTS, TRUST_PROXY, GitHub 2FA + make repo private or scrub history) / ongoing checklist.

## Needs user decision
- PII in public repo remediation: make repo private now? history rewrite + force-push (your rule forbids me from force-pushing)? notify affected customers?
- Change request-ID format to unguessable tokens?
- Switch token storage to httpOnly cookie (requires editing protected dashboard.js)?
- Self-host fonts (requires editing protected HTML)?
- dotenv major upgrade; adding zod validator; bcrypt/argon2 dep (vs dependency-free scrypt/sha256 hash).
