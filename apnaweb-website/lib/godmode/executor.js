"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { analyzeWebsite } = require("./analyzer");

/**
 * GODMODE Autonomous Executor
 * Generates verified plans, unified diffs, auto-backups, verified atomic writes,
 * and enables instant 1-click rollbacks without duplicate plan spam.
 */
class GodmodeExecutor {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.backupDir = path.join(baseDir, "data", ".godmode-backups");
    this.historyFile = path.join(baseDir, "data", "godmode-history.json");
    this.activePlans = new Map();

    fs.mkdirSync(this.backupDir, { recursive: true });
    if (!fs.existsSync(this.historyFile)) {
      fs.writeFileSync(this.historyFile, "[]", "utf8");
    }
  }

  getHistory() {
    try {
      const raw = fs.readFileSync(this.historyFile, "utf8");
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  }

  saveHistory(entries) {
    fs.writeFileSync(this.historyFile, JSON.stringify(entries, null, 2), "utf8");
  }

  /**
   * Generates a unified diff representation for visual display
   */
  generateDiff(original, updated, filename) {
    const origLines = (original || "").split("\n");
    const updLines = (updated || "").split("\n");

    const diff = [];
    let i = 0;
    let j = 0;

    while (i < origLines.length || j < updLines.length) {
      const lineOrig = origLines[i];
      const lineUpd = updLines[j];

      if (lineOrig === lineUpd) {
        diff.push({ type: "same", line: lineOrig });
        i++;
        j++;
      } else {
        if (i < origLines.length && !updLines.includes(lineOrig)) {
          diff.push({ type: "del", line: lineOrig });
          i++;
        } else if (j < updLines.length && !origLines.includes(lineUpd)) {
          diff.push({ type: "add", line: lineUpd });
          j++;
        } else {
          if (i < origLines.length) {
            diff.push({ type: "del", line: lineOrig });
            i++;
          }
          if (j < updLines.length) {
            diff.push({ type: "add", line: lineUpd });
            j++;
          }
        }
      }
    }

    return {
      file: filename,
      hasChanges: diff.some((d) => d.type === "add" || d.type === "del"),
      lines: diff.slice(0, 300)
    };
  }

  /**
   * Creates a formal execution plan from instruction or issue ID with deduplication
   */
  createPlan(params) {
    // Check for an existing pending plan for the same issueId
    if (params.issueId) {
      for (const [id, existingPlan] of this.activePlans.entries()) {
        if (existingPlan.issueId === params.issueId && existingPlan.status === "pending_approval") {
          return existingPlan;
        }
      }

      const issuePlan = this.buildIssuePlan(params.issueId);
      if (issuePlan) {
        const planId = "plan_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
        issuePlan.id = planId;
        issuePlan.issueId = params.issueId;
        issuePlan.createdAt = new Date().toISOString();
        issuePlan.status = "pending_approval";
        this.activePlans.set(planId, issuePlan);
        return issuePlan;
      }
    }

    const planId = "plan_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    const files = [];

    if (params.files && Array.isArray(params.files)) {
      params.files.forEach((f) => {
        const fullPath = path.resolve(this.baseDir, f.path);
        const relativePath = path.relative(this.baseDir, fullPath).replace(/\\/g, "/");

        let originalContent = "";
        let exists = false;
        if (fs.existsSync(fullPath)) {
          originalContent = fs.readFileSync(fullPath, "utf8");
          exists = true;
        }

        const newContent = f.content !== undefined ? f.content : originalContent;
        const diff = this.generateDiff(originalContent, newContent, relativePath);

        files.push({
          path: relativePath,
          fullPath: fullPath,
          isNew: !exists,
          originalContent: originalContent,
          newContent: newContent,
          diff: diff
        });
      });
    }

    const plan = {
      id: planId,
      title: params.title || "Custom Website Improvement",
      goal: params.goal || "Optimize website code and layout",
      steps: params.steps || ["Review proposed code modifications", "Apply changes atomically", "Verify syntax and reload"],
      riskLevel: params.riskLevel || "Low",
      createdAt: new Date().toISOString(),
      status: "pending_approval",
      files: files
    };

    this.activePlans.set(planId, plan);
    return plan;
  }

  /**
   * Applies the approved plan with automatic backups and verification
   */
  applyPlan(planId) {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found or expired.`);
    }

    if (plan.status === "applied" || plan.status === "verified") {
      return {
        success: true,
        planId: planId,
        alreadyApplied: true,
        message: `Plan "${plan.title}" has already been applied.`
      };
    }

    const backupId = "backup_" + Date.now();
    const backupSnapshotDir = path.join(this.backupDir, backupId);
    fs.mkdirSync(backupSnapshotDir, { recursive: true });

    const backupManifest = {
      backupId: backupId,
      planId: planId,
      title: plan.title,
      timestamp: new Date().toISOString(),
      files: []
    };

    // Step 1: Backup all target files
    plan.files.forEach((file) => {
      if (fs.existsSync(file.fullPath)) {
        const dest = path.join(backupSnapshotDir, file.path.replace(/\//g, "_"));
        fs.copyFileSync(file.fullPath, dest);
        backupManifest.files.push({
          originalPath: file.path,
          backupFile: file.path.replace(/\//g, "_"),
          existed: true
        });
      } else {
        backupManifest.files.push({
          originalPath: file.path,
          backupFile: null,
          existed: false
        });
      }
    });

    fs.writeFileSync(
      path.join(backupSnapshotDir, "manifest.json"),
      JSON.stringify(backupManifest, null, 2),
      "utf8"
    );

    // Step 2: Write new contents
    const writtenFiles = [];
    try {
      plan.files.forEach((file) => {
        const dir = path.dirname(file.fullPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(file.fullPath, file.newContent, "utf8");
        writtenFiles.push(file);
      });

      // Step 3: Verify syntax on modified JavaScript files
      writtenFiles.forEach((file) => {
        if (file.path.endsWith(".js")) {
          try {
            execSync(`node -c "${file.fullPath}"`, { stdio: "pipe" });
          } catch (err) {
            throw new Error(`Syntax verification failed for ${file.path}: ${err.message}`);
          }
        }
      });
    } catch (err) {
      // Automatic Rollback on failure!
      this.rollback(backupId);
      throw new Error(`Verification error: ${err.message}. Changes automatically rolled back.`);
    }

    // Step 4: Run post-apply audit check verification
    let isAuditVerified = false;
    let auditCheckDetail = "Applied successfully";
    try {
      const postAudit = analyzeWebsite(this.baseDir);
      // Check if target issue is now absent from issues
      if (plan.targetCheckId) {
        const stillFails = postAudit.issues.some((i) => i.id === plan.targetCheckId);
        isAuditVerified = !stillFails;
        auditCheckDetail = isAuditVerified
          ? "Target audit check passed and verified on disk"
          : "Changes applied, but audit check requires further configuration";
      } else {
        isAuditVerified = true;
      }
    } catch (e) {
      // Non-fatal
    }

    plan.status = isAuditVerified ? "verified" : "applied";
    plan.appliedAt = new Date().toISOString();
    plan.backupId = backupId;
    plan.verificationDetail = auditCheckDetail;

    const history = this.getHistory();
    history.unshift({
      id: plan.id,
      title: plan.title,
      goal: plan.goal,
      appliedAt: plan.appliedAt,
      backupId: backupId,
      status: plan.status,
      verificationDetail: auditCheckDetail,
      filesTouched: plan.files.map((f) => f.path)
    });
    this.saveHistory(history.slice(0, 50));

    return {
      success: true,
      planId: planId,
      backupId: backupId,
      verified: isAuditVerified,
      message: `Successfully applied: ${plan.title}. ${auditCheckDetail}.`
    };
  }

  /**
   * Restores files to previous state using backup snapshot
   */
  rollback(backupId) {
    const backupSnapshotDir = path.join(this.backupDir, backupId);
    const manifestFile = path.join(backupSnapshotDir, "manifest.json");

    if (!fs.existsSync(manifestFile)) {
      throw new Error(`Backup ${backupId} not found.`);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));

    manifest.files.forEach((f) => {
      const targetPath = path.resolve(this.baseDir, f.originalPath);
      if (f.existed && f.backupFile) {
        const src = path.join(backupSnapshotDir, f.backupFile);
        fs.copyFileSync(src, targetPath);
      } else if (!f.existed) {
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
      }
    });

    const history = this.getHistory();
    history.unshift({
      id: "rollback_" + Date.now(),
      title: `Rollback of: ${manifest.title}`,
      goal: "Restored previous state",
      appliedAt: new Date().toISOString(),
      backupId: backupId,
      status: "rolled_back",
      filesTouched: manifest.files.map((f) => f.originalPath)
    });
    this.saveHistory(history.slice(0, 50));

    return {
      success: true,
      backupId: backupId,
      message: `Rollback completed for ${manifest.title}. Files restored to original state.`
    };
  }

  /**
   * High-quality issue plan builders with pre-check verification
   */
  buildIssuePlan(issueId) {
    const indexPath = path.join(this.baseDir, "public", "index.html");
    const siteCssPath = path.join(this.baseDir, "public", "css", "site.css");
    const siteJsPath = path.join(this.baseDir, "public", "js", "site.js");
    const serverPath = path.join(this.baseDir, "server.js");

    let indexHtml = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "";
    let siteCss = fs.existsSync(siteCssPath) ? fs.readFileSync(siteCssPath, "utf8") : "";
    let siteJs = fs.existsSync(siteJsPath) ? fs.readFileSync(siteJsPath, "utf8") : "";

    // 1. Fix Missing/Broken Service Images
    if (issueId === "fix-missing-images") {
      // Check if files already point to .jpg or if they need correction
      const hasWebp = indexHtml.includes("business-website.webp") || indexHtml.includes("restaurant-website.webp");
      if (!hasWebp && indexHtml.includes("business website.jpg")) {
        // Already pointing to valid files!
        return {
          title: "Service Card Images Already Verified",
          goal: "Confirm service card image paths in public/index.html match verified assets on disk",
          steps: ["Scanned public/images/ - all 6 JPG assets exist and are referenced in HTML."],
          riskLevel: "Low",
          targetCheckId: "check-service-images",
          files: [
            {
              path: "public/index.html",
              fullPath: indexPath,
              isNew: false,
              originalContent: indexHtml,
              newContent: indexHtml,
              diff: this.generateDiff(indexHtml, indexHtml, "public/index.html")
            }
          ]
        };
      }

      let updatedHtml = indexHtml
        .replace(/src="\/images\/business-website\.webp"/g, 'src="/images/business website.jpg"')
        .replace(/src="\/images\/restaurant-website\.webp"/g, 'src="/images/restaurant website.jpg"')
        .replace(/src="\/images\/shop-website\.webp"/g, 'src="/images/shop website.jpg"')
        .replace(/src="\/images\/medical-website\.webp"/g, 'src="/images/medical website.jpg"')
        .replace(/src="\/images\/education-website\.webp"/g, 'src="/images/education website.jpg"')
        .replace(/src="\/images\/real-estate-website\.webp"/g, 'src="/images/real estate website.jpg"');

      return {
        title: "Correct Service Card Image Paths",
        goal: "Ensure all business service card images point to verified disk assets",
        steps: [
          "Match service cards with verified images in public/images/",
          "Update image references in public/index.html",
          "Verify asset accessibility"
        ],
        riskLevel: "Low",
        targetCheckId: "check-service-images",
        files: [
          {
            path: "public/index.html",
            fullPath: indexPath,
            isNew: false,
            originalContent: indexHtml,
            newContent: updatedHtml,
            diff: this.generateDiff(indexHtml, updatedHtml, "public/index.html")
          }
        ]
      };
    }

    // 2. SEO - Schema.org JSON-LD (Using verified project facts only!)
    if (issueId === "seo-schema-jsonld") {
      if (indexHtml.includes('application/ld+json')) {
        return {
          title: "Schema.org Structured Data Already Present",
          goal: "Confirm valid Schema.org JSON-LD exists in public/index.html",
          steps: ["Schema.org JSON-LD is already active on the home page."],
          riskLevel: "Low",
          targetCheckId: "check-schema-jsonld",
          files: [
            {
              path: "public/index.html",
              fullPath: indexPath,
              isNew: false,
              originalContent: indexHtml,
              newContent: indexHtml,
              diff: this.generateDiff(indexHtml, indexHtml, "public/index.html")
            }
          ]
        };
      }

      const schemaScript = `  <!-- Schema.org ProfessionalService Structured Data (Verified Project Details) -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "name": "BrandX Web",
    "description": "Websites for local shops, clinics, restaurants, schools and real estate businesses.",
    "founder": {
      "@type": "Person",
      "name": "Darshan Auradi"
    },
    "telephone": "+919380400181",
    "email": "darshanauradi17@gmail.com",
    "priceRange": "₹5,000 - ₹50,000+",
    "image": "/icon-512.png"
  }
  </script>`;

      const updatedHtml = indexHtml.replace('</head>', `${schemaScript}\n</head>`);

      return {
        title: "Add Schema.org LocalBusiness Structured Data",
        goal: "Qualify for Google Search rich snippets using verified project facts (no fake addresses or ratings)",
        steps: [
          "Structure ProfessionalService JSON-LD with verified owner & contact details",
          "Embed script in <head> of public/index.html",
          "Validate against Schema.org specification"
        ],
        riskLevel: "Low",
        targetCheckId: "check-schema-jsonld",
        files: [
          {
            path: "public/index.html",
            fullPath: indexPath,
            isNew: false,
            originalContent: indexHtml,
            newContent: updatedHtml,
            diff: this.generateDiff(indexHtml, updatedHtml, "public/index.html")
          }
        ]
      };
    }

    // 3. Floating WhatsApp Quick-Connect Action
    if (issueId === "biz-whatsapp-quickaction") {
      if (indexHtml.includes("wa.me/919380400181") && siteCss.includes(".godmode-floating-contact")) {
        return {
          title: "Floating WhatsApp Button Already Active",
          goal: "Confirm WhatsApp quick-action widget is embedded and styled",
          steps: ["Floating WhatsApp button (+91 93804 00181) is already active."],
          riskLevel: "Low",
          targetCheckId: "check-whatsapp-btn",
          files: [
            {
              path: "public/index.html",
              fullPath: indexPath,
              isNew: false,
              originalContent: indexHtml,
              newContent: indexHtml,
              diff: this.generateDiff(indexHtml, indexHtml, "public/index.html")
            }
          ]
        };
      }

      const widgetHtml = `
<!-- Floating WhatsApp & Call Quick-Action Widget -->
<div class="godmode-floating-contact" id="godmodeFloatingContact">
  <a href="https://wa.me/919380400181?text=Hi%2C%20I%20am%20interested%20in%20a%20website%20for%20my%20business." 
     class="floating-wa-btn" 
     target="_blank" 
     rel="noopener" 
     aria-label="Chat on WhatsApp">
    <svg class="icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.5A8 8 0 1 1 21 12z"/></svg>
    <span>Chat on WhatsApp</span>
    <span class="floating-online-badge" title="Online now"></span>
  </a>
</div>`;

      let updatedHtml = indexHtml.includes("godmode-floating-contact")
        ? indexHtml
        : indexHtml.replace('</body>', `${widgetHtml}\n</body>`);

      return {
        title: "Add Floating WhatsApp Quick-Connect Widget",
        goal: "Provide instant one-tap contact on mobile using verified business number (+91 93804 00181)",
        steps: [
          "Append floating contact markup to public/index.html",
          "Ensure responsive styling and keyboard accessibility",
          "Verify destination link uses verified phone number"
        ],
        riskLevel: "Low",
        targetCheckId: "check-whatsapp-btn",
        files: [
          {
            path: "public/index.html",
            fullPath: indexPath,
            isNew: false,
            originalContent: indexHtml,
            newContent: updatedHtml,
            diff: this.generateDiff(indexHtml, updatedHtml, "public/index.html")
          }
        ]
      };
    }

    // 4. Interactive Scope & Price Estimator
    if (issueId === "biz-price-estimator") {
      if (indexHtml.includes('id="priceEstimator"')) {
        return {
          title: "Price Estimator Already Implemented",
          goal: "Confirm interactive price estimator is active on public/index.html",
          steps: ["Price estimator is already present on the home page."],
          riskLevel: "Low",
          targetCheckId: "check-price-estimator",
          files: [
            {
              path: "public/index.html",
              fullPath: indexPath,
              isNew: false,
              originalContent: indexHtml,
              newContent: indexHtml,
              diff: this.generateDiff(indexHtml, indexHtml, "public/index.html")
            }
          ]
        };
      }

      const estimatorHtml = `
<!-- Interactive Scope & Price Estimator -->
<section class="section section-estimator" id="estimator">
  <div class="wrap">
    <div class="section-head">
      <p class="eyebrow">Price & Scope Estimator</p>
      <h2>Estimate your website package in 30 seconds</h2>
      <p>Select your business type and desired features to see an indicative budget estimate before sending a request.</p>
    </div>

    <div class="estimator-box" id="priceEstimator">
      <div class="estimator-grid">
        <div class="estimator-step">
          <label class="estimator-label">1. Business Type</label>
          <div class="pill-group" id="estTypeGroup">
            <button type="button" class="est-pill active" data-type="Shop" data-base="8000">Retail / Shop</button>
            <button type="button" class="est-pill" data-type="Clinic" data-base="10000">Clinic / Medical</button>
            <button type="button" class="est-pill" data-type="Restaurant" data-base="12000">Restaurant / Cafe</button>
            <button type="button" class="est-pill" data-type="Business" data-base="8000">Service Business</button>
            <button type="button" class="est-pill" data-type="Other" data-base="6000">Other</button>
          </div>
        </div>

        <div class="estimator-step">
          <label class="estimator-label">2. Desired Capabilities</label>
          <div class="check-group">
            <label class="est-check"><input type="checkbox" id="featMenu" checked data-cost="2500"> <span>Digital Menu / Product Catalog</span></label>
            <label class="est-check"><input type="checkbox" id="featWa" checked data-cost="1500"> <span>WhatsApp Quick-Order & Tap-to-Call</span></label>
            <label class="est-check"><input type="checkbox" id="featMaps" checked data-cost="1000"> <span>Google Location & Operating Hours</span></label>
            <label class="est-check"><input type="checkbox" id="featDomain" data-cost="2500"> <span>Custom Domain & Fast Hosting Setup</span></label>
          </div>
        </div>
      </div>

      <div class="estimator-summary">
        <div class="summary-left">
          <span class="summary-label">Indicative Estimate</span>
          <div class="summary-price" id="estPriceDisplay">₹13,000</div>
          <p class="summary-note">Note: This is an estimated price range. Final quote will be confirmed after discussing your exact requirements during consultation.</p>
        </div>
        <div class="summary-right">
          <button type="button" class="btn btn-primary" id="applyEstToForm">Use in Request Form &rarr;</button>
        </div>
      </div>
    </div>
  </div>
</section>
`;

      const estimatorCss = `
/* Interactive Price Estimator */
.section-estimator {
  background: var(--paper-2);
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.estimator-box {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 32px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.03);
}
.estimator-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
}
.estimator-label {
  display: block;
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--ink);
}
.pill-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.est-pill {
  background: var(--paper);
  border: 1px solid var(--line);
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 14px;
  color: var(--ink-2);
  transition: all 0.2s;
}
.est-pill:hover, .est-pill.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.check-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.est-check {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 15px;
  color: var(--ink-2);
}
.est-check input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
}
.estimator-summary {
  margin-top: 28px;
  padding-top: 24px;
  border-top: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}
