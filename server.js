"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
app.disable("x-powered-by");

if (process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
}

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "data");
const SUBMISSIONS_FILE = path.join(DATA_DIR, "submissions.json");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");

// Owner login comes from the environment. It is never stored in code.
const OWNER_USERNAME = process.env.ADMIN_USER || process.env.OWNER_USERNAME || "";
const OWNER_PASSWORD = process.env.ADMIN_PASS || process.env.OWNER_PASSWORD || "";

if (!OWNER_USERNAME || !OWNER_PASSWORD) {
  console.error(
    "Missing owner login. Set ADMIN_USER and ADMIN_PASS in your .env file (see .env.example)."
  );
  process.exit(1);
}

const STATUSES = ["New", "Contacted", "In Progress", "Delivered"];
const BUSINESS_TYPES = [
  "Restaurant",
  "Shop",
  "Business",
  "Medical",
  "Education",
  "Real Estate",
  "Other"
];
const BUDGETS = [
  "₹5,000 to ₹10,000",
  "₹10,000 to ₹25,000",
  "₹25,000 to ₹50,000",
  "₹50,000+"
];

/* ------------------------------------------------------------------
   Storage (JSON files, written atomically)
------------------------------------------------------------------ */

fs.mkdirSync(DATA_DIR, { recursive: true });
[SUBMISSIONS_FILE, MESSAGES_FILE].forEach((file) => {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, "[]", "utf8");
  }
});

function readJson(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return raw.trim() ? JSON.parse(raw) : [];
  } catch (error) {
    console.error("Could not read " + path.basename(file) + ":", error.message);
    throw error;
  }
}

function writeJson(file, data) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function nextRequestId(submissions) {
  const year = new Date().getFullYear();
  let highest = 0;
  submissions.forEach((item) => {
    const match = /^APW-(\d{4})-(\d+)$/.exec(String(item.requestId || ""));
    if (match && Number(match[1]) === year) {
      highest = Math.max(highest, Number(match[2]));
    }
  });
  return "APW-" + year + "-" + String(highest + 1).padStart(4, "0");
}

/* ------------------------------------------------------------------
   Small helpers
------------------------------------------------------------------ */

const buckets = new Map();

function rateLimit(name, max, windowMs) {
  return function (req, res, next) {
    const key = name + ":" + req.ip;
    const now = Date.now();
    const entry = buckets.get(key);
    if (!entry || now > entry.reset) {
      buckets.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set("Retry-After", String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({
        success: false,
        message: "Too many attempts. Please wait a few minutes and try again."
      });
    }
    next();
  };
}

setInterval(function () {
  const now = Date.now();
  buckets.forEach(function (entry, key) {
    if (now > entry.reset) buckets.delete(key);
  });
}, 10 * 60 * 1000).unref();

function clean(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  let national = digits;
  if (digits.length === 12 && digits.startsWith("91")) national = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) national = digits.slice(1);
  if (/^[6-9]\d{9}$/.test(national)) return "+91" + national;
  return "";
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/* ------------------------------------------------------------------
   Middleware
------------------------------------------------------------------ */

app.use(function (req, res, next) {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
  });
  if (req.path.startsWith("/dashboard") || req.path.startsWith("/api/")) {
    res.set("X-Robots-Tag", "noindex, nofollow");
  }
  next();
});

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

// Serve one address per page: /portfolio, not /portfolio.html.
app.get(["/index.html", "/portfolio.html", "/dashboard.html"], function (req, res) {
  const clean = req.path.replace(/(^\/index)?\.html$/, "") || "/";
  res.redirect(301, clean === "" ? "/" : clean);
});

app.get(["/404", "/404.html"], function (req, res) {
  res.status(404).sendFile(path.join(PUBLIC_DIR, "404.html"));
});

app.use(
  express.static(PUBLIC_DIR, {
    extensions: ["html"],
    index: "index.html",
    setHeaders: function (res, filePath) {
      if (/\.(webp|png|jpg|jpeg|svg|ico|woff2)$/i.test(filePath)) {
        res.set("Cache-Control", "public, max-age=604800");
      } else if (/\.(css|js)$/i.test(filePath)) {
        res.set("Cache-Control", "public, max-age=3600");
      } else {
        res.set("Cache-Control", "no-cache");
      }
    }
  })
);

