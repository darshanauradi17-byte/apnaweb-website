(function () {
  "use strict";

  /* ==========================================================================
     GODMODE AI Client Controller & Reactive Engine
     ========================================================================== */

  var state = {
    activeView: "agent",
    currentPlan: null,
    auditData: null,
    historyData: [],
    filesData: [],
    isSending: false,
    isAuditing: false
  };

  // DOM Elements
  var views = {
    agent: document.getElementById("viewAgent"),
    audit: document.getElementById("viewAudit"),
    execute: document.getElementById("viewExecute"),
    insights: document.getElementById("viewInsights"),
    files: document.getElementById("viewFiles"),
    preview: document.getElementById("viewPreview")
  };

  var navBtns = document.querySelectorAll(".gm-mode-btn");
  var chatMessages = document.getElementById("chatMessages");
  var chatForm = document.getElementById("chatForm");
  var chatInput = document.getElementById("chatInput");
  var chatSubmitBtn = document.getElementById("chatSubmitBtn");
  var terminalLog = document.getElementById("terminalLog");
  var previewIframe = document.getElementById("previewIframe");

  /* ---------- Helpers ---------- */

  function logTerminal(message, type) {
    if (!terminalLog) return;
    var line = document.createElement("div");
    line.className = "term-line";

    var now = new Date();
    var timeStr = "[" + String(now.getHours()).padStart(2, "0") + ":" +
                  String(now.getMinutes()).padStart(2, "0") + ":" +
                  String(now.getSeconds()).padStart(2, "0") + "]";

    var timeSpan = document.createElement("span");
    timeSpan.className = "term-time";
    timeSpan.textContent = timeStr;

    var textSpan = document.createElement("span");
    if (type === "ok") textSpan.className = "term-ok";
    else if (type === "warn") textSpan.className = "term-warn";
    else if (type === "err") textSpan.className = "term-err";
    textSpan.textContent = message;

    line.appendChild(timeSpan);
    line.appendChild(textSpan);
    terminalLog.appendChild(line);
    terminalLog.scrollTop = terminalLog.scrollHeight;
  }

  function switchView(viewName) {
    if (!views[viewName]) return;
    state.activeView = viewName;

    Object.keys(views).forEach(function (key) {
      if (views[key]) {
        views[key].classList.toggle("active", key === viewName);
      }
    });

    navBtns.forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.view === viewName);
    });

    logTerminal("Switched mode to: " + viewName.toUpperCase(), "ok");

    if (viewName === "audit" && !state.auditData) {
      fetchAudit();
    } else if (viewName === "insights") {
      fetchRecommendations();
    } else if (viewName === "files" && state.filesData.length === 0) {
      fetchFiles();
    }
  }

  // Bind Mode Buttons
  navBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      switchView(btn.dataset.view);
    });
  });

  /* ---------- API Helpers ---------- */

  function api(url, options) {
    options = options || {};
    var headers = Object.assign({ Accept: "application/json" }, options.headers || {});
    if (options.body && typeof options.body === "object") {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    return fetch(url, Object.assign({}, options, { headers: headers })).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          throw new Error(data.message || ("HTTP Error " + res.status));
        }
        return data;
      });
    });
  }

  /* ---------- Chat & AI Engine ---------- */

  function renderAgentMessage(data) {
    var bubble = document.createElement("div");
    bubble.className = "message-bubble message-agent";

    // Format Markdown-like text
    var html = (data.message || "")
      .replace(/### (.*?)\n/g, "<h3>$1</h3>")
      .replace(/#### (.*?)\n/g, "<h4>$1</h4>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br>");

    bubble.innerHTML = "<p>" + html + "</p>";

    // Render Action Chips if present
    if (data.actions && data.actions.length) {
      var actionGroup = document.createElement("div");
      actionGroup.className = "agent-action-group";

      data.actions.forEach(function (act) {
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "agent-action-chip";
        chip.textContent = act.label;

        chip.addEventListener("click", function () {
          if (act.action === "chat_prompt") {
            sendUserMessage(act.prompt);
          } else if (act.action === "create_plan") {
            createPlanFromIssue(act.issueId);
          } else if (act.action === "apply_plan") {
            applyPlan(act.planId);
          }
        });

        actionGroup.appendChild(chip);
      });

      bubble.appendChild(actionGroup);
    }

    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (data.plan) {
      setProposedPlan(data.plan);
    }
  }

  function renderUserMessage(text) {
    var bubble = document.createElement("div");
    bubble.className = "message-bubble message-user";
    bubble.textContent = text;
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function sendUserMessage(text) {
    var prompt = (text || chatInput.value).trim();
    if (!prompt || state.isSending) return;

    chatInput.value = "";
    renderUserMessage(prompt);
    logTerminal("User Prompt: \"" + prompt.slice(0, 45) + "...\"", "ok");

    state.isSending = true;
    chatSubmitBtn.disabled = true;
    chatSubmitBtn.textContent = "Reasoning...";

    api("/api/godmode/chat", {
      method: "POST",
      body: { message: prompt }
    })
      .then(function (res) {
        renderAgentMessage(res);
        logTerminal("Agent response generated successfully.", "ok");
      })
      .catch(function (err) {
        renderAgentMessage({
          message: "⚠️ Could not connect to AI Engine: " + err.message + ". Please try again."
        });
        logTerminal("Agent error: " + err.message, "err");
      })
      .finally(function () {
        state.isSending = false;
        chatSubmitBtn.disabled = false;
        chatSubmitBtn.textContent = "Execute →";
      });
  }

  if (chatForm) {
    chatForm.addEventListener("submit", function (e) {
      e.preventDefault();
      sendUserMessage();
    });
  }

  // Quick Chips
  document.querySelectorAll(".quick-chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      sendUserMessage(chip.dataset.prompt);
    });
  });

  document.querySelectorAll(".agent-action-chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      if (chip.dataset.prompt) {
        sendUserMessage(chip.dataset.prompt);
      } else if (chip.dataset.issue) {
        createPlanFromIssue(chip.dataset.issue);
      }
    });
  });

  /* ---------- Audit & Health ---------- */

  function fetchAudit() {
    if (state.isAuditing) {
      logTerminal("Audit scan already running. Please wait...", "warn");
      return Promise.resolve();
    }
    state.isAuditing = true;
    var btnReAudit = document.getElementById("btnReAudit");
    if (btnReAudit) {
      btnReAudit.disabled = true;
      btnReAudit.textContent = "Scanning Website...";
    }

    logTerminal("Initiating comprehensive 5-pillar website audit...", "ok");
    return api("/api/godmode/analyze")
      .then(function (data) {
        state.auditData = data;
        renderAudit(data);
        var issueCount = (data.issues || []).length;
        var warnCount = (data.warnings || []).length;
        var passCount = (data.passedChecks || []).length;
        logTerminal("Audit completed. Health: " + data.overallScore + "/100 (" + issueCount + " issues, " + warnCount + " warnings, " + passCount + " passed)", "ok");
      })
      .catch(function (err) {
        logTerminal("Audit failed: " + err.message, "err");
      })
      .finally(function () {
        state.isAuditing = false;
        if (btnReAudit) {
          btnReAudit.disabled = false;
          btnReAudit.textContent = "⚡ Re-run Full Audit";
        }
      });
  }

  function renderAudit(data) {
    // Score Gauge
    var gauge = document.getElementById("auditScoreGauge");
    if (gauge) {
      gauge.textContent = data.overallScore;
      if (data.overallScore >= 80) gauge.style.borderColor = "var(--neon-emerald)";
      else if (data.overallScore >= 60) gauge.style.borderColor = "var(--neon-amber)";
      else gauge.style.borderColor = "var(--neon-ruby)";
    }

    var statusScore = document.getElementById("statusOverallScore");
    if (statusScore) statusScore.textContent = data.overallScore + "/100";

    // Environment Badge
    var envBadge = document.getElementById("auditEnvBadge");
    if (envBadge && data.environmentChecked) {
      var envType = data.environmentChecked.type || "Local Project Workspace";
      var prodUrl = data.environmentChecked.productionUrl || "";
      envBadge.textContent = envType + (data.environmentChecked.productionUrlConfigured ? " (" + prodUrl + ")" : "");
      envBadge.title = "Target path: " + (data.environmentChecked.path || "") + " | Production URL: " + prodUrl;
    }

    // Individual category scores
    var cats = data.categories || {};
    if (cats.seo && document.getElementById("scoreSeo")) {
      document.getElementById("scoreSeo").textContent = cats.seo.score + "%";
    }
    if (cats.performance && document.getElementById("scorePerf")) {
      document.getElementById("scorePerf").textContent = cats.performance.score + "%";
    }
    if (cats.ux && document.getElementById("scoreUx")) {
      document.getElementById("scoreUx").textContent = cats.ux.score + "%";
    }
    if (cats.security && document.getElementById("scoreSec")) {
      document.getElementById("scoreSec").textContent = cats.security.score + "%";
    }
    if (cats.business && document.getElementById("scoreBiz")) {
      document.getElementById("scoreBiz").textContent = cats.business.score + "%";
    }

    var tsText = document.getElementById("auditTimestampText");
    if (tsText) {
      var scanDuration = data.scanDurationMs ? " (took " + data.scanDurationMs + "ms)" : "";
      tsText.textContent = "Last scanned: " + new Date(data.timestamp).toLocaleTimeString() + scanDuration + " • Truthful disk inspection";
    }

    // 1. Issues list
    var issuesContainer = document.getElementById("issuesList");
    var issuesCountEl = document.getElementById("issuesCount");
    var issues = data.issues || [];
    if (issuesCountEl) issuesCountEl.textContent = issues.length;

    if (issuesContainer) {
      issuesContainer.innerHTML = "";
      if (!issues.length) {
        issuesContainer.innerHTML = `
          <div style="padding:20px; text-align:center; background:rgba(0, 245, 160, 0.05); border:1px dashed rgba(0, 245, 160, 0.3); border-radius:var(--radius-md); color:var(--neon-emerald);">
            🎉 <strong>Zero Critical Issues Detected!</strong> All primary website assets, markup, and accessibility checks passed on disk.
          </div>
        `;
      } else {
        issues.forEach(function (issue) {
          var card = document.createElement("div");
          card.className = "issue-card";

          var sevClass = "sev-low";
          if (issue.severity === "critical") sevClass = "sev-critical";
          else if (issue.severity === "high") sevClass = "sev-high";
          else if (issue.severity === "medium") sevClass = "sev-medium";

          card.innerHTML = `
            <div class="issue-main">
              <div class="issue-meta">
                <span class="severity-pill ${sevClass}">${issue.severity}</span>
                <span class="issue-file">${issue.targetFile || (issue.category ? issue.category.toUpperCase() : "GENERAL")}</span>
              </div>
              <div class="issue-title">${issue.title}</div>
              <div class="issue-desc">${issue.description}</div>
              ${issue.evidence ? `<div style="font-family:var(--font-mono); font-size:12px; color:var(--text-muted); margin-bottom:8px; background:rgba(0,0,0,0.3); padding:4px 8px; border-radius:4px;">🔍 Evidence: ${issue.evidence}</div>` : ""}
              <div class="issue-benefit">
                <span>✨ <strong>Benefit:</strong> ${issue.benefit}</span>
              </div>
            </div>
            <div>
              ${issue.autoFixable ? `
                <button type="button" class="gm-btn gm-btn-primary btn-autofix" data-issue="${issue.id}">
                  ⚡ 1-Click Fix
                </button>
              ` : `
                <span style="font-size:12px; color:var(--text-muted); font-family:var(--font-mono);">Manual Action</span>
              `}
            </div>
          `;

          var fixBtn = card.querySelector(".btn-autofix");
          if (fixBtn) {
            fixBtn.addEventListener("click", function () {
              createPlanFromIssue(issue.id);
            });
          }

          issuesContainer.appendChild(card);
        });
      }
    }

    // 2. Warnings list
    var warningsContainer = document.getElementById("warningsList");
    var warningsCountEl = document.getElementById("warningsCount");
    var warnings = data.warnings || [];
    if (warningsCountEl) warningsCountEl.textContent = warnings.length;

    if (warningsContainer) {
      warningsContainer.innerHTML = "";
      if (!warnings.length) {
        warningsContainer.innerHTML = "<p style='color:var(--text-muted); font-size:13px;'>No configuration warnings.</p>";
      } else {
        warnings.forEach(function (warn) {
          var card = document.createElement("div");
          card.className = "issue-card";
          card.style.borderColor = "rgba(255, 183, 3, 0.25)";

          card.innerHTML = `
            <div class="issue-main">
              <div class="issue-meta">
                <span class="severity-pill sev-warning">ADVISORY</span>
                <span class="issue-file">${(warn.category || "CONFIG").toUpperCase()}</span>
              </div>
              <div class="issue-title" style="color:var(--neon-amber);">${warn.title}</div>
              <div class="issue-desc">${warn.description}</div>
              ${warn.evidence ? `<div style="font-family:var(--font-mono); font-size:12px; color:var(--text-muted); margin-bottom:8px; background:rgba(0,0,0,0.3); padding:4px 8px; border-radius:4px;">ℹ️ Detail: ${warn.evidence}</div>` : ""}
              <div class="issue-benefit" style="color:var(--text-muted);">
                <span>💡 <strong>Recommendation:</strong> ${warn.benefit}</span>
              </div>
            </div>
            <div>
              <span class="severity-pill sev-low">Config Required</span>
            </div>
          `;
          warningsContainer.appendChild(card);
        });
      }
    }

    // 3. Passed Checks list
    var passedContainer = document.getElementById("passedChecksList");
    var passedCountEl = document.getElementById("passedCount");
    var passedChecks = data.passedChecks || [];
    if (passedCountEl) passedCountEl.textContent = passedChecks.length;

    if (passedContainer) {
      passedContainer.innerHTML = "";
      if (!passedChecks.length) {
        passedContainer.innerHTML = "<p style='color:var(--text-muted); font-size:13px;'>No passed checks recorded.</p>";
      } else {
        passedChecks.forEach(function (check) {
          var card = document.createElement("div");
          card.className = "issue-card";
          card.style.padding = "14px 18px";
          card.style.background = "rgba(10, 15, 26, 0.5)";

          card.innerHTML = `
            <div class="issue-main">
              <div class="issue-meta">
                <span class="severity-pill sev-passed">✓ PASSED</span>
                <span class="issue-file">${(check.category || "AUDIT").toUpperCase()}</span>
              </div>
              <div class="issue-title" style="font-size:14px; margin-bottom:4px;">${check.title}</div>
              <div class="issue-desc" style="font-size:13px; margin-bottom:4px;">${check.description}</div>
              ${check.evidence ? `<div style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted);"><strong>Verified:</strong> ${check.evidence}</div>` : ""}
            </div>
          `;
          passedContainer.appendChild(card);
        });
      }
    }
  }

  var btnReAudit = document.getElementById("btnReAudit");
  if (btnReAudit) btnReAudit.addEventListener("click", fetchAudit);

  var btnRunAuditQuick = document.getElementById("btnRunAuditQuick");
  if (btnRunAuditQuick) {
    btnRunAuditQuick.addEventListener("click", function () {
      switchView("audit");
      fetchAudit();
    });
  }

  /* ---------- Execution Hub & Plans ---------- */

  function setProposedPlan(plan) {
    state.currentPlan = plan;

    var titleEl = document.getElementById("planTitleText");
    var goalEl = document.getElementById("planGoalText");
    var riskBadge = document.getElementById("planRiskBadge");
    var diffLinesEl = document.getElementById("diffLines");
    var diffTargetEl = document.getElementById("diffTargetFile");
    var diffCountEl = document.getElementById("diffLineCount");
    var applyBtn = document.getElementById("btnApproveApply");
    var rejectBtn = document.getElementById("btnRejectPlan");

    if (titleEl) titleEl.textContent = plan.title;
    if (goalEl) goalEl.textContent = plan.goal;
    if (riskBadge) {
      riskBadge.textContent = plan.riskLevel + " Risk";
      riskBadge.className = "severity-pill " + (plan.riskLevel === "High" ? "sev-critical" : "sev-medium");
    }

    if (applyBtn) {
      applyBtn.disabled = false;
      applyBtn.onclick = function () { applyPlan(plan.id); };
    }
    if (rejectBtn) {
      rejectBtn.disabled = false;
      rejectBtn.onclick = function () {
        clearPlan();
        logTerminal("Plan rejected by user.", "warn");
      };
    }

    // Render Diff
    if (diffLinesEl) {
      diffLinesEl.innerHTML = "";
      var allDiffs = [];
      (plan.files || []).forEach(function (f) {
        if (f.diff && f.diff.lines) {
          allDiffs = allDiffs.concat(f.diff.lines);
        }
      });

      if (diffTargetEl) {
        var fileNames = (plan.files || []).map(function (f) { return f.path; }).join(", ");
        diffTargetEl.textContent = fileNames || "Modified Files";
      }

      if (diffCountEl) {
        diffCountEl.textContent = allDiffs.length + " line changes";
      }

      if (!allDiffs.length) {
        diffLinesEl.innerHTML = "<div class='diff-line same'>No differences found or file is identical.</div>";
      } else {
        allDiffs.forEach(function (lineObj) {
          var lineDiv = document.createElement("div");
          lineDiv.className = "diff-line " + lineObj.type;
          lineDiv.textContent = (lineObj.type === "add" ? "+ " : lineObj.type === "del" ? "- " : "  ") + lineObj.line;
          diffLinesEl.appendChild(lineDiv);
        });
      }
    }
  }

  function clearPlan() {
    state.currentPlan = null;
    var titleEl = document.getElementById("planTitleText");
    var goalEl = document.getElementById("planGoalText");
    var diffLinesEl = document.getElementById("diffLines");
    var applyBtn = document.getElementById("btnApproveApply");
    var rejectBtn = document.getElementById("btnRejectPlan");

    if (titleEl) titleEl.textContent = "No Active Plan";
    if (goalEl) goalEl.textContent = "Select an optimization or ask the Agent to generate a plan.";
    if (diffLinesEl) {
      diffLinesEl.innerHTML = "<div class='diff-line same' style='padding:20px; text-align:center;'>No pending diff.</div>";
    }
    if (applyBtn) applyBtn.disabled = true;
    if (rejectBtn) rejectBtn.disabled = true;
  }

  function createPlanFromIssue(issueId) {
    logTerminal("Generating execution plan for issue: " + issueId, "ok");
    api("/api/godmode/propose", {
      method: "POST",
      body: { issueId: issueId }
    })
      .then(function (res) {
        setProposedPlan(res.plan);
        switchView("execute");
        logTerminal("Plan " + res.plan.id + " generated with unified diff.", "ok");
      })
      .catch(function (err) {
        logTerminal("Could not create plan: " + err.message, "err");
        alert("Error creating plan: " + err.message);
      });
  }

  function applyPlan(planId) {
    if (!planId) return;
    logTerminal("Executing plan: " + planId + " (creating backup and verifying)...", "ok");

    var applyBtn = document.getElementById("btnApproveApply");
    if (applyBtn) {
      applyBtn.disabled = true;
      applyBtn.textContent = "Applying & Verifying...";
    }

    api("/api/godmode/apply", {
      method: "POST",
      body: { planId: planId }
    })
      .then(function (res) {
        logTerminal("SUCCESS: " + res.message, "ok");
        logTerminal("Backup created at: " + res.backupId, "ok");

        renderAgentMessage({
          message: "✅ **Plan Successfully Applied!**\n\n" + res.message + "\n\nA full backup snapshot was saved (`" + res.backupId + "`). The live website has been updated and verified.",
          actions: [
            { label: "🌐 Preview Live Site", action: "chat_prompt", prompt: "Show live preview" },
            { label: "🔍 Re-scan Website", action: "chat_prompt", prompt: "Run full website audit" }
          ]
        });

        // Refresh preview iframe
        if (previewIframe) {
          previewIframe.src = "/?refresh=" + Date.now();
        }

        // Refresh history and audit
        fetchHistory();
        fetchAudit();
        clearPlan();
      })
      .catch(function (err) {
        logTerminal("Execution Error: " + err.message, "err");
        alert("Error applying plan: " + err.message);
      })
      .finally(function () {
        if (applyBtn) {
          applyBtn.disabled = false;
          applyBtn.textContent = "🚀 Approve & Apply Changes";
        }
      });
  }

  function fetchHistory() {
    api("/api/godmode/history")
      .then(function (res) {
        state.historyData = res.history || [];
        renderHistory(state.historyData);

        var statusBackup = document.getElementById("statusBackupCount");
        if (statusBackup) statusBackup.textContent = state.historyData.length + " Available";
      })
      .catch(function () {});
  }

  function renderHistory(list) {
    var container = document.getElementById("executionHistoryList");
    if (!container) return;

    if (!list.length) {
      container.innerHTML = "<p style='color:var(--text-muted); font-size:13px;'>No past executions yet.</p>";
      return;
    }

    container.innerHTML = "";
    list.forEach(function (item) {
      var row = document.createElement("div");
      row.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:13px;";

      var isRollback = item.id.startsWith("rollback_");
      var statusBadge = item.status === "verified"
        ? `<span class="severity-pill sev-verified" style="margin-left:8px;">✓ VERIFIED</span>`
        : `<span class="severity-pill sev-medium" style="margin-left:8px;">APPLIED</span>`;

      row.innerHTML = `
        <div style="flex:1; margin-right:16px;">
          <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
            <strong style="color:#fff;">${item.title}</strong>
            ${statusBadge}
          </div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
            Applied: ${new Date(item.appliedAt).toLocaleString()} | Files: ${(item.filesTouched || []).join(", ")}
          </div>
          ${item.verificationDetail ? `<div style="font-size:11px; color:var(--neon-emerald); font-family:var(--font-mono); margin-top:3px;">🛡️ ${item.verificationDetail}</div>` : ""}
        </div>
        <div>
          ${!isRollback && item.backupId ? `<button type="button" class="gm-btn gm-btn-danger btn-rollback" data-backup="${item.backupId}">🔄 1-Click Rollback</button>` : `<span style="color:var(--neon-cyan); font-size:12px;">Rollback Snapshot</span>`}
        </div>
      `;

      var rollBtn = row.querySelector(".btn-rollback");
      if (rollBtn) {
        rollBtn.addEventListener("click", function () {
          if (confirm("Restore website to previous snapshot (" + item.backupId + ")?")) {
            rollback(item.backupId);
          }
        });
      }

      container.appendChild(row);
    });
  }

  function rollback(backupId) {
    logTerminal("Rolling back to snapshot: " + backupId + "...", "warn");
    api("/api/godmode/rollback", {
      method: "POST",
      body: { backupId: backupId }
    })
      .then(function (res) {
        logTerminal("Rollback completed successfully: " + res.message, "ok");
        if (previewIframe) previewIframe.src = "/?refresh=" + Date.now();
        fetchHistory();
        fetchAudit();
        alert("Rollback Successful! Files have been restored to their exact previous state.");
      })
      .catch(function (err) {
        logTerminal("Rollback error: " + err.message, "err");
        alert("Rollback error: " + err.message);
      });
  }

  /* ---------- Proactive Recommendations ---------- */

  function fetchRecommendations() {
    api("/api/godmode/recommendations")
      .then(function (res) {
        renderRecommendations(res.recommendations || []);
      })
      .catch(function (err) {
        logTerminal("Could not fetch recommendations: " + err.message, "err");
      });
  }

  function renderRecommendations(recs) {
    var container = document.getElementById("proactiveRecsGrid");
    if (!container) return;

    container.innerHTML = "";
    recs.forEach(function (rec) {
      var card = document.createElement("div");
      card.className = "rec-card";

      card.innerHTML = `
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span class="severity-pill sev-medium">${rec.category}</span>
            <span style="font-family:var(--font-mono); font-size:11px; color:var(--neon-emerald);">${rec.roi}</span>
          </div>
          <h3 style="font-size:18px; font-weight:600; color:#fff; margin-bottom:8px;">${rec.title}</h3>
          <p style="font-size:14px; color:var(--text-muted); line-height:1.5; margin-bottom:12px;">${rec.description}</p>
          <div style="font-size:13px; color:var(--neon-cyan); margin-bottom:16px;">
            📈 <strong>Impact:</strong> ${rec.impact}
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.06); padding-top:14px;">
          <span style="font-size:12px; color:var(--text-dim);">${rec.effort}</span>
          <button type="button" class="gm-btn gm-btn-primary btn-rec-apply" data-action="${rec.actionId}">
            ⚡ Implement with GODMODE
          </button>
        </div>
      `;

      card.querySelector(".btn-rec-apply").addEventListener("click", function () {
        createPlanFromIssue(rec.actionId);
      });

      container.appendChild(card);
    });
  }

  /* ---------- File Explorer ---------- */

  function fetchFiles() {
    api("/api/godmode/files")
      .then(function (res) {
        state.filesData = res.files || [];
        renderFiles(state.filesData);
      })
      .catch(function (err) {
        logTerminal("Could not list files: " + err.message, "err");
      });
  }

  function renderFiles(files) {
    var listEl = document.getElementById("fileTreeList");
    if (!listEl) return;

    listEl.innerHTML = "";
    files.forEach(function (file) {
      var item = document.createElement("div");
      item.style.cssText = "padding:6px 10px; border-radius:4px; cursor:pointer; display:flex; justify-content:space-between; color:#a0b0c8;";

      item.innerHTML = `
        <span>📄 ${file.path}</span>
        <span style="font-size:11px; color:var(--text-dim);">${Math.round(file.size / 1024)} KB</span>
      `;

      item.addEventListener("mouseenter", function () { item.style.background = "rgba(255,255,255,0.05)"; });
      item.addEventListener("mouseleave", function () { item.style.background = "transparent"; });

      item.addEventListener("click", function () {
        loadFileContent(file.path);
      });

      listEl.appendChild(item);
    });
  }

  function loadFileContent(filePath) {
    var pathLabel = document.getElementById("fileViewerPath");
    var sizeLabel = document.getElementById("fileViewerSize");
    var contentEl = document.getElementById("fileViewerContent");

    if (pathLabel) pathLabel.textContent = "Loading: " + filePath;

    api("/api/godmode/file?path=" + encodeURIComponent(filePath))
      .then(function (res) {
        if (pathLabel) pathLabel.textContent = res.path;
        if (sizeLabel) sizeLabel.textContent = res.size + " bytes";
        if (contentEl) contentEl.textContent = res.content;
        logTerminal("Loaded file: " + filePath, "ok");
      })
      .catch(function (err) {
        if (contentEl) contentEl.textContent = "Error reading file: " + err.message;
      });
  }

  /* ---------- Live Preview Controller ---------- */

  var btnViewDesktop = document.getElementById("btnViewDesktop");
  var btnViewTablet = document.getElementById("btnViewTablet");
  var btnViewMobile = document.getElementById("btnViewMobile");
  var btnRefreshPreview = document.getElementById("btnRefreshPreview");

  if (btnViewDesktop && previewIframe) {
    btnViewDesktop.addEventListener("click", function () {
      previewIframe.className = "preview-iframe device-desktop";
    });
  }
  if (btnViewTablet && previewIframe) {
    btnViewTablet.addEventListener("click", function () {
      previewIframe.className = "preview-iframe device-tablet";
    });
  }
  if (btnViewMobile && previewIframe) {
    btnViewMobile.addEventListener("click", function () {
      previewIframe.className = "preview-iframe device-mobile";
    });
  }
  if (btnRefreshPreview && previewIframe) {
    btnRefreshPreview.addEventListener("click", function () {
      previewIframe.src = "/?refresh=" + Date.now();
      logTerminal("Live Preview reloaded.", "ok");
    });
  }

  /* ---------- Settings Modal ---------- */

  var settingsModal = document.getElementById("settingsModal");
  var btnOpenSettings = document.getElementById("btnOpenSettings");
  var btnCloseSettings = document.getElementById("btnCloseSettings");
  var btnCancelSettings = document.getElementById("btnCancelSettings");
  var btnSaveSettings = document.getElementById("btnSaveSettings");
  var inputApiKey = document.getElementById("inputApiKey");

  function openSettings() {
    if (settingsModal) settingsModal.classList.add("open");
  }

  function closeSettings() {
    if (settingsModal) settingsModal.classList.remove("open");
  }

  if (btnOpenSettings) btnOpenSettings.addEventListener("click", openSettings);
  if (btnCloseSettings) btnCloseSettings.addEventListener("click", closeSettings);
  if (btnCancelSettings) btnCancelSettings.addEventListener("click", closeSettings);

  if (btnSaveSettings) {
    btnSaveSettings.addEventListener("click", function () {
      var key = inputApiKey.value.trim();
      api("/api/godmode/config", {
        method: "POST",
        body: { apiKey: key }
      })
        .then(function (res) {
          logTerminal("Configuration updated.", "ok");
          var providerEl = document.getElementById("statusProvider");
          if (providerEl) {
            providerEl.textContent = res.hasCustomKey ? "Google Gemini (Active)" : "Local Heuristic (Autonomous)";
          }
          closeSettings();
        })
        .catch(function (err) {
          alert("Config error: " + err.message);
        });
    });
  }

  /* ---------- Initial Boot ---------- */

  logTerminal("Connecting to /api/godmode/status...", "ok");
  api("/api/godmode/status")
    .then(function (st) {
      logTerminal("Connected to " + st.agent + " (" + st.aiProvider + ")", "ok");
      var prov = document.getElementById("statusProvider");
      if (prov) prov.textContent = st.aiProvider;
      fetchAudit();
      fetchHistory();
    })
    .catch(function (err) {
      logTerminal("Warning: Status check: " + err.message, "warn");
    });

})();