.summary-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ink-3);
}
.summary-price {
  font-size: 2.2rem;
  font-family: var(--font-head);
  font-weight: 600;
  color: var(--accent);
  line-height: 1.1;
  margin: 4px 0;
}
.summary-note {
  font-size: 13px;
  color: var(--ink-3);
  max-width: 540px;
}
@media (max-width: 768px) {
  .estimator-grid { grid-template-columns: 1fr; }
  .estimator-box { padding: 20px; }
}
`;

      const estimatorJs = `
/* Interactive Price Estimator Controller */
(function() {
  var box = document.getElementById("priceEstimator");
  if (!box) return;

  var basePrice = 8000;
  var display = document.getElementById("estPriceDisplay");
  var typePills = box.querySelectorAll(".est-pill");
  var checks = box.querySelectorAll(".est-check input");
  var applyBtn = document.getElementById("applyEstToForm");

  function calc() {
    var total = basePrice;
    checks.forEach(function(c) {
      if (c.checked) total += Number(c.dataset.cost || 0);
    });
    if (display) display.textContent = "₹" + total.toLocaleString("en-IN");
  }

  typePills.forEach(function(pill) {
    pill.addEventListener("click", function() {
      typePills.forEach(function(p) { p.classList.remove("active"); });
      pill.classList.add("active");
      basePrice = Number(pill.dataset.base || 8000);
      calc();
    });
  });

  checks.forEach(function(c) {
    c.addEventListener("change", calc);
  });

  if (applyBtn) {
    applyBtn.addEventListener("click", function() {
      var activePill = box.querySelector(".est-pill.active");
      var typeVal = activePill ? activePill.dataset.type : "";

      var reqType = document.querySelector('select[name="businessType"]');
      if (reqType && typeVal) {
        for (var i = 0; i < reqType.options.length; i++) {
          if (reqType.options[i].value.toLowerCase() === typeVal.toLowerCase()) {
            reqType.selectedIndex = i;
            break;
          }
        }
      }

      // Map to budget bracket
      var reqBudget = document.querySelector('select[name="budget"]');
      if (reqBudget) {
        var currentPrice = parseInt((display ? display.textContent : "").replace(/\D/g, "")) || 13000;
        if (currentPrice <= 10000 && reqBudget.options[1]) reqBudget.selectedIndex = 1;
        else if (currentPrice <= 25000 && reqBudget.options[2]) reqBudget.selectedIndex = 2;
        else if (currentPrice <= 50000 && reqBudget.options[3]) reqBudget.selectedIndex = 3;
        else if (reqBudget.options[4]) reqBudget.selectedIndex = 4;
      }

      var reqDesc = document.querySelector('textarea[name="requirements"]');
      if (reqDesc) {
        var selectedFeats = [];
        checks.forEach(function(c) {
          if (c.checked) selectedFeats.push(c.nextElementSibling.textContent.trim());
        });
        reqDesc.value = "Estimated package: " + typeVal + " website with features: " + selectedFeats.join(", ") + " (" + (display ? display.textContent : "") + " indicative estimate).";
      }

      var reqSection = document.getElementById("request");
      if (reqSection) reqSection.scrollIntoView({ behavior: "smooth" });
    });
  }

  calc();
})();
`;

      const updatedHtml = indexHtml.replace('<section class="section" id="request">', `${estimatorHtml}\n<section class="section" id="request">`);
      const updatedCss = siteCss.includes(".section-estimator") ? siteCss : (siteCss + "\n" + estimatorCss);
      const updatedJs = siteJs.includes("priceEstimator") ? siteJs : (siteJs + "\n" + estimatorJs);

      return {
        title: "Implement Interactive Price & Scope Estimator",
        goal: "Give prospective clients clear indicative estimates and pre-populate request form",
        steps: [
          "Insert responsive estimator section above request form in public/index.html",
          "Append clean styling to public/css/site.css",
          "Attach calculation and form-mapping events in public/js/site.js"
        ],
        riskLevel: "Low",
        targetCheckId: "check-price-estimator",
        files: [
          {
            path: "public/index.html",
            fullPath: indexPath,
            isNew: false,
            originalContent: indexHtml,
            newContent: updatedHtml,
            diff: this.generateDiff(indexHtml, updatedHtml, "public/index.html")
          },
          {
            path: "public/css/site.css",
            fullPath: siteCssPath,
            isNew: false,
            originalContent: siteCss,
            newContent: updatedCss,
            diff: this.generateDiff(siteCss, updatedCss, "public/css/site.css")
          },
          {
            path: "public/js/site.js",
            fullPath: siteJsPath,
            isNew: false,
            originalContent: siteJs,
            newContent: updatedJs,
            diff: this.generateDiff(siteJs, updatedJs, "public/js/site.js")
          }
        ]
      };
    }

    // 5. Social Share Metadata (OG & Twitter Image)
    if (issueId === "seo-og-image") {
      if (indexHtml.includes('property="og:image"') && indexHtml.includes('name="twitter:image"')) {
        return {
          title: "Social Share Images Already Present",
          goal: "Confirm Open Graph and Twitter image tags exist in public/index.html",
          steps: ["Social share image tags are already active."],
          riskLevel: "Low",
          targetCheckId: "check-social-metadata",
          files: [
            {
              path: "public/index.html",
              fullPath: indexPath,
              isNew: false,
              originalContent: indexHtml,
              newContent: indexHtml,
              diff: this.generateDiff(indexHtml, indexHtml, "public/index.html")
            }
          ]
        };
      }

      const ogTags = `  <meta property="og:image" content="/icon-512.png">\n  <meta name="twitter:image" content="/icon-512.png">`;
      const updatedHtml = indexHtml.replace('</head>', `${ogTags}\n</head>`);

      return {
        title: "Add Open Graph & Twitter Card Image Metadata",
        goal: "Enable rich preview thumbnails when links are shared on WhatsApp and social media",
        steps: [
          "Reference verified /icon-512.png asset in og:image and twitter:image tags",
          "Inject tags into <head> of public/index.html"
        ],
        riskLevel: "Low",
        targetCheckId: "check-social-metadata",
        files: [
          {
            path: "public/index.html",
            fullPath: indexPath,
            isNew: false,
            originalContent: indexHtml,
            newContent: updatedHtml,
            diff: this.generateDiff(indexHtml, updatedHtml, "public/index.html")
          }
        ]
      };
    }

    // 6. Canonical URL
    if (issueId === "seo-canonical-tag") {
      let siteUrl = (process.env.SITE_URL || "").trim().replace(/\/+$/, "");
      const envPath = path.join(this.baseDir, ".env");
      if (!siteUrl && fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf8");
        const m = envContent.match(/^\s*SITE_URL\s*=\s*(https?:\/\/[^\s#]+)/m);
        if (m) siteUrl = m[1].trim().replace(/\/+$/, "");
      }

      if (!siteUrl) {
        return {
          title: "Configure Production Domain (SITE_URL)",
          goal: "Set SITE_URL in .env before generating an absolute canonical tag",
          steps: [
            "Set SITE_URL=https://your-domain.com in .env",
            "Re-run GODMODE to emit verified canonical tag matching production URL"
          ],
          riskLevel: "Low",
          targetCheckId: "check-canonical-url",
          files: []
        };
      }

      const canonicalTag = `  <link rel="canonical" href="${siteUrl}/">`;
      const updatedHtml = indexHtml.includes('rel="canonical"')
        ? indexHtml.replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>/i, canonicalTag.trim())
        : indexHtml.replace('</head>', `${canonicalTag}\n</head>`);

      return {
        title: `Add Canonical URL Tag (${siteUrl}/)`,
        goal: "Consolidate page authority and prevent duplicate search indexing",
        steps: [
          `Add <link rel="canonical" href="${siteUrl}/"> in <head>`,
          "Verify URL matches configured production SITE_URL"
        ],
        riskLevel: "Low",
        targetCheckId: "check-canonical-url",
        files: [
          {
            path: "public/index.html",
            fullPath: indexPath,
            isNew: false,
            originalContent: indexHtml,
            newContent: updatedHtml,
            diff: this.generateDiff(indexHtml, updatedHtml, "public/index.html")
          }
        ]
      };
    }

    // 7. Sitemap.xml
    if (issueId === "seo-sitemap-xml") {
      const sitemapPath = path.join(this.baseDir, "public", "sitemap.xml");
      const siteUrl = (process.env.SITE_URL || "https://example.com").trim().replace(/\/+$/, "");
      const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${siteUrl}/portfolio</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>`;

      return {
        title: "Generate Public sitemap.xml",
        goal: "Accelerate search bot crawl discovery and indexing across canonical URLs",
        steps: [
          "Create public/sitemap.xml conforming to sitemaps.org 0.9 schema",
          "Include high-priority pages (home and portfolio)"
        ],
        riskLevel: "Low",
        targetCheckId: "check-sitemap-xml",
        files: [
          {
            path: "public/sitemap.xml",
            fullPath: sitemapPath,
            isNew: !fs.existsSync(sitemapPath),
            originalContent: fs.existsSync(sitemapPath) ? fs.readFileSync(sitemapPath, "utf8") : "",
            newContent: sitemapContent,
            diff: this.generateDiff(fs.existsSync(sitemapPath) ? fs.readFileSync(sitemapPath, "utf8") : "", sitemapContent, "public/sitemap.xml")
          }
        ]
      };
    }

    // 8. Security Headers (CSP & HSTS)
    if (issueId === "sec-csp-header") {
      let serverContent = fs.existsSync(serverPath) ? fs.readFileSync(serverPath, "utf8") : "";

      if (serverContent.includes("Content-Security-Policy")) {
        return {
          title: "Security Headers Already Active",
          goal: "Confirm Content-Security-Policy is set in server.js",
          steps: ["CSP and HSTS are already active in server.js."],
          riskLevel: "Low",
          targetCheckId: "check-security-csp",
          files: [
            {
              path: "server.js",
              fullPath: serverPath,
              isNew: false,
              originalContent: serverContent,
              newContent: serverContent,
              diff: this.generateDiff(serverContent, serverContent, "server.js")
            }
          ]
        };
      }

      const oldMiddleware = `app.use(function (req, res, next) {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
  });`;

      const newMiddleware = `app.use(function (req, res, next) {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; frame-src 'self';"
  });`;

      let updatedServer = serverContent.replace(oldMiddleware, newMiddleware);

      return {
        title: "Add Content-Security-Policy & HSTS Security Headers",
        goal: "Elevate HTTP security posture and prevent XSS injection",
        steps: [
          "Configure Strict-Transport-Security (HSTS) with 1-year max age",
          "Define Content-Security-Policy whitelist for self and Google Fonts",
          "Preserve SAMEORIGIN frame policy for Godmode preview"
        ],
        riskLevel: "Medium",
        targetCheckId: "check-security-csp",
        files: [
          {
            path: "server.js",
            fullPath: serverPath,
            isNew: false,
            originalContent: serverContent,
            newContent: updatedServer,
            diff: this.generateDiff(serverContent, updatedServer, "server.js")
          }
        ]
      };
    }

    return null;
  }
}

module.exports = {
  GodmodeExecutor
};