/* ------------------------------------------------------------------
   Public API
------------------------------------------------------------------ */

app.post("/api/submit", rateLimit("submit", 5, 10 * 60 * 1000), function (req, res) {
  try {
    const body = req.body || {};

    // Hidden field that real visitors never see. Bots fill it in.
    if (clean(body.website, 200)) {
      return res.status(201).json({ success: true, requestId: "APW-0000-0000" });
    }

    const ownerName = clean(body.ownerName, 100);
    const businessName = clean(body.businessName, 120);
    const city = clean(body.city, 100);
    const email = clean(body.email, 150).toLowerCase();
    const phone = normalizePhone(body.phone);
    const businessType = clean(body.businessType, 40);
    const budget = clean(body.budget, 40);
    const requirements = clean(body.requirements, 3000);

    const errors = {};
    if (ownerName.length < 2) errors.ownerName = "Enter your full name.";
    if (businessName.length < 2) errors.businessName = "Enter your business name.";
    if (!isEmail(email)) errors.email = "Enter a valid email address.";
    if (!phone) errors.phone = "Enter a 10 digit Indian mobile number.";
    if (city.length < 2) errors.city = "Enter your city.";
    if (!BUSINESS_TYPES.includes(businessType)) errors.businessType = "Choose a category.";
    if (!BUDGETS.includes(budget)) errors.budget = "Choose a budget range.";
    if (requirements.length < 10) errors.requirements = "Tell us a little more (at least 10 characters).";

    if (Object.keys(errors).length) {
      return res.status(400).json({
        success: false,
        message: "Please check the highlighted fields.",
        errors: errors
      });
    }

    const submissions = readJson(SUBMISSIONS_FILE);
    const now = new Date().toISOString();
    const submission = {
      id: crypto.randomUUID(),
      requestId: nextRequestId(submissions),
      ownerName: ownerName,
      businessName: businessName,
      businessType: businessType,
      phone: phone,
      email: email,
      city: city,
      requirements: requirements,
      budget: budget,
      status: "New",
      createdAt: now,
      updatedAt: now
    };

    submissions.push(submission);
    writeJson(SUBMISSIONS_FILE, submissions);

    res.status(201).json({ success: true, requestId: submission.requestId });
  } catch (error) {
    console.error("Submit error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong on our side. Please try again, or call us."
    });
  }
});

// Public status lookup. Only returns what a customer needs to see.
app.get("/api/track/:requestId", rateLimit("track", 30, 60 * 1000), function (req, res) {
  try {
    const wanted = clean(req.params.requestId, 40).toUpperCase();
    const item = readJson(SUBMISSIONS_FILE).find(function (entry) {
      return String(entry.requestId || "").toUpperCase() === wanted;
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "No request found with that ID. Check the ID and try again."
      });
    }

    res.set("Cache-Control", "no-store");
    res.json({
      success: true,
      requestId: item.requestId,
      businessName: item.businessName,
      city: item.city || "",
      status: STATUSES.includes(item.status) ? item.status : "New",
      createdAt: item.createdAt,
      updatedAt: item.updatedAt || item.createdAt
    });
  } catch (error) {
    console.error("Track error:", error);
    res.status(500).json({ success: false, message: "Could not look up that request." });
  }
});

// Message form on the portfolio page.
app.post("/api/contact", rateLimit("contact", 5, 10 * 60 * 1000), function (req, res) {
  try {
    const body = req.body || {};

    if (clean(body.website, 200)) {
      return res.status(201).json({ success: true });
    }

    const name = clean(body.name, 100);
    const email = clean(body.email, 150).toLowerCase();
    const message = clean(body.message, 3000);

    const errors = {};
    if (name.length < 2) errors.name = "Enter your name.";
    if (!isEmail(email)) errors.email = "Enter a valid email address.";
    if (message.length < 10) errors.message = "Write a short message (at least 10 characters).";

    if (Object.keys(errors).length) {
      return res.status(400).json({
        success: false,
        message: "Please check the highlighted fields.",
        errors: errors
      });
    }

    const messages = readJson(MESSAGES_FILE);
    messages.push({
      id: crypto.randomUUID(),
      name: name,
      email: email,
      message: message,
      createdAt: new Date().toISOString()
    });
    writeJson(MESSAGES_FILE, messages);

    res.status(201).json({ success: true });
  } catch (error) {
    console.error("Contact error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong on our side. Please email or call instead."
    });
  }
});

