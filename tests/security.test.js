"use strict";

/**
 * End-to-end security and behaviour tests. Each group starts the real server on a free port
 * with a throw-away data folder, so nothing touches real customer data.
 *
 *   npm test
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");

const ROOT = path.join(__dirname, "..");
const ADMIN_USER = "bx-owner-test";
const ADMIN_PASS = "correct horse battery staple 42";

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function startServer(extraEnv) {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bx-test-"));
  const env = Object.assign(
    { PATH: process.env.PATH, PORT: String(port), DATA_DIR: dataDir, ADMIN_USER, ADMIN_PASS },
    extraEnv || {}
  );
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], { env, cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));

  const base = "http://127.0.0.1:" + port;
  for (let i = 0; i < 80; i += 1) {
    try {
      await fetch(base + "/robots.txt");
      break;
    } catch (error) {
      if (child.exitCode !== null) throw new Error("server exited early:\n" + output);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return {
    base,
    dataDir,
    output: () => output,
    stop: () =>
      new Promise((resolve) => {
        child.once("exit", resolve);
        child.kill("SIGTERM");
      })
  };
}

function runServerExpectFail(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, "server.js")], {
      env: Object.assign({ PATH: process.env.PATH, PORT: String(30000 + Math.floor(Math.random() * 1000)) }, env),
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: "timeout", out });
    }, 5000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

const goodForm = () => ({
  ownerName: "Asha Rao",
  businessName: "Asha Bakery",
  email: "asha@example.com",
  phone: "98765 43210",
  city: "Hubballi",
  businessType: "Shop",
  budget: "₹10,000 to ₹25,000",
  requirements: "A website for my bakery with products and location."
});

// The test form's phone is "98765 43210", so the tracking check digits are 3210.
const trackReq = (s, id, last4) =>
  fetch(s.base + "/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: id, phoneLast4: last4 })
  });

const json = (body, headers) => ({
  method: "POST",
  headers: Object.assign({ "Content-Type": "application/json" }, headers || {}),
  body: JSON.stringify(body)
});

async function login(s) {
  const res = await fetch(s.base + "/api/login", json({ username: ADMIN_USER, password: ADMIN_PASS }));
  assert.equal(res.status, 200);
  const body = await res.json();
  const cookie = res.headers.getSetCookie()[0];
  return { cookie: cookie.split(";")[0], csrf: body.csrf, raw: cookie, body };
}

/* ------------------------------------------------------------------ */

test("server refuses to start with missing or weak admin settings", async () => {
  const none = await runServerExpectFail({});
  assert.equal(none.code, 1, none.out);
  const weak = await runServerExpectFail({ ADMIN_USER: "someone", ADMIN_PASS: "short" });
  assert.equal(weak.code, 1, weak.out);
  const example = await runServerExpectFail({ ADMIN_USER: "someone", ADMIN_PASS: "change-this-to-a-long-unique-password" });
  assert.equal(example.code, 1, example.out);
  const badHash = await runServerExpectFail({ ADMIN_USER: "someone", ADMIN_PASS_HASH: "nope" });
  assert.equal(badHash.code, 1, badHash.out);
  const badSite = await runServerExpectFail({ ADMIN_USER, ADMIN_PASS, SITE_URL: "javascript:alert(1)" });
  assert.equal(badSite.code, 1, badSite.out);
});

