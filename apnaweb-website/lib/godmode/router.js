"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const { analyzeWebsite } = require("./analyzer");
const { GodmodeExecutor } = require("./executor");
const { GodmodeAIEngine } = require("./ai-engine");
const { getProactiveRecommendations } = require("./proactive");

function createGodmodeRouter(baseDir) {
  const router = express.Router();
  const executor = new GodmodeExecutor(baseDir);
  const aiEngine = new GodmodeAIEngine(executor, baseDir);

  // 1. Status
  router.get("/status", function (req, res) {
    const history = executor.getHistory();
    res.json({
      success: true,
      agent: "GODMODE AI v3.0",
      status: "online",
      uptime: process.uptime(),
      aiProvider: aiEngine.apiKey ? "Google Gemini (Active)" : "Autonomous Local Heuristic Engine (Active)",
      hasCustomKey: Boolean(aiEngine.apiKey),
      backupsCount: history.length,
      timestamp: new Date().toISOString()
    });
  });

  // 2. Chat / Conversational Intelligence
  router.post("/chat", async function (req, res) {
    try {
      const message = req.body && req.body.message;
      const context = (req.body && req.body.context) || {};
      const response = await aiEngine.chat(message, context);
      res.json(Object.assign({ success: true }, response));
    } catch (err) {
      console.error("GODMODE Chat error:", err);
      res.status(500).json({ success: false, message: "AI Engine error: " + err.message });
    }
  });

  // 3. Website Audit & Intelligence Analysis
  router.get("/analyze", function (req, res) {
    try {
      const results = analyzeWebsite(baseDir);
      res.json(Object.assign({ success: true }, results));
    } catch (err) {
      console.error("GODMODE Analysis error:", err);
      res.status(500).json({ success: false, message: "Analysis failed: " + err.message });
    }
  });

  // 4. Proactive Recommendations
  router.get("/recommendations", function (req, res) {
    try {
      const recs = getProactiveRecommendations(baseDir);
      res.json({ success: true, recommendations: recs });
    } catch (err) {
      res.status(500).json({ success: false, message: "Could not load recommendations." });
    }
  });

  // 5. File Explorer Tree
  router.get("/files", function (req, res) {
    try {
      const publicDir = path.join(baseDir, "public");
      const filesList = [];

      function walk(dir, relPath) {
        const items = fs.readdirSync(dir);
        items.forEach((item) => {
          if (item === "node_modules" || item.startsWith(".")) return;
          const full = path.join(dir, item);
          const rel = path.join(relPath, item).replace(/\\/g, "/");
          const stat = fs.statSync(full);
          if (stat.isDirectory()) {
            walk(full, rel);
          } else {
            filesList.push({
              path: rel,
              size: stat.size,
              updatedAt: stat.mtime.toISOString(),
              extension: path.extname(item).toLowerCase()
            });
          }
        });
      }

      walk(publicDir, "public");
      if (fs.existsSync(path.join(baseDir, "server.js"))) {
        filesList.push({
          path: "server.js",
          size: fs.statSync(path.join(baseDir, "server.js")).size,
          updatedAt: fs.statSync(path.join(baseDir, "server.js")).mtime.toISOString(),
          extension: ".js"
        });
      }

      res.json({ success: true, files: filesList });
    } catch (err) {
      res.status(500).json({ success: false, message: "Could not list files: " + err.message });
    }
  });

  // 6. Read File Content
  router.get("/file", function (req, res) {
    try {
      const targetRel = req.query.path;
      if (!targetRel) {
        return res.status(400).json({ success: false, message: "Missing path parameter." });
      }

      // Security check: restrict path traversal
      const resolved = path.resolve(baseDir, targetRel);
      if (!resolved.startsWith(path.resolve(baseDir))) {
        return res.status(403).json({ success: false, message: "Access denied." });
      }

      if (!fs.existsSync(resolved)) {
        return res.status(404).json({ success: false, message: "File not found." });
      }

      const content = fs.readFileSync(resolved, "utf8");
      res.json({
        success: true,
        path: targetRel,
        content: content,
        size: Buffer.byteLength(content, "utf8")
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Could not read file: " + err.message });
    }
  });

  // 7. Create Plan & Diff
  router.post("/propose", function (req, res) {
    try {
      const plan = executor.createPlan(req.body || {});
      res.json({ success: true, plan: plan });
    } catch (err) {
      res.status(500).json({ success: false, message: "Could not create plan: " + err.message });
    }
  });

  // 8. Apply Plan (with auto-backup and verification)
  router.post("/apply", function (req, res) {
    try {
      const planId = req.body && req.body.planId;
      if (!planId) {
        return res.status(400).json({ success: false, message: "Missing planId." });
      }

      const result = executor.applyPlan(planId);
      res.json(result);
    } catch (err) {
      console.error("GODMODE Apply error:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 9. Rollback Plan
  router.post("/rollback", function (req, res) {
    try {
      const backupId = req.body && req.body.backupId;
      if (!backupId) {
        return res.status(400).json({ success: false, message: "Missing backupId." });
      }

      const result = executor.rollback(backupId);
      res.json(result);
    } catch (err) {
      console.error("GODMODE Rollback error:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 10. Execution History
  router.get("/history", function (req, res) {
    try {
      const history = executor.getHistory();
      res.json({ success: true, history: history });
    } catch (err) {
      res.status(500).json({ success: false, message: "Could not fetch history." });
    }
  });

  // 11. Website Health & Asset Verification
  router.get("/verify", function (req, res) {
    try {
      const publicDir = path.join(baseDir, "public");
      const requiredFiles = [
        "index.html",
        "portfolio.html",
        "dashboard.html",
        "404.html",
        "css/site.css",
        "js/site.js"
      ];

      const checks = requiredFiles.map((file) => {
        const full = path.join(publicDir, file);
        const exists = fs.existsSync(full);
        let size = 0;
        if (exists) {
          size = fs.statSync(full).size;
        }
        return {
          file: file,
          exists: exists,
          healthy: exists && size > 0,
          size: size
        };
      });

      const allHealthy = checks.every((c) => c.healthy);

      res.json({
        success: true,
        healthy: allHealthy,
        checks: checks,
        verifiedAt: new Date().toISOString()
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Verification check failed: " + err.message });
    }
  });

  // 12. Configuration
  router.post("/config", function (req, res) {
    try {
      const apiKey = req.body && req.body.apiKey;
      if (apiKey !== undefined) {
        aiEngine.setApiKey(apiKey.trim());
      }
      res.json({
        success: true,
        message: "Configuration updated.",
        hasCustomKey: Boolean(aiEngine.apiKey)
      });
    } catch (err) {
      res.status(500).json({ success: false, message: "Config error: " + err.message });
    }
  });

  return router;
}

module.exports = {
  createGodmodeRouter
};

