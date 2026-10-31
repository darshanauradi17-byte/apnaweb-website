"use strict";

const { analyzeWebsite } = require("./analyzer");

/**
 * GODMODE Conversational AI Engine
 * Handles natural conversation, goal deconstruction, task planning,
 * and code modification proposals with dynamic real audit findings.
 */
class GodmodeAIEngine {
  constructor(executor, baseDir) {
    this.executor = executor;
    this.baseDir = baseDir;
    this.history = [];
    this.apiKey = process.env.GEMINI_API_KEY || "";
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  getApiKey() {
    return this.apiKey ? "********" + this.apiKey.slice(-4) : "";
  }

  /**
   * Main conversational dispatch
   */
  async chat(userMessage, activeContext = {}) {
    const trimmed = (userMessage || "").trim();
    if (!trimmed) {
      return {
        message: "I am ready. Tell me what you would like to analyze, build, or optimize on your website.",
        actions: []
      };
    }

    this.history.push({ role: "user", content: trimmed, timestamp: new Date().toISOString() });

    // Cloud Gemini API if configured
    if (this.apiKey) {
      try {
        const cloudResponse = await this.queryGemini(trimmed, activeContext);
        if (cloudResponse) {
          this.history.push({ role: "assistant", content: cloudResponse.message, timestamp: new Date().toISOString() });
          return cloudResponse;
        }
      } catch (err) {
        console.warn("Gemini API call failed, falling back to Local Autonomous Engine:", err.message);
      }
    }

    // Local Autonomous Reasoning Engine
    const response = await this.localHeuristicReasoning(trimmed, activeContext);
    this.history.push({ role: "assistant", content: response.message, timestamp: new Date().toISOString() });
    return response;
  }

  /**
   * Local Autonomous Reasoning Engine
   * Interprets commands, performs real-time file lookups, constructs plans,
   * and provides truthful, dynamic website feedback.
   */
  async localHeuristicReasoning(message, activeContext) {
    const lower = message.toLowerCase();
    const audit = analyzeWebsite(this.baseDir);

    // 1. Audit / Analysis Request
    if (
      lower.includes("audit") ||
      lower.includes("scan") ||
      lower.includes("analyze") ||
      lower.includes("check website") ||
      lower.includes("what is wrong") ||
      lower.includes("health")
    ) {
      let issuesText = "";
      if (audit.issues.length === 0) {
        issuesText = "🎉 **All automated checks passed!** No unresolved critical or high priority issues detected on the website.";
      } else {
        issuesText = "#### ⚠️ Unresolved Optimization Issues:\n" +
          audit.issues.map((issue, idx) => {
            return `${idx + 1}. **[${issue.severity.toUpperCase()}] ${issue.title}:** ${issue.description}\n   *Expected Benefit:* ${issue.benefit}`;
          }).join("\n");
      }

      let warningsText = "";
      if (audit.warnings && audit.warnings.length > 0) {
        warningsText = "\n\n#### ℹ️ Configuration Notes & Warnings:\n" +
          audit.warnings.map((w) => `* **${w.title}:** ${w.description}`).join("\n");
      }

      // Generate dynamic actions ONLY for unresolved issues
      const dynamicActions = [];
      audit.issues.forEach((issue) => {
        let actionId = null;
        if (issue.id === "check-service-images") actionId = "fix-missing-images";
        else if (issue.id === "check-schema-jsonld") actionId = "seo-schema-jsonld";
        else if (issue.id === "check-whatsapp-btn") actionId = "biz-whatsapp-quickaction";
        else if (issue.id === "check-canonical-url") actionId = "seo-canonical-tag";
        else if (issue.id === "check-price-estimator") actionId = "biz-price-estimator";
        else if (issue.id === "check-social-metadata") actionId = "seo-og-image";
        else if (issue.id === "check-sitemap-xml") actionId = "seo-sitemap-xml";
        else if (issue.id === "check-security-csp") actionId = "sec-csp-header";
        else if (issue.id === "check-faq-accordion") actionId = "ux-faq-accordion";

        if (actionId) {
          dynamicActions.push({
            label: `⚡ Fix: ${issue.title}`,
            action: "create_plan",
            issueId: actionId
          });
        }
      });

      return {
        message: `### 🔍 Live Website Intelligence Audit Complete

I performed a fresh, real-time inspection of your project codebase across 5 core pillars:

* **Overall Website Health:** **${audit.overallScore}/100**
* **SEO & Discoverability:** **${audit.categories.seo.score}/100** (${audit.categories.seo.passedCount}/${audit.categories.seo.checksCount} checks passed)
* **Speed & Assets:** **${audit.categories.performance.score}/100** (${audit.categories.performance.passedCount}/${audit.categories.performance.checksCount} checks passed)
* **UX & Accessibility:** **${audit.categories.ux.score}/100** (${audit.categories.ux.passedCount}/${audit.categories.ux.checksCount} checks passed)
* **Security & Headers:** **${audit.categories.security.score}/100** (${audit.categories.security.passedCount}/${audit.categories.security.checksCount} checks passed)
* **Conversion & Growth:** **${audit.categories.business.score}/100** (${audit.categories.business.passedCount}/${audit.categories.business.checksCount} checks passed)

${issuesText}${warningsText}`,
        plan: null,
        actions: dynamicActions,
        auditSummary: audit
      };
    }

    // 2. Fix Broken Images
    if (
      lower.includes("image") ||
      lower.includes("broken") ||
      lower.includes("picture") ||
      lower.includes("photo")
    ) {
      const isBroken = audit.issues.some((i) => i.id === "check-service-images");
      if (!isBroken) {
        return {
          message: `### ✅ Service Card Images Already Verified

All 6 business service card images on \`public/index.html\` exist on disk with valid dimensions and non-zero file sizes:
* \`business website.jpg\`
* \`restaurant website.jpg\`
* \`shop website.jpg\`
* \`medical website.jpg\`
* \`education website.jpg\`
* \`real estate website.jpg\`

No broken image errors were found. No modification is required.`,
          plan: null,
          actions: [
            { label: "🔍 Run Full Audit", action: "chat_prompt", prompt: "Run full website audit" }
          ]
        };
      }

      const plan = this.executor.createPlan({ issueId: "fix-missing-images" });
      return {
        message: `### 🛠️ Execution Plan: Fix Service Card Images\n\nI have generated an execution plan to correct service card image paths.`,
        plan: plan,
        actions: [
          { label: "🚀 Approve & Apply Changes", action: "apply_plan", planId: plan.id },
          { label: "❌ Dismiss Plan", action: "reject_plan", planId: plan.id }
        ]
      };
    }

    // 3. WhatsApp / Quick Connect
    if (
      lower.includes("whatsapp") ||
      lower.includes("floating") ||
      lower.includes("call button") ||
      lower.includes("quick connect")
    ) {
      const isMissing = audit.issues.some((i) => i.id === "check-whatsapp-btn");
      if (!isMissing) {
        return {
          message: `### ✅ Floating WhatsApp Widget Already Active

The floating WhatsApp quick-action widget is already active and verified in \`public/index.html\` and \`public/css/site.css\`:
* **Destination Number:** \`+91 93804 00181\` (verified against project contact info)
* **URL:** \`https://wa.me/919380400181?text=Hi%2C%20I%20am%20interested%20in%20a%20website%20for%20my%20business.\`
* **Accessibility:** Accessible \`aria-label="Chat on WhatsApp"\` and keyboard-focusable.

No redundant modification is required.`,
          plan: null,
          actions: [
            { label: "🔍 Run Full Audit", action: "chat_prompt", prompt: "Run full website audit" }
          ]
        };
      }

      const plan = this.executor.createPlan({ issueId: "biz-whatsapp-quickaction" });
      return {
        message: `### 📱 Execution Plan: Floating WhatsApp Quick-Connect\n\nI have prepared an execution plan to embed the floating WhatsApp button.`,
        plan: plan,
        actions: [
          { label: "🚀 Approve & Apply Changes", action: "apply_plan", planId: plan.id },
          { label: "❌ Dismiss Plan", action: "reject_plan", planId: plan.id }
        ]
      };
    }

    // 4. Price Estimator / Calculator
    if (
      lower.includes("price") ||
      lower.includes("calculator") ||
      lower.includes("estimator") ||
      lower.includes("cost") ||
      lower.includes("quote")
    ) {
      const isMissing = audit.issues.some((i) => i.id === "check-price-estimator");
      if (!isMissing) {
        return {
          message: `### ✅ Price Estimator Already Implemented

The interactive Scope & Price Estimator is already present in \`public/index.html\` with live calculations and connection to the request form.`,
          plan: null,
          actions: [
            { label: "🔍 Run Full Audit", action: "chat_prompt", prompt: "Run full website audit" }
          ]
        };
      }

      const plan = this.executor.createPlan({ issueId: "biz-price-estimator" });
      return {
        message: `### 💰 Execution Plan: Interactive Scope & Price Estimator

I have designed a responsive, 3-step Price Estimator for \`public/index.html\`:
1. **Business Category:** Shop, Clinic, Restaurant, Business, Other.
2. **Feature Add-ons:** Product catalog, WhatsApp ordering, Google Maps, Custom domain setup.
3. **Transparent Calculations:** Clearly displays that totals are indicative estimates to help budget planning.
4. **Form Integration:** "Select in Request Form" automatically selects the budget range and pre-populates requirements!`,
        plan: plan,
        actions: [
          { label: "🚀 Approve & Apply Changes", action: "apply_plan", planId: plan.id },
          { label: "❌ Dismiss Plan", action: "reject_plan", planId: plan.id }
        ]
      };
    }

    // 5. SEO / Schema / Meta Tags
    if (
      lower.includes("seo") ||
      lower.includes("schema") ||
      lower.includes("google") ||
      lower.includes("json-ld") ||
      lower.includes("ranking") ||
      lower.includes("metadata")
    ) {
      const isMissing = audit.issues.some((i) => i.id === "check-schema-jsonld");
      if (!isMissing) {
        return {
          message: `### ✅ Schema.org Structured Data Already Active

Valid Schema.org JSON-LD structured data is already embedded in \`public/index.html\` with verified business details (BrandX Web, Darshan Auradi, +91 93804 00181).`,
          plan: null,
          actions: [
            { label: "🔍 Run Full Audit", action: "chat_prompt", prompt: "Run full website audit" }
          ]
        };
      }

      const plan = this.executor.createPlan({ issueId: "seo-schema-jsonld" });
      return {
        message: `### 🔍 Execution Plan: LocalBusiness JSON-LD Schema

I have prepared structured data adhering strictly to Schema.org standards using ONLY verified project facts (no invented physical addresses or fake ratings).`,
        plan: plan,
        actions: [
          { label: "🚀 Approve & Apply Changes", action: "apply_plan", planId: plan.id },
          { label: "❌ Dismiss Plan", action: "reject_plan", planId: plan.id }
        ]
      };
    }

    // Default intelligent conversational guidance
    const pendingFixActions = [];
    audit.issues.slice(0, 4).forEach((issue) => {
      let actionId = null;
      if (issue.id === "check-schema-jsonld") actionId = "seo-schema-jsonld";
      else if (issue.id === "check-price-estimator") actionId = "biz-price-estimator";
      else if (issue.id === "check-social-metadata") actionId = "seo-og-image";
      else if (issue.id === "check-sitemap-xml") actionId = "seo-sitemap-xml";
      else if (issue.id === "check-security-csp") actionId = "sec-csp-header";
      if (actionId) {
        pendingFixActions.push({
          label: `⚡ Fix: ${issue.title}`,
          action: "create_plan",
          issueId: actionId
        });
      }
    });

    return {
      message: `I analyzed your request: **"${message}"**.

Current Website Health is **${audit.overallScore}/100** with **${audit.stats.passed}** passed checks and **${audit.stats.failed}** unresolved issues.

What would you like me to execute?`,
      actions: pendingFixActions.length ? pendingFixActions : [
        { label: "🔍 Run Full Website Audit", action: "chat_prompt", prompt: "Run full website audit" }
      ]
    };
  }

  /**
   * Optional Gemini API integration via global fetch
   */
  async queryGemini(userPrompt, activeContext) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`;

    const systemInstruction = `You are GODMODE AI, an autonomous website intelligence partner for BrandX Web (a web design service for local shops, clinics, restaurants in India).
You communicate professionally, proactively, and actionably. You have full access to inspect files, propose code changes, run audits, and create execution plans.
When suggesting changes, explain the business benefit and outline the exact steps.`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemInstruction}\n\nUser instruction: ${userPrompt}` }]
        }
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1500
      }
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      throw new Error(`Gemini HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const candidate = data.candidates && data.candidates[0];
    const text = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0].text;

    if (!text) {
      throw new Error("Empty response from Gemini");
    }

    return {
      message: text,
      actions: [
        { label: "🔍 Run Audit", action: "chat_prompt", prompt: "Run full website audit" }
      ]
    };
  }
}

module.exports = {
  GodmodeAIEngine
};