test("main behaviour and security", async (t) => {
  const s = await startServer();
  t.after(() => s.stop());

  await t.test("security headers are set and nothing leaks the stack", async () => {
    const res = await fetch(s.base + "/");
    assert.equal(res.status, 200);
    const csp = res.headers.get("content-security-policy");
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.equal(res.headers.get("x-powered-by"), null);
    assert.ok(res.headers.get("referrer-policy"));
    assert.ok(res.headers.get("permissions-policy"));
    assert.equal(res.headers.get("cross-origin-opener-policy"), "same-origin");
    assert.equal(res.headers.get("access-control-allow-origin"), null, "no CORS headers by default");
  });

  await t.test("CORS preflight from another site gets no permission", async () => {
    const res = await fetch(s.base + "/api/submit", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" }
    });
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });

  await t.test("source, secrets and data files are not reachable", async () => {
    const paths = [
      "/.env",
      "/.env.example",
      "/.git/config",
      "/server.js",
      "/package.json",
      "/package-lock.json",
      "/data/submissions.json",
      "/data/messages.json",
      "/tests/security.test.js",
      "/scripts/hash-password.js",
      "/node_modules/express/package.json",
      "/%2e%2e/server.js",
      "/..%2fserver.js",
      "/css/../../server.js",
      "/public/../server.js"
    ];
    for (const p of paths) {
      const res = await fetch(s.base + p);
      const text = await res.text();
      assert.equal(res.status, 404, p + " returned " + res.status);
      assert.doesNotMatch(text, /ADMIN_PASS|require\("express"\)|"dependencies"/, p + " leaked content");
    }
  });

  await t.test("page URLs and 404", async () => {
    for (const p of ["/", "/portfolio", "/dashboard", "/robots.txt", "/.well-known/security.txt", "/site.webmanifest"]) {
      const res = await fetch(s.base + p);
      assert.equal(res.status, 200, p);
    }
    const nope = await fetch(s.base + "/does-not-exist");
    assert.equal(nope.status, 404);
    assert.match(await nope.text(), /does not exist/);
    const redirect = await fetch(s.base + "/portfolio.html", { redirect: "manual" });
    assert.equal(redirect.status, 301);
    const dash = await fetch(s.base + "/dashboard");
    assert.equal(dash.headers.get("cache-control"), "no-store");
    assert.match(dash.headers.get("x-robots-tag") || "", /noindex/);
    const manifest = await (await fetch(s.base + "/site.webmanifest")).json();
    assert.equal(manifest.name, "BrandX Web");
  });

  await t.test("pages never mention the old brand or an invented domain", async () => {
    for (const p of ["/", "/portfolio", "/dashboard", "/404"]) {
      const html = await (await fetch(s.base + p)).text();
      assert.doesNotMatch(html, new RegExp("ap" + "na\\s*web", "i"), p);
      assert.doesNotMatch(html, /brandxweb\.in|%SITE_URL%/, p);
    }
  });

  await t.test("home page has the launch and cost-guide sections and no dead links", async () => {
    const html = await (await fetch(s.base + "/")).text();
    for (const id of ["launch", "offer", "estimate", "request", "track", "contact", "services", "how"]) {
      assert.match(html, new RegExp('id="' + id + '"'), "missing section #" + id);
    }
    assert.doesNotMatch(html, /id="work"|id="faq"/, "old sections are gone");
    const targets = [...html.matchAll(/href="#([a-z]+)"/g)].map((m) => m[1]);
    for (const target of targets) assert.match(html, new RegExp('id="' + target + '"'), "link to missing #" + target);
    for (const p of ["/portfolio", "/404"]) {
      const other = await (await fetch(s.base + p)).text();
      assert.doesNotMatch(other, /#faq/, p + " still links to the removed FAQ");
    }
    for (const asset of ["/js/estimator.js", "/js/motion.js", "/js/site.js", "/css/site.css"]) {
      assert.equal((await fetch(s.base + asset)).status, 200, asset);
    }
  });

  await t.test("owner API needs a real session", async () => {
    for (const [method, url] of [
      ["GET", "/api/submissions"],
      ["GET", "/api/messages"],
      ["PATCH", "/api/submissions/abc"],
      ["DELETE", "/api/submissions/abc"],
      ["DELETE", "/api/messages/abc"],
      ["POST", "/api/logout"]
    ]) {
      const res = await fetch(s.base + url, { method, headers: { "Content-Type": "application/json" }, body: method === "PATCH" ? "{}" : undefined });
      assert.equal(res.status, 401, method + " " + url);
    }
    const forged = await fetch(s.base + "/api/submissions", { headers: { Cookie: "bx_session=forged", Authorization: "Bearer forged" } });
    assert.equal(forged.status, 401);
    const anon = await (await fetch(s.base + "/api/session")).json();
    assert.equal(anon.authenticated, false);
    assert.equal(anon.csrf, undefined, "signed-out visitors never get a CSRF token");
    const forgedSession = await (await fetch(s.base + "/api/session", { headers: { Cookie: "bx_session=forged" } })).json();
    assert.equal(forgedSession.authenticated, false);
  });

  await t.test("login: wrong details fail, right details set a locked-down cookie", async () => {
    const bad = await fetch(s.base + "/api/login", json({ username: ADMIN_USER, password: "wrong" }));
    assert.equal(bad.status, 401);
    assert.equal(bad.headers.getSetCookie().length, 0);
    const wrongUser = await fetch(s.base + "/api/login", json({ username: "nobody", password: ADMIN_PASS }));
    assert.equal(wrongUser.status, 401);
    const weird = await fetch(s.base + "/api/login", json({ username: { $ne: "" }, password: { $ne: "" } }));
    assert.equal(weird.status, 401);

    const ok = await login(s);
    assert.match(ok.raw, /HttpOnly/i);
    assert.match(ok.raw, /SameSite=Strict/i);
    assert.match(ok.raw, /Max-Age=\d+/);
    assert.equal(ok.body.token, undefined, "session token must not be given to scripts");
    assert.ok(ok.csrf && ok.csrf.length >= 20);
  });

  await t.test("CSRF and cross-origin writes are blocked for the owner API", async () => {
    const { cookie, csrf } = await login(s);
    const noCsrf = await fetch(s.base + "/api/submissions/abc", { method: "DELETE", headers: { Cookie: cookie } });
    assert.equal(noCsrf.status, 403);
    const wrongCsrf = await fetch(s.base + "/api/submissions/abc", { method: "DELETE", headers: { Cookie: cookie, "X-CSRF-Token": "x".repeat(csrf.length) } });
    assert.equal(wrongCsrf.status, 403);
    const evil = await fetch(s.base + "/api/submissions/abc", { method: "DELETE", headers: { Cookie: cookie, "X-CSRF-Token": csrf, Origin: "https://evil.example" } });
    assert.equal(evil.status, 403);
    const nullOrigin = await fetch(s.base + "/api/submit", json(goodForm(), { Origin: "null" }));
    assert.equal(nullOrigin.status, 403);
    const crossSite = await fetch(s.base + "/api/submit", json(goodForm(), { "Sec-Fetch-Site": "cross-site" }));
    assert.equal(crossSite.status, 403);
    const sameOk = await fetch(s.base + "/api/submissions/abc", { method: "DELETE", headers: { Cookie: cookie, "X-CSRF-Token": csrf, Origin: s.base } });
    assert.equal(sameOk.status, 404, "valid session + csrf + same origin reaches the handler");
  });

  await t.test("public form: validation, XSS stripping, unguessable ID, private tracking", async () => {
    const bad = await fetch(s.base + "/api/submit", json({}));
    assert.equal(bad.status, 400);
    const badBody = await bad.json();
    assert.ok(badBody.errors.ownerName && badBody.errors.email && badBody.errors.phone);

    const typeConfusion = await fetch(
      s.base + "/api/submit",
      json(Object.assign(goodForm(), { ownerName: { $gt: "" }, email: ["a@b.co"], phone: { x: 1 }, requirements: 12345678901234 }))
    );
    assert.equal(typeConfusion.status, 400);

    const badEmails = ["a@b", "x?cc=evil@example.com@a.co", "<script>@a.co", "a b@c.co", "a@b..co"];
    for (const email of badEmails) {
      const r = await fetch(s.base + "/api/submit", json(Object.assign(goodForm(), { email })));
      assert.equal(r.status, 400, email);
    }

    const evil = Object.assign(goodForm(), {
      ownerName: "<img src=x onerror=alert(1)>Asha",
      businessName: "<script>alert('x')</script>Bakery",
      requirements: "<svg/onload=alert(1)> I need a website ‮reversed‬ with products"
    });
    const created = await fetch(s.base + "/api/submit", json(evil));
    assert.equal(created.status, 201);
    const { requestId } = await created.json();
    assert.match(requestId, /^BXW-\d{4}-\d{4}$/, "IDs are short, like BXW-2026-0001");

    const { cookie } = await login(s);
    const list = await (await fetch(s.base + "/api/submissions", { headers: { Cookie: cookie } })).json();
    const stored = list.submissions.find((x) => x.requestId === requestId);
    assert.ok(stored);
    assert.equal(stored.phone, "+919876543210");
    for (const field of ["ownerName", "businessName", "requirements"]) {
      assert.doesNotMatch(stored[field], /[<>]/, field + " still has markup characters");
      assert.doesNotMatch(stored[field], /[‮‬]/, field + " still has bidi controls");
    }

    const track = await trackReq(s, requestId.toLowerCase(), "3210");
    assert.equal(track.status, 200);
    const tb = await track.json();
    assert.equal(tb.status, "New");
    assert.equal(tb.phone, undefined);
    assert.equal(tb.email, undefined);
    assert.equal(tb.requirements, undefined);
    assert.equal(tb.id, undefined);

    const wrongPhone = await trackReq(s, requestId, "0000");
    assert.equal(wrongPhone.status, 404);
    const wrongBody = await wrongPhone.json();
    const missingId = await trackReq(s, "BXW-" + new Date().getFullYear() + "-9999", "3210");
    assert.equal(missingId.status, 404);
    assert.equal((await missingId.json()).message, wrongBody.message, "wrong phone and unknown ID must look identical");
    const noPhone = await trackReq(s, requestId, "");
    assert.equal(noPhone.status, 404);
    const oldGet = await fetch(s.base + "/api/track/" + requestId);
    assert.equal(oldGet.status, 404, "the old ID-only lookup is gone");
  });

  await t.test("contact form and honeypot", async () => {
    const bad = await fetch(s.base + "/api/contact", json({ name: "A", email: "nope", message: "short" }));
    assert.equal(bad.status, 400);
    const ok = await fetch(s.base + "/api/contact", json({ name: "Ravi <b>K</b>", email: "ravi@example.com", message: "Hello, I want a website <script>1</script>" }));
    assert.equal(ok.status, 201);
    const { cookie } = await login(s);
    const msgs = await (await fetch(s.base + "/api/messages", { headers: { Cookie: cookie } })).json();
    assert.ok(msgs.messages.length >= 1);
    assert.doesNotMatch(JSON.stringify(msgs.messages), /[<>]/);

    const before = (await (await fetch(s.base + "/api/submissions", { headers: { Cookie: cookie } })).json()).submissions.length;
    const bot = await fetch(s.base + "/api/submit", json(Object.assign(goodForm(), { website: "http://spam.example" })));
    assert.equal(bot.status, 201);
    const after = (await (await fetch(s.base + "/api/submissions", { headers: { Cookie: cookie } })).json()).submissions.length;
    assert.equal(after, before, "honeypot submissions are not saved");
  });

  await t.test("body handling: size, type and syntax", async () => {
    const big = await fetch(s.base + "/api/contact", json({ name: "Big", email: "a@b.co", message: "x".repeat(40000) }));
    assert.equal(big.status, 413);
    const text = await fetch(s.base + "/api/contact", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "hello" });
    assert.equal(text.status, 415);
    const form = await fetch(s.base + "/api/contact", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "name=a" });
    assert.equal(form.status, 415);
    const broken = await fetch(s.base + "/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" });
    assert.equal(broken.status, 400);
    assert.doesNotMatch(await broken.text(), /SyntaxError|at .*\.js/);
    const proto = await fetch(s.base + "/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"__proto__":{"admin":true},"name":"Proto","email":"p@example.com","message":"prototype pollution check"}' });
    assert.equal(proto.status, 201);
    assert.equal(({}).admin, undefined);
    const unknown = await fetch(s.base + "/api/nothing-here");
    assert.equal(unknown.status, 404);
    assert.equal((await unknown.json()).success, false);
  });

  await t.test("owner can update, delete and sign out; the session then stops working", async () => {
    const created = await (await fetch(s.base + "/api/submit", json(goodForm()))).json();
    const { cookie, csrf } = await login(s);
    const headers = { "Content-Type": "application/json", Cookie: cookie, "X-CSRF-Token": csrf };

    const badStatus = await fetch(s.base + "/api/submissions/" + created.requestId, { method: "PATCH", headers, body: JSON.stringify({ status: "Hacked" }) });
    assert.equal(badStatus.status, 400);
    const badId = await fetch(s.base + "/api/submissions/..%2f..%2fetc", { method: "PATCH", headers, body: JSON.stringify({ status: "New" }) });
    assert.ok([400, 404].includes(badId.status));
    const good = await fetch(s.base + "/api/submissions/" + created.requestId, { method: "PATCH", headers, body: JSON.stringify({ status: "In Progress" }) });
    assert.equal(good.status, 200);

    const track = await (await trackReq(s, created.requestId, "3210")).json();
    assert.equal(track.status, "In Progress");

    const del = await fetch(s.base + "/api/submissions/" + created.requestId, { method: "DELETE", headers });
    assert.equal(del.status, 200);
    assert.equal((await trackReq(s, created.requestId, "3210")).status, 404);

    const session = await (await fetch(s.base + "/api/session", { headers: { Cookie: cookie } })).json();
    assert.equal(session.authenticated, true);
    assert.equal(session.csrf, csrf);
    const out = await fetch(s.base + "/api/logout", { method: "POST", headers });
    assert.equal(out.status, 200);
    const after = await fetch(s.base + "/api/submissions", { headers: { Cookie: cookie } });
    assert.equal(after.status, 401, "old cookie must be dead after logout");
  });

  await t.test("assistant stays off without a key and never leaks one", async () => {
    const status = await (await fetch(s.base + "/api/chat/status")).json();
    assert.equal(status.enabled, false);
    const chat = await fetch(s.base + "/api/chat", json({ message: "hello" }));
    assert.equal(chat.status, 503);
  });

  await t.test("customer data files are owner-only", async () => {
    if (process.platform === "win32") return;
    const mode = fs.statSync(path.join(s.dataDir, "submissions.json")).mode & 0o777;
    assert.equal(mode, 0o600);
  });

  await t.test("the server log never prints the admin password", async () => {
    assert.doesNotMatch(s.output(), new RegExp(ADMIN_PASS));
  });
});