/* ------------------------------------------------------------------
   Owner login and API
------------------------------------------------------------------ */

const TOKEN_LIFETIME_MS = 12 * 60 * 60 * 1000;
const activeTokens = new Map();

app.post("/api/login", rateLimit("login", 10, 15 * 60 * 1000), function (req, res) {
  const username = clean(req.body && req.body.username, 100);
  const password = String((req.body && req.body.password) || "");

  const userOk = safeEqual(username, OWNER_USERNAME);
  const passOk = safeEqual(password, OWNER_PASSWORD);

  if (!(userOk && passOk)) {
    return res.status(401).json({ success: false, message: "Wrong username or password." });
  }

  const token = crypto.randomBytes(32).toString("hex");
  activeTokens.set(token, Date.now() + TOKEN_LIFETIME_MS);
  res.json({ success: true, token: token });
});

function tokenFrom(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function authenticate(req, res, next) {
  const token = tokenFrom(req);
  const expires = activeTokens.get(token);
  if (!token || !expires || Date.now() > expires) {
    activeTokens.delete(token);
    return res.status(401).json({ success: false, message: "Please log in again." });
  }
  next();
}

app.get("/api/submissions", authenticate, function (req, res) {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ success: true, submissions: readJson(SUBMISSIONS_FILE) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not read requests." });
  }
});

function matchesId(item, id) {
  return String(item.requestId) === id || String(item.id) === id;
}

app.patch("/api/submissions/:id", authenticate, function (req, res) {
  try {
    const status = req.body && req.body.status;
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status." });
    }

    const submissions = readJson(SUBMISSIONS_FILE);
    const item = submissions.find(function (entry) {
      return matchesId(entry, req.params.id);
    });

    if (!item) {
      return res.status(404).json({ success: false, message: "Request not found." });
    }

    item.status = status;
    item.updatedAt = new Date().toISOString();
    writeJson(SUBMISSIONS_FILE, submissions);

    res.json({ success: true, submission: item });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not update the request." });
  }
});

app.delete("/api/submissions/:id", authenticate, function (req, res) {
  try {
    const submissions = readJson(SUBMISSIONS_FILE);
    const remaining = submissions.filter(function (entry) {
      return !matchesId(entry, req.params.id);
    });

    if (remaining.length === submissions.length) {
      return res.status(404).json({ success: false, message: "Request not found." });
    }

    writeJson(SUBMISSIONS_FILE, remaining);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not delete the request." });
  }
});

app.get("/api/messages", authenticate, function (req, res) {
  try {
    res.set("Cache-Control", "no-store");
    res.json({ success: true, messages: readJson(MESSAGES_FILE) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not read messages." });
  }
});

app.delete("/api/messages/:id", authenticate, function (req, res) {
  try {
    const messages = readJson(MESSAGES_FILE);
    const remaining = messages.filter(function (entry) {
      return String(entry.id) !== req.params.id;
    });

    if (remaining.length === messages.length) {
      return res.status(404).json({ success: false, message: "Message not found." });
    }

    writeJson(MESSAGES_FILE, remaining);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not delete the message." });
  }
});

app.post("/api/logout", authenticate, function (req, res) {
  activeTokens.delete(tokenFrom(req));
  res.json({ success: true });
});

/* ------------------------------------------------------------------
   Errors and 404
------------------------------------------------------------------ */

app.use("/api", function (req, res) {
  res.status(404).json({ success: false, message: "Not found." });
});

app.use(function (req, res) {
  res.status(404).sendFile(path.join(PUBLIC_DIR, "404.html"));
});

app.use(function (error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = error.status && error.status < 500 ? error.status : 500;
  if (req.path.startsWith("/api/")) {
    return res.status(status).json({
      success: false,
      message: status === 400 ? "That request could not be read." : "Server error."
    });
  }
  console.error(error);
  res.status(status).sendFile(path.join(PUBLIC_DIR, "404.html"));
});

app.listen(PORT, function () {
  console.log("BrandX Web is running on http://localhost:" + PORT);
});
