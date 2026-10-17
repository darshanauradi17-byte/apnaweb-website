"use strict";

const { analyzeWebsite } = require("./analyzer");

/**
 * GODMODE Proactive Intelligence Engine
 * Dynamically checks live website status and generates high-ROI recommendations,
 * clearly distinguishing between pending upgrades and already-active features.
 */
function getProactiveRecommendations(baseDir) {
  let audit = null;
  if (baseDir) {
    try {
      audit = analyzeWebsite(baseDir);
    } catch (e) {
      // fallback
    }
  }

  const allRecs = [
    {
      id: "rec-price-estimator",
      title: "Interactive Price & Scope Estimator",
      category: "Conversion & UX",
      roi: "High ROI",
      effort: "Instant (1-Click)",
      description: "Small business owners often hesitate if they are unsure about budget. This interactive 3-step calculator lets them choose business type and features, calculates an estimated package, and populates the request form automatically.",
      impact: "Higher quality leads and pre-qualified requirements.",
      actionId: "biz-price-estimator",
      checkId: "check-price-estimator"
    },
    {
      id: "rec-seo-schema",
      title: "Schema.org LocalBusiness & ProfessionalService JSON-LD",
      category: "SEO & Rankings",
      roi: "High ROI",
      effort: "Instant (1-Click)",
      description: "Injects structured JSON-LD data into your <head> specifying your service catalog, phone, and founder using verified project facts (no fake addresses or ratings).",
      impact: "Higher Google Search visibility for local web design queries.",
      actionId: "seo-schema-jsonld",
      checkId: "check-schema-jsonld"
    },
    {
      id: "rec-whatsapp-float",
      title: "Floating WhatsApp Quick-Connect Action",
      category: "Conversion & Growth",
      roi: "Very High ROI",
      effort: "Instant (1-Click)",
      description: "Sticky floating WhatsApp button with an animated online badge lets mobile visitors start chatting immediately without having to search for contact details.",
      impact: "+35% to +50% increase in direct mobile enquiries.",
      actionId: "biz-whatsapp-quickaction",
      checkId: "check-whatsapp-btn"
    },
    {
      id: "rec-broken-images",
      title: "Verify Service Card Images",
      category: "Performance & UX",
      roi: "Critical Check",
      effort: "Instant (1-Click)",
      description: "Ensure all 6 business card images on the home page point to verified high-resolution assets on disk.",
      impact: "Zero 404 console errors, professional brand presentation.",
      actionId: "fix-missing-images",
      checkId: "check-service-images"
    },
    {
      id: "rec-canonical-og",
      title: "Canonical URL & Rich Social Media Previews",
      category: "SEO & Branding",
      roi: "Medium ROI",
      effort: "Instant (1-Click)",
      description: "Adds canonical URL protection to prevent duplicate content indexing and provides Open Graph + Twitter card image previews whenever links are shared on WhatsApp or social networks.",
      impact: "Consolidates domain authority and increases social click-throughs.",
      actionId: "seo-canonical-tag",
      checkId: "check-canonical-url"
    },
    {
      id: "rec-sitemap",
      title: "Generate Public sitemap.xml",
      category: "SEO & Crawling",
      roi: "Quick Win",
      effort: "Instant (1-Click)",
      description: "Creates an XML sitemap complying with Google guidelines to ensure all website pages are rapidly indexed by search engine crawlers.",
      impact: "Faster indexation of page updates.",
      actionId: "seo-sitemap-xml",
      checkId: "check-sitemap-xml"
    },
    {
      id: "rec-security-headers",
      title: "Elevate Security to A-Grade (HSTS & CSP)",
      category: "Security",
      roi: "Security Win",
      effort: "Instant (1-Click)",
      description: "Hardens the Express server with Content-Security-Policy, Strict-Transport-Security (HSTS), and refined frame controls.",
      impact: "Protection against content sniffing, cross-site injections, and SSL downgrade attacks.",
      actionId: "sec-csp-header",
      checkId: "check-security-csp"
    }
  ];

  if (!audit) return allRecs;

  // Annotate recommendations with real verified status
  return allRecs.map((rec) => {
    const isPassed = audit.passedChecks.some((c) => c.id === rec.checkId);
    return Object.assign({}, rec, {
      isApplied: isPassed,
      statusLabel: isPassed ? "✅ Verified Active" : "⚡ Available Upgrade"
    });
  });
}

module.exports = {
  getProactiveRecommendations
};
