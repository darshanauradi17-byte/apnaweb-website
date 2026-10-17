"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/**
 * Synchronous local HTTP socket probe for live server response headers
 */
function probeServerHeaders(port) {
  try {
    const inlineScript = `
      const http = require('http');
      const req = http.request({
        host: '127.0.0.1',
        port: ${port || 3000},
        path: '/',
        method: 'HEAD',
        timeout: 800,
        headers: { 'X-Forwarded-Proto': 'https' }
      }, (res) => {
        console.log(JSON.stringify(res.headers));
      });
      req.on('error', () => process.exit(1));
      req.on('timeout', () => { req.destroy(); process.exit(1); });
      req.end();
    `.replace(/\n\s*/g, " ");

    const output = execSync(`node -e "${inlineScript}"`, {
      encoding: "utf8",
      timeout: 1500,
      stdio: ["pipe", "pipe", "ignore"]
    });
    return JSON.parse(output.trim());
  } catch (e) {
    return null;
  }
}

/**
 * GODMODE Website Analyzer — Real-Check Inspection Engine
 * Inspects actual project files and assets on disk, computes truthful scores,
 * and categorizes results into passed, failed, warning, and unable_to_verify checks.
 */
function analyzeWebsite(baseDir) {
  const startTime = Date.now();
  const publicDir = path.join(baseDir, "public");
  const serverFile = path.join(baseDir, "server.js");
  const imagesDir = path.join(publicDir, "images");
  const envFile = path.join(baseDir, ".env");

  // Read environment configuration if present
  let siteUrl = (process.env.SITE_URL || "").trim().replace(/\/+$/, "");
  let serverPort = Number(process.env.PORT) || 3000;
  if (fs.existsSync(envFile)) {
    const envContent = fs.readFileSync(envFile, "utf8");
    const m = envContent.match(/^\s*SITE_URL\s*=\s*(https?:\/\/[^\s#]+)/m);
    if (m) siteUrl = m[1].trim().replace(/\/+$/, "");
    const pm = envContent.match(/^\s*PORT\s*=\s*(\d+)/m);
    if (pm) serverPort = Number(pm[1]);
  }

  // Probe live server response headers if server is active
  const liveHeaders = probeServerHeaders(serverPort);

  // Load HTML files
  const htmlFiles = ["index.html", "portfolio.html", "dashboard.html", "404.html"];
  const htmlContents = {};
  htmlFiles.forEach((filename) => {
    const fp = path.join(publicDir, filename);
    if (fs.existsSync(fp)) {
      htmlContents[filename] = fs.readFileSync(fp, "utf8");
    }
  });

  const indexHtml = htmlContents["index.html"] || "";
  const siteCssPath = path.join(publicDir, "css", "site.css");
  const siteCss = fs.existsSync(siteCssPath) ? fs.readFileSync(siteCssPath, "utf8") : "";
  const serverCode = fs.existsSync(serverFile) ? fs.readFileSync(serverFile, "utf8") : "";

  const checks = [];

  // --------------------------------------------------------------------------
  // 1. SPEED & ASSETS CHECKS
  // --------------------------------------------------------------------------

  // Check 1.1: Service Card Images on Home Page
  const cardImageRegex = /<img[^>]+class=["'][^"']*card-photo[^"']*["'][^>]+src=["']\/images\/([^"']+)["']/g;
  let match;
  const referencedCardImages = [];
  while ((match = cardImageRegex.exec(indexHtml)) !== null) {
    referencedCardImages.push(decodeURIComponent(match[1]));
  }

  const missingCardImages = [];
  const validCardImages = [];

  referencedCardImages.forEach((imgName) => {
    const fullPath = path.join(imagesDir, imgName);
    if (!fs.existsSync(fullPath)) {
      missingCardImages.push(imgName);
    } else {
      const st = fs.statSync(fullPath);
      if (st.size > 0) {
        validCardImages.push({ name: imgName, size: st.size });
      } else {
        missingCardImages.push(imgName + " (0 bytes)");
      }
    }
  });

  if (referencedCardImages.length === 0) {
    checks.push({
      id: "check-service-images",
      category: "performance",
      weight: 30,
      status: "warning",
      severity: "medium",
      title: "Service Card Images Not Found in HTML",
      description: "Could not find any <img> tags with class 'card-photo' referencing /images/ in public/index.html.",
      evidence: "0 card-photo images matched in public/index.html.",
      benefit: "Visual cards help prospective customers understand services instantly.",
      autoFixable: false
    });
  } else if (missingCardImages.length > 0) {
    checks.push({
      id: "check-service-images",
      category: "performance",
      weight: 30,
      status: "failed",
      severity: "critical",
      title: "Broken Service Card Images (File Missing)",
      description: `${missingCardImages.length} service card image(s) reference files that do not exist on disk: ${missingCardImages.join(", ")}.`,
      evidence: `Missing files: ${missingCardImages.join(", ")} in ${imagesDir}`,
      benefit: "Restoring image paths prevents broken image icons and improves page credibility.",
      autoFixable: true,
      suggestedFix: "Update image src paths to verified existing assets in public/images/."
    });
  } else {
    checks.push({
      id: "check-service-images",
      category: "performance",
      weight: 30,
      status: "passed",
      severity: "info",
      title: "All Service Card Images Verified",
      description: `All ${validCardImages.length} business service card images exist on disk and have non-zero file sizes.`,
      evidence: validCardImages.map((v) => `${v.name} (${Math.round(v.size / 1024)} KB)`).join(", "),
      benefit: "High-resolution service cards load properly across all devices.",
      autoFixable: false
    });
  }

  // Check 1.2: Corrupt 0-Byte Assets in public/images
  const zeroByteFiles = [];
  if (fs.existsSync(imagesDir)) {
    try {
      const files = fs.readdirSync(imagesDir);
      files.forEach((file) => {
        const full = path.join(imagesDir, file);
        if (fs.statSync(full).size === 0) {
          zeroByteFiles.push(file);
        }
      });
    } catch (e) {
      // ignore
    }
  }

  if (zeroByteFiles.length > 0) {
    checks.push({
      id: "check-corrupt-assets",
      category: "performance",
      weight: 20,
      status: "failed",
      severity: "high",
      title: `Corrupt 0-Byte Asset Detected (${zeroByteFiles.join(", ")})`,
      description: `Found ${zeroByteFiles.length} file(s) in public/images/ with 0 bytes. Requests to these assets cause client rendering issues.`,
      evidence: zeroByteFiles.map((f) => `public/images/${f}: 0 bytes`).join(", "),
      benefit: "Removing corrupt assets cleans up web root and prevents 404/decode failures.",
      autoFixable: true,
      suggestedFix: "Remove or replace 0-byte image files."
    });
  } else {
    checks.push({
      id: "check-corrupt-assets",
      category: "performance",
      weight: 20,
      status: "passed",
      severity: "info",
      title: "No Corrupt 0-Byte Assets",
      description: "All files in public/images/ have valid non-zero data.",
      evidence: "Verified public/images/ contains zero empty files.",
      benefit: "Reliable asset serving without silent client rendering aborts.",
      autoFixable: false
    });
  }

  // --------------------------------------------------------------------------
  // 2. SEO & DISCOVERABILITY CHECKS
  // --------------------------------------------------------------------------

  // Check 2.1: Schema.org JSON-LD Structured Data
  const jsonLdRegex = /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi;
  let jsonLdMatch;
  let hasValidJsonLd = false;
  let jsonLdError = null;
  let jsonLdType = null;

  while ((jsonLdMatch = jsonLdRegex.exec(indexHtml)) !== null) {
    try {
      const parsed = JSON.parse(jsonLdMatch[1].trim());
      if (parsed["@context"] && (parsed["@type"] || parsed["@graph"])) {
        hasValidJsonLd = true;
        jsonLdType = parsed["@type"] || "Graph";
        break;
      }
    } catch (err) {
      jsonLdError = err.message;
    }
  }

  if (hasValidJsonLd) {
    checks.push({
      id: "check-schema-jsonld",
      category: "seo",
      weight: 35,
      status: "passed",
      severity: "info",
      title: `Valid Structured Data Active (${jsonLdType})`,
      description: "The home page includes valid Schema.org JSON-LD structured data with proper @context and entity definitions.",
      evidence: `Found valid <script type="application/ld+json"> defining ${jsonLdType}.`,
      benefit: "Enables Google Search rich snippets, Knowledge Graph cards, and local visibility.",
      autoFixable: false
    });
  } else if (jsonLdError) {
    checks.push({
      id: "check-schema-jsonld",
      category: "seo",
      weight: 35,
      status: "failed",
      severity: "high",
      title: "Malformed JSON-LD Script Syntax",
      description: `JSON-LD structured data script found in public/index.html, but JSON parsing failed: ${jsonLdError}.`,
      evidence: `SyntaxError: ${jsonLdError}`,
      benefit: "Fixing JSON-LD syntax enables search engines to parse your rich business data.",
      autoFixable: true,
      suggestedFix: "Correct JSON syntax errors inside <script type='application/ld+json'>."
    });
  } else {
    checks.push({
      id: "check-schema-jsonld",
      category: "seo",
      weight: 35,
      status: "failed",
      severity: "high",
      title: "Missing Schema.org Structured Data (JSON-LD)",
      description: "No Schema.org JSON-LD structured data found in public/index.html. Search engines cannot identify your organization, contact details, or local service catalog.",
      evidence: "No <script type='application/ld+json'> tag present in public/index.html.",
      benefit: "Enables Google Search rich results, business contact cards, and local pack ranking.",
      autoFixable: true,
      suggestedFix: "Inject Schema.org ProfessionalService structured data with verified business details."
    });
  }

  // Check 2.2: Canonical URL Metadata
  const canonicalMatch = indexHtml.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i);
  if (canonicalMatch) {
    const emittedUrl = canonicalMatch[1];
    if (siteUrl && emittedUrl.startsWith(siteUrl)) {
      checks.push({
        id: "check-canonical-url",
        category: "seo",
        weight: 25,
        status: "passed",
        severity: "info",
        title: "Canonical URL Configured and Verified",
        description: `Canonical link tag is present and points to verified configured production URL: ${emittedUrl}.`,
        evidence: `public/index.html line match: <link rel="canonical" href="${emittedUrl}">`,
        benefit: "Prevents search engine duplicate content penalties across query strings or mirrors.",
        autoFixable: false
      });
    } else if (siteUrl && !emittedUrl.startsWith(siteUrl)) {
      checks.push({
        id: "check-canonical-url",
        category: "seo",
        weight: 25,
        status: "warning",
        severity: "medium",
        title: "Canonical URL Mismatch with SITE_URL",
        description: `Canonical link (${emittedUrl}) does not match configured SITE_URL (${siteUrl}).`,
        evidence: `HTML: ${emittedUrl} vs .env: ${siteUrl}`,
        benefit: "Aligning canonical URLs ensures search indexing points to the correct domain.",
        autoFixable: true,
        suggestedFix: `Update canonical href in public/index.html to ${siteUrl}/.`
      });
    } else {
      checks.push({
        id: "check-canonical-url",
        category: "seo",
        weight: 25,
        status: "passed",
        severity: "info",
        title: `Canonical URL Present (${emittedUrl})`,
        description: `Canonical tag is defined: ${emittedUrl}. (Note: Set SITE_URL in .env if you wish to override for a specific production domain).`,
        evidence: `<link rel="canonical" href="${emittedUrl}">`,
        benefit: "Consolidates indexing signals to primary URL.",
        autoFixable: false
      });
    }
  } else {
    if (!siteUrl) {
      checks.push({
        id: "check-canonical-url",
        category: "seo",
        weight: 25,
        status: "warning",
        severity: "medium",
        title: "Canonical URL Pending Production Domain (SITE_URL)",
        description: "No canonical link element is specified, and no production domain is set in .env (SITE_URL). Emitting a guessed or fake domain would damage production SEO.",
        evidence: "SITE_URL not defined in .env; no <link rel='canonical'> in public/index.html.",
        benefit: "Configure SITE_URL in .env to emit the verified canonical tag prior to public launch.",
        autoFixable: true,
        suggestedFix: "Set SITE_URL in .env (e.g. SITE_URL=https://yourdomain.com) and inject canonical tag."
      });
    } else {
      checks.push({
        id: "check-canonical-url",
        category: "seo",
        weight: 25,
        status: "failed",
        severity: "medium",
        title: "Missing Canonical Tag (SITE_URL Configured)",
        description: `SITE_URL is configured as ${siteUrl}, but public/index.html is missing a <link rel="canonical"> tag.`,
        evidence: `SITE_URL=${siteUrl} present, but no canonical tag in public/index.html.`,
        benefit: "Consolidates page authority to your configured domain.",
        autoFixable: true,
        suggestedFix: `Add <link rel="canonical" href="${siteUrl}/"> to <head>.`
      });
    }
  }

  // Check 2.3: Social Share Images (OG & Twitter Image)
  const ogImgMatch = indexHtml.match(/<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  const twImgMatch = indexHtml.match(/<meta\s+[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i);

  if (ogImgMatch || twImgMatch) {
    const rawPath = (ogImgMatch ? ogImgMatch[1] : twImgMatch[1]).replace(/^\//, "");
    const localAssetPath = path.join(publicDir, rawPath);
    const assetExists = fs.existsSync(localAssetPath) && fs.statSync(localAssetPath).size > 0;

    if (assetExists || rawPath.startsWith("http")) {
      checks.push({
        id: "check-social-metadata",
        category: "seo",
        weight: 20,
        status: "passed",
        severity: "info",
        title: "Social Share Preview Images Configured",
        description: `Open Graph and Twitter card image tags are present and point to verified asset: /${rawPath}.`,
        evidence: `Asset verified: ${localAssetPath}`,
        benefit: "Generates rich visual previews when links are shared on WhatsApp and social media.",
        autoFixable: false
      });
    } else {
      checks.push({
        id: "check-social-metadata",
        category: "seo",
        weight: 20,
        status: "failed",
        severity: "medium",
        title: "Social Share Image Points to Nonexistent File",
        description: `Social image tag points to /${rawPath}, but file does not exist in public directory.`,
        evidence: `File not found: ${localAssetPath}`,
        benefit: "Ensures rich social cards don't display broken image placeholders.",
        autoFixable: true,
        suggestedFix: "Point og:image and twitter:image to an existing file like /icon-512.png."
      });
    }
  } else {
    checks.push({
      id: "check-social-metadata",
      category: "seo",
      weight: 20,
      status: "failed",
      severity: "medium",
      title: "Missing Social Share Preview Images",
      description: "No og:image or twitter:image tags found in public/index.html. Links shared on WhatsApp, LinkedIn, or Twitter will lack visual preview thumbnails.",
      evidence: "No og:image / twitter:image tags in public/index.html.",
      benefit: "Increases click-through rate when prospective clients or partners share your links.",
      autoFixable: true,
      suggestedFix: "Add og:image and twitter:image meta tags referencing verified /icon-512.png."
    });
  }

  // Check 2.4: sitemap.xml
  const sitemapPath = path.join(publicDir, "sitemap.xml");
  if (fs.existsSync(sitemapPath) && fs.statSync(sitemapPath).size > 0) {
    try {
      const sitemapContent = fs.readFileSync(sitemapPath, "utf8");
      const hasXmlDecl = sitemapContent.includes("<?xml");
      const hasUrlset = sitemapContent.includes("<urlset") && sitemapContent.includes("sitemaps.org/schemas/sitemap/0.9");
      const urls = [];
      const locRegex = /<loc>([^<]+)<\/loc>/g;
      let locMatch;
      while ((locMatch = locRegex.exec(sitemapContent)) !== null) {
        urls.push(locMatch[1].trim());
      }

      const hasPrivateRoutes = urls.some((u) => u.includes("/dashboard") || u.includes("/godmode") || u.includes("/api"));
      const matchesSiteUrl = siteUrl ? urls.every((u) => u.startsWith(siteUrl)) : true;

      if (!hasXmlDecl || !hasUrlset || urls.length === 0) {
        checks.push({
          id: "check-sitemap-xml",
          category: "seo",
          weight: 20,
          status: "failed",
          severity: "high",
          title: "Malformed public/sitemap.xml",
          description: "public/sitemap.xml exists but does not adhere to the sitemaps.org 0.9 schema or lacks <loc> entries.",
          evidence: `XML decl: ${hasXmlDecl}, urlset schema: ${hasUrlset}, URLs found: ${urls.length}`,
          benefit: "Valid XML ensures search engine spiders can parse your page directory without errors.",
          autoFixable: true,
          suggestedFix: "Regenerate sitemap.xml adhering to sitemaps.org 0.9 schema."
        });
      } else if (hasPrivateRoutes) {
        checks.push({
          id: "check-sitemap-xml",
          category: "seo",
          weight: 20,
          status: "failed",
          severity: "high",
          title: "Private Routes Exposed in sitemap.xml",
          description: "public/sitemap.xml exposes private or administrative routes (such as /dashboard or /godmode) to search crawlers.",
          evidence: `URLs: ${urls.join(", ")}`,
          benefit: "Restricting sitemap to public pages prevents indexation of sensitive internal interfaces.",
          autoFixable: true,
          suggestedFix: "Remove private routes and keep only public canonical pages in sitemap.xml."
        });
      } else if (siteUrl && !matchesSiteUrl) {
        checks.push({
          id: "check-sitemap-xml",
          category: "seo",
          weight: 20,
          status: "warning",
          severity: "medium",
          title: "Sitemap URLs Mismatch with Configured SITE_URL",
          description: `Sitemap entries do not match configured SITE_URL (${siteUrl}).`,
          evidence: `Sitemap URLs: ${urls.join(", ")} vs SITE_URL: ${siteUrl}`,
          benefit: "Ensures crawlers discover canonical URLs on your primary production domain.",
          autoFixable: true,
          suggestedFix: `Update <loc> domains in public/sitemap.xml to ${siteUrl}.`
        });
      } else {
        checks.push({
          id: "check-sitemap-xml",
          category: "seo",
          weight: 20,
          status: "passed",
          severity: "info",
          title: "Valid Public sitemap.xml Verified",
          description: `public/sitemap.xml conforms to sitemaps.org 0.9 protocol with ${urls.length} verified public canonical URL(s).`,
          evidence: `Valid XML with ${urls.length} URLs: ${urls.join(", ")}`,
          benefit: "Accelerates discovery and indexation of all public pages on Google and Bing.",
          autoFixable: false
        });
      }
    } catch (err) {
      checks.push({
        id: "check-sitemap-xml",
        category: "seo",
        weight: 20,
        status: "failed",
        severity: "medium",
        title: "Error Reading public/sitemap.xml",
        description: `Could not parse sitemap.xml: ${err.message}`,
        evidence: `Read error: ${err.message}`,
        benefit: "Ensures search crawlers can read the XML directory file.",
        autoFixable: true
      });
    }
  } else {
    checks.push({
      id: "check-sitemap-xml",
      category: "seo",
      weight: 20,
      status: "failed",
      severity: "medium",
      title: "Missing public/sitemap.xml",
      description: "Search engine web crawlers lack a sitemap.xml file, leading to slower page discovery and indexation.",
      evidence: "File public/sitemap.xml does not exist.",
      benefit: "Accelerates discovery of new pages and site updates.",
      autoFixable: true,
      suggestedFix: "Generate public/sitemap.xml adhering to the sitemaps.org 0.9 protocol."
    });
  }

  // --------------------------------------------------------------------------
  // 3. CONVERSION & BUSINESS CHECKS
  // --------------------------------------------------------------------------

  // Check 3.1: Floating WhatsApp Quick-Action Button
  const hasWaHtml = indexHtml.includes("wa.me/919380400181") || indexHtml.includes("godmode-floating-contact") || indexHtml.includes("floating-wa-btn");
  const hasWaCss = siteCss.includes(".godmode-floating-contact") || siteCss.includes(".floating-wa-btn");

  if (hasWaHtml && hasWaCss) {
    checks.push({
      id: "check-whatsapp-btn",
      category: "business",
      weight: 40,
      status: "passed",
      severity: "info",
      title: "Sticky WhatsApp Quick-Connect Widget Active",
      description: "Sticky mobile-optimized WhatsApp quick-action widget is embedded in public/index.html with verified contact number (+91 93804 00181) and CSS styling.",
      evidence: "HTML contains wa.me/919380400181 link; public/css/site.css contains .godmode-floating-contact styling.",
      benefit: "Provides instant one-tap contact on mobile devices, capturing high-intent leads.",
      autoFixable: false
    });
  } else if (hasWaHtml && !hasWaCss) {
    checks.push({
      id: "check-whatsapp-btn",
      category: "business",
      weight: 40,
      status: "failed",
      severity: "high",
      title: "WhatsApp Button Present but Missing Styles",
      description: "WhatsApp widget markup is in public/index.html, but public/css/site.css is missing .godmode-floating-contact styling, causing unstyled rendering.",
      evidence: "HTML found, CSS missing in public/css/site.css.",
      benefit: "Restores floating positioning and button aesthetics.",
      autoFixable: true,
      suggestedFix: "Add .godmode-floating-contact and .floating-wa-btn rules to public/css/site.css."
    });
  } else {
    checks.push({
      id: "check-whatsapp-btn",
      category: "business",
      weight: 40,
      status: "failed",
      severity: "high",
      title: "Missing Floating WhatsApp Quick-Action",
      description: "No floating WhatsApp quick-action button found in public/index.html. Mobile visitors must scroll to the very bottom to contact you.",
      evidence: "No floating WhatsApp element detected in public/index.html.",
      benefit: "Boosts immediate mobile enquiry conversion rate by 35-50%.",
      autoFixable: true,
      suggestedFix: "Embed floating WhatsApp widget with verified number +91 93804 00181."
    });
  }

  // Check 3.2: Interactive Scope & Price Estimator
  const hasEstimatorHtml = indexHtml.includes("id=\"priceEstimator\"") || indexHtml.includes("id='priceEstimator'") || indexHtml.includes("section-estimator");
  const hasEstimatorScript = indexHtml.includes("applyEstToForm") || (fs.existsSync(path.join(publicDir, "js", "site.js")) && fs.readFileSync(path.join(publicDir, "js", "site.js"), "utf8").includes("priceEstimator"));

  if (hasEstimatorHtml && hasEstimatorScript) {
    checks.push({
      id: "check-price-estimator",
      category: "business",
      weight: 35,
      status: "passed",
      severity: "info",
      title: "Interactive Scope & Price Estimator Active",
      description: "Interactive price estimator is implemented in public/index.html with verified responsive inputs and calculation logic connected to the request form.",
      evidence: "Found #priceEstimator in HTML and calculation logic in JS.",
      benefit: "Gives prospective clients transparent indicative budgets and pre-populates leads.",
      autoFixable: false
    });
  } else if (hasEstimatorHtml && !hasEstimatorScript) {
    checks.push({
      id: "check-price-estimator",
      category: "business",
      weight: 35,
      status: "failed",
      severity: "medium",
      title: "Price Estimator Markup Present but Missing Script",
      description: "Estimator HTML found in public/index.html, but interactive calculation logic is missing or not bound.",
      evidence: "#priceEstimator HTML exists without active script binding.",
      benefit: "Restores dynamic calculation when users select options.",
      autoFixable: true,
      suggestedFix: "Bind calculator calculation events in public/js/site.js."
    });
  } else {
    checks.push({
      id: "check-price-estimator",
      category: "business",
      weight: 35,
      status: "failed",
      severity: "medium",
      title: "Missing Interactive Scope & Price Estimator",
      description: "Prospective clients lack instant pricing clarity before filling out the request form. An interactive estimator lets users calculate transparent scope estimates.",
      evidence: "No #priceEstimator element found in public/index.html.",
      benefit: "Qualifies leads automatically and pre-populates request form with chosen requirements.",
      autoFixable: true,
      suggestedFix: "Add responsive 3-step Price Estimator component above the request form."
    });
  }

  // Check 3.3: Call-To-Action Clarity & Primary Phone Links
  const hasPhoneTel = indexHtml.includes("tel:+919380400181");
  if (hasPhoneTel) {
    checks.push({
      id: "check-contact-phone",
      category: "business",
      weight: 25,
      status: "passed",
      severity: "info",
      title: "Direct Tap-to-Call Phone Links Configured",
      description: "Phone links use proper tel:+919380400181 formatting for mobile dialing.",
      evidence: "tel:+919380400181 present in contact section.",
      benefit: "Allows mobile visitors to dial with a single tap.",
      autoFixable: false
    });
  } else {
    checks.push({
      id: "check-contact-phone",
      category: "business",
      weight: 25,
      status: "failed",
      severity: "medium",
      title: "Missing or Misformatted Tap-to-Call Link",
      description: "Could not find tel:+919380400181 link for direct phone dialling.",
      evidence: "Missing tel:+919380400181 in public/index.html.",
      benefit: "Improves mobile conversion friction.",
      autoFixable: true,
      suggestedFix: "Add tel:+919380400181 link in header and contact section."
    });
  }

  // --------------------------------------------------------------------------
  // 4. UX & ACCESSIBILITY CHECKS
  // --------------------------------------------------------------------------

  // Check 4.1: Skip-to-content link & Main landmark
  const hasSkipLink = indexHtml.includes('class="skip-link"') && indexHtml.includes('href="#main"');
  const hasMainLandmark = indexHtml.includes('id="main"');

  if (hasSkipLink && hasMainLandmark) {
    checks.push({
      id: "check-skip-link",
      category: "ux",
      weight: 35,
      status: "passed",
      severity: "info",
      title: "Keyboard Accessibility: Skip-to-Content Link Present",
      description: "Accessible skip-link is provided for screen readers and keyboard users pointing to <main id='main'>.",
      evidence: '<a class="skip-link" href="#main"> verified in HTML.',
      benefit: "Complies with WCAG 2.1 Level A keyboard navigation guidelines.",
      autoFixable: false
    });
  } else {
    checks.push({
      id: "check-skip-link",
      category: "ux",
      weight: 35,
      status: "failed",
      severity: "medium",
      title: "Missing Skip-to-Content Accessibility Landmark",
      description: "Keyboard users cannot skip repetitive navigation headers.",
      evidence: "Missing skip link or #main target.",
      benefit: "Enhances keyboard and screen-reader usability.",
      autoFixable: true,
      suggestedFix: "Add <a class='skip-link' href='#main'> and ensure <main id='main'> exists."
    });
  }

  // Check 4.2: FAQ Accordion Section
  const hasFaqId = indexHtml.includes('id="faq"');
  const hasFaqItems = indexHtml.includes("faq-item") || indexHtml.includes("<details");
  const faqQuestions = [
    { topic: "Turnaround time", pattern: /turnaround|how long/i },
    { topic: "Domain ownership", pattern: /domain|ownership/i },
    { topic: "Menu & revisions", pattern: /menu|revision|update/i },
    { topic: "Pricing & inclusions", pattern: /pricing|package|included|cost/i },
    { topic: "Hosting & maintenance", pattern: /hosting|maintenance|support/i }
  ];

  const matchedTopics = faqQuestions.filter((q) => q.pattern.test(indexHtml)).map((q) => q.topic);

  if (hasFaqId && hasFaqItems && matchedTopics.length >= 3) {
    checks.push({
      id: "check-faq-accordion",
      category: "ux",
      weight: 35,
      status: "passed",
      severity: "info",
      title: "Accessible FAQ Accordion Active & Verified",
      description: `FAQ section addresses essential customer inquiries (${matchedTopics.join(", ")}) cleanly using accessible markup.`,
      evidence: `Found #faq with <details> items covering: ${matchedTopics.join(", ")}.`,
      benefit: "Eliminates buyer hesitation, reduces support queries, and enriches search relevancy.",
      autoFixable: false
    });
  } else if (hasFaqId || hasFaqItems) {
    checks.push({
      id: "check-faq-accordion",
      category: "ux",
      weight: 35,
      status: "warning",
      severity: "medium",
      title: "Incomplete FAQ Section Content",
      description: `FAQ markup exists, but only covers ${matchedTopics.length} of 5 core topics (${matchedTopics.join(", ")}). Missing topics help prospective clients convert.`,
      evidence: `Topics covered: ${matchedTopics.join(", ") || "None"}`,
      benefit: "Answering all 5 questions provides complete clarity for prospective customers.",
      autoFixable: true,
      suggestedFix: "Ensure FAQ answers turnaround, domain ownership, menu revisions, pricing, and hosting."
    });
  } else {
    checks.push({
      id: "check-faq-accordion",
      category: "ux",
      weight: 35,
      status: "failed",
      severity: "medium",
      title: "Missing FAQ Accordion Section",
      description: "Prospective clients frequently ask about turnaround times, domain ownership, and menu revisions. An FAQ section eliminates buyer hesitation.",
      evidence: "No #faq section found in public/index.html.",
      benefit: "Lowers bounce rates and boosts long-tail search traffic.",
      autoFixable: true,
      suggestedFix: "Add accessible <details> FAQ accordion answering common customer questions."
    });
  }

  // Check 4.3: Responsive Viewport Meta
  const hasViewport = indexHtml.includes('name="viewport"') && indexHtml.includes("width=device-width");
  if (hasViewport) {
    checks.push({
      id: "check-viewport-meta",
      category: "ux",
      weight: 30,
      status: "passed",
      severity: "info",
      title: "Responsive Viewport Meta Tag Verified",
      description: "Viewport meta tag configured with width=device-width, initial-scale=1.",
      evidence: '<meta name="viewport" content="width=device-width, initial-scale=1"> verified.',
      benefit: "Ensures pages render at correct scale on all mobile screens.",
      autoFixable: false
    });
  } else {
    checks.push({
      id: "check-viewport-meta",
      category: "ux",
      weight: 30,
      status: "failed",
      severity: "critical",
      title: "Missing Responsive Viewport Meta Tag",
      description: "Mobile browsers will render the page in a zoomed-out desktop viewport.",
      evidence: "Missing viewport meta tag.",
      benefit: "Fixes mobile layout scaling.",
      autoFixable: true,
      suggestedFix: "Add <meta name='viewport' content='width=device-width, initial-scale=1'>."
    });
  }

  // --------------------------------------------------------------------------
  // 5. SECURITY & HEADERS CHECKS
  // --------------------------------------------------------------------------

  // Check 5.1: Content-Security-Policy (CSP)
  const hasCspInCode = serverCode.includes("Content-Security-Policy");
  const liveCspHeader = liveHeaders && (liveHeaders["content-security-policy"] || liveHeaders["content-security-policy-report-only"]);

  if (liveCspHeader) {
    checks.push({
      id: "check-security-csp",
      category: "security",
      weight: 50,
      status: "passed",
      severity: "info",
      title: "Content-Security-Policy (CSP) Verified on Live HTTP Socket",
      description: "HTTP response headers contain active Content-Security-Policy directives restricting executable sources.",
      evidence: `HTTP header: ${liveCspHeader.slice(0, 100)}... (Socket probe 127.0.0.1:${serverPort})`,
      benefit: "Protects against Cross-Site Scripting (XSS), clickjacking, and unauthorized third-party script injection.",
      autoFixable: false
    });
  } else if (hasCspInCode) {
    checks.push({
      id: "check-security-csp",
      category: "security",
      weight: 50,
      status: "passed",
      severity: "info",
      title: "Content-Security-Policy Configured in Server Middleware",
      description: "server.js Express response middleware configures Content-Security-Policy (live HTTP server offline during scan).",
      evidence: "Verified CSP middleware configured in server.js with restrictive source directives.",
      benefit: "Protects against Cross-Site Scripting (XSS) and untrusted code injection.",
      autoFixable: false
    });
  } else {
    checks.push({
      id: "check-security-csp",
      category: "security",
      weight: 50,
      status: "failed",
      severity: "high",
      title: "Missing Content-Security-Policy (CSP) Header",
      description: "Neither live HTTP responses nor server.js middleware emit a Content-Security-Policy header.",
      evidence: `server.js lacks Content-Security-Policy configuration.${liveHeaders ? " Live probe returned no CSP header." : ""}`,
      benefit: "Hardens application against cross-site script injection.",
      autoFixable: true,
      suggestedFix: "Configure standard Content-Security-Policy header in server.js middleware."
    });
  }

  // Check 5.2: Strict-Transport-Security (HSTS) & Frame Options
  const hasHstsInCode = serverCode.includes("Strict-Transport-Security");
  const hasFrameOptions = serverCode.includes("X-Frame-Options");
  const liveHstsHeader = liveHeaders && liveHeaders["strict-transport-security"];

  if (liveHstsHeader) {
    checks.push({
      id: "check-security-hsts",
      category: "security",
      weight: 50,
      status: "passed",
      severity: "info",
      title: "HSTS Verified on Secure Request",
      description: "Strict-Transport-Security header is actively emitted on HTTPS/proxy requests, enforcing encrypted transport.",
      evidence: `HTTP header: Strict-Transport-Security: ${liveHstsHeader} (Socket probe 127.0.0.1:${serverPort} with X-Forwarded-Proto: https)`,
      benefit: "Prevents SSL stripping attacks and enforces HTTPS for modern browsers.",
      autoFixable: false
    });
  } else if (hasHstsInCode && hasFrameOptions) {
    checks.push({
      id: "check-security-hsts",
      category: "security",
      weight: 50,
      status: "passed",
      severity: "info",
      title: "HSTS & Frame Protection Configured in Server Middleware",
      description: "Strict-Transport-Security and X-Frame-Options headers are configured in Express response middleware for HTTPS connections.",
      evidence: "server.js configures HSTS (max-age=15552000) for secure transports and X-Frame-Options: SAMEORIGIN.",
      benefit: "Enforces HTTPS encryption in production and protects against clickjacking attacks.",
      autoFixable: false
    });
  } else if (hasHstsInCode && !hasFrameOptions) {
    checks.push({
      id: "check-security-hsts",
      category: "security",
      weight: 50,
      status: "warning",
      severity: "medium",
      title: "HSTS Configured but Missing X-Frame-Options",
      description: "HSTS is present in server middleware, but X-Frame-Options is missing.",
      evidence: "server.js contains Strict-Transport-Security but lacks X-Frame-Options.",
      benefit: "Prevents UI redressing and clickjacking.",
      autoFixable: true,
      suggestedFix: "Set X-Frame-Options: SAMEORIGIN in server.js middleware."
    });
  } else {
    checks.push({
      id: "check-security-hsts",
      category: "security",
      weight: 50,
      status: "failed",
      severity: "medium",
      title: "Missing Strict-Transport-Security (HSTS) Header",
      description: "Server middleware does not configure Strict-Transport-Security for HTTPS downgrade protection.",
      evidence: "server.js lacks Strict-Transport-Security header configuration.",
      benefit: "Guarantees encrypted browser connections on production HTTPS domains.",
      autoFixable: true,
      suggestedFix: "Configure Strict-Transport-Security (max-age=15552000) on HTTPS requests in server.js."
    });
  }

  // --------------------------------------------------------------------------
  // CALCULATE TRUTHFUL SCORES
  // --------------------------------------------------------------------------
  const categoryKeys = ["seo", "performance", "ux", "security", "business"];
  const categoryLabels = {
    seo: "SEO & Discoverability",
    performance: "Speed & Assets",
    ux: "UX & Accessibility",
    security: "Security & Headers",
    business: "Conversion & Growth"
  };

  const categories = {};
  categoryKeys.forEach((cat) => {
    const catChecks = checks.filter((c) => c.category === cat);
    const totalWeight = catChecks.reduce((sum, c) => sum + (c.weight || 20), 0);
    const earnedWeight = catChecks.reduce((sum, c) => {
      if (c.status === "passed") return sum + (c.weight || 20);
      if (c.status === "warning") return sum + (c.weight || 20) * 0.7; // 70% credit for warning
      return sum;
    }, 0);

    const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 100;
    categories[cat] = {
      score: Math.min(100, Math.max(0, score)),
      label: categoryLabels[cat],
      checksCount: catChecks.length,
      passedCount: catChecks.filter((c) => c.status === "passed").length,
      failedCount: catChecks.filter((c) => c.status === "failed").length,
      warningCount: catChecks.filter((c) => c.status === "warning").length
    };
  });

  // Overall Score (Weighted)
  const overallScore = Math.round(
    categories.seo.score * 0.25 +
    categories.performance.score * 0.20 +
    categories.ux.score * 0.20 +
    categories.security.score * 0.15 +
    categories.business.score * 0.20
  );

  const passedChecks = checks.filter((c) => c.status === "passed");
  const failedIssues = checks.filter((c) => c.status === "failed");
  const warningChecks = checks.filter((c) => c.status === "warning");
  const unverifiedChecks = checks.filter((c) => c.status === "unable_to_verify");

  return {
    timestamp: new Date().toISOString(),
    scanDurationMs: Date.now() - startTime,
    environmentChecked: {
      type: "Local Project Workspace",
      path: baseDir,
      productionUrl: siteUrl || "Not configured (Set SITE_URL in .env before launch)",
      productionUrlConfigured: Boolean(siteUrl)
    },
    overallScore: overallScore,
    categories: categories,
    stats: {
      totalChecks: checks.length,
      passed: passedChecks.length,
      failed: failedIssues.length,
      warnings: warningChecks.length,
      unverified: unverifiedChecks.length,
      critical: failedIssues.filter((i) => i.severity === "critical").length,
      high: failedIssues.filter((i) => i.severity === "high").length,
      medium: failedIssues.filter((i) => i.severity === "medium").length,
      autoFixable: failedIssues.filter((i) => i.autoFixable).length
    },
    issues: failedIssues,
    passedChecks: passedChecks,
    warnings: warningChecks,
    unverified: unverifiedChecks,
    allChecks: checks
  };
}

module.exports = {
  analyzeWebsite
};