test("rate limiting: public forms", async (t) => {
  const s = await startServer();
  t.after(() => s.stop());
  const codes = [];
  for (let i = 0; i < 7; i += 1) {
    const r = await fetch(s.base + "/api/contact", json({ name: "Rate Test", email: "rate@example.com", message: "testing the rate limit " + i }));
    codes.push(r.status);
  }
  assert.deepEqual(codes.slice(0, 5), [201, 201, 201, 201, 201]);
  assert.equal(codes[5], 429);
  const blocked = await fetch(s.base + "/api/contact", json({ name: "Rate Test", email: "rate@example.com", message: "testing the rate limit again" }));
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers.get("retry-after") || blocked.headers.get("ratelimit"));
});

test("rate limiting: tracking guesses and login attempts", async (t) => {
  const s = await startServer();
  t.after(() => s.stop());

  // Per-ID lock: after 5 wrong phone guesses even the right digits are refused for a while.
  const made = await (await fetch(s.base + "/api/submit", json(goodForm()))).json();
  const wrong = [];
  for (const guess of ["0001", "0002", "0003", "0004", "0005"]) wrong.push((await trackReq(s, made.requestId, guess)).status);
  assert.deepEqual(wrong, [404, 404, 404, 404, 404]);
  const locked = await trackReq(s, made.requestId, "3210");
  assert.equal(locked.status, 429, "the right digits are refused while the ID is locked");

  // Per-IP limit: walking through many different IDs gets blocked quickly.
  const walk = [];
  for (let i = 0; i < 14; i += 1) {
    walk.push((await trackReq(s, "BXW-2026-" + String(100 + i).padStart(4, "0"), "1234")).status);
  }
  assert.equal(walk[0], 404);
  assert.ok(walk.includes(429), "walking through IDs must hit the limit: " + walk.join(","));

  const logins = [];
  for (let i = 0; i < 10; i += 1) {
    const r = await fetch(s.base + "/api/login", json({ username: ADMIN_USER, password: "wrong-" + i }));
    logins.push(r.status);
  }
  assert.equal(logins[0], 401);
  assert.ok(logins.includes(429), "brute force must hit the limit: " + logins.join(","));
  const stillBlocked = await fetch(s.base + "/api/login", json({ username: ADMIN_USER, password: ADMIN_PASS }));
  assert.equal(stillBlocked.status, 429, "even the right password is refused while locked out");
});

test("admin IP allow-list hides the owner API from other addresses", async (t) => {
  const s = await startServer({ ADMIN_ALLOWED_IPS: "203.0.113.9" });
  t.after(() => s.stop());
  const res = await fetch(s.base + "/api/login", json({ username: ADMIN_USER, password: ADMIN_PASS }));
  assert.equal(res.status, 404);
  const list = await fetch(s.base + "/api/submissions");
  assert.equal(list.status, 404);
});

test("hashed admin password works and SITE_URL fills share tags", async (t) => {
  const crypto = require("node:crypto");
  const salt = crypto.randomBytes(16);
  const N = 16384;
  const hash = crypto.scryptSync(ADMIN_PASS, salt, 64, { N, r: 8, p: 1, maxmem: 256 * N * 8 });
  const line = ["scrypt", N, 8, 1, salt.toString("base64url"), hash.toString("base64url")].join(":");
  const s = await startServer({ ADMIN_PASS: "", ADMIN_PASS_HASH: line, SITE_URL: "https://example.org/" });
  t.after(() => s.stop());
  const good = await fetch(s.base + "/api/login", json({ username: ADMIN_USER, password: ADMIN_PASS }));
  assert.equal(good.status, 200);
  const bad = await fetch(s.base + "/api/login", json({ username: ADMIN_USER, password: "nope nope nope" }));
  assert.equal(bad.status, 401);
  const html = await (await fetch(s.base + "/")).text();
  assert.match(html, /<link rel="canonical" href="https:\/\/example\.org\/">/);
  assert.doesNotMatch(html, /%SITE_URL%/);
});

test("HTTPS mode redirects and sets HSTS", async (t) => {
  const s = await startServer({ FORCE_HTTPS: "1" });
  t.after(() => s.stop());
  const res = await fetch(s.base + "/portfolio", { redirect: "manual" });
  assert.equal(res.status, 308);
  assert.match(res.headers.get("location"), /^https:\/\//);
});
