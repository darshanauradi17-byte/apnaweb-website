/* Motion layer. Everything here is decoration: the site works the same without it,
   and nothing runs when the visitor has asked their device for reduced motion. */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var header = document.querySelector(".site-header");
  var bar = document.querySelector(".scroll-progress");
  var steps = document.querySelector(".steps");
  var ticking = false;

  /* ---------- scroll: header state, progress bar, steps line ---------- */

  function onScroll() {
    ticking = false;
    var y = window.scrollY || 0;
    if (header) header.classList.toggle("is-scrolled", y > 8);

    if (bar) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.setProperty("--progress", max > 0 ? Math.min(1, y / max).toFixed(4) : "0");
    }

    if (steps) {
      var rect = steps.getBoundingClientRect();
      var vh = window.innerHeight;
      var p = (vh * 0.7 - rect.top) / Math.max(rect.height, 1);
      p = Math.max(0, Math.min(1, p));
      steps.style.setProperty("--p", p.toFixed(3));
      var items = steps.querySelectorAll("li");
      items.forEach(function (li, i) {
        li.classList.toggle("is-lit", p >= i / Math.max(items.length - 1, 1) - 0.02 && p > 0);
      });
    }
  }

  window.addEventListener(
    "scroll",
    function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(onScroll);
      }
    },
    { passive: true }
  );
  window.addEventListener("resize", onScroll);
  onScroll();

  /* ---------- active menu link while scrolling ---------- */

  var spyLinks = Array.prototype.slice.call(document.querySelectorAll('.primary-nav a[href^="#"]:not(.btn)'));
  var spyMap = spyLinks
    .map(function (link) {
      var target = document.querySelector(link.getAttribute("href"));
      return target ? { link: link, target: target } : null;
    })
    .filter(Boolean);
  if (spyMap.length && "IntersectionObserver" in window) {
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          spyMap.forEach(function (item) {
            var on = item.target === entry.target;
            item.link.classList.toggle("is-active", on);
            if (on) item.link.setAttribute("aria-current", "location");
            else item.link.removeAttribute("aria-current");
          });
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    spyMap.forEach(function (item) {
      spy.observe(item.target);
    });
  }

  /* ---------- mobile quick-action bar: slides up after the first screen ---------- */

  var mbar = document.getElementById("mbar");
  var request = document.getElementById("request");
  if (mbar) {
    var showBar = function () {
      var past = (window.scrollY || 0) > 520;
      var rect = request ? request.getBoundingClientRect() : null;
      var inForm = rect ? rect.top < window.innerHeight * 0.6 && rect.bottom > window.innerHeight * 0.4 : false;
      mbar.classList.toggle("is-on", past && !inForm);
    };
    window.addEventListener("scroll", showBar, { passive: true });
    window.addEventListener("resize", showBar);
    showBar();
  }

  /* ---------- reveal on scroll (cards, steps, shots, contact) ---------- */

  /* More things that glide in as they scroll into view. */
  document
    .querySelectorAll(".section-head, .est-controls, .est-result, .form-card, .track-form, .contact-grid > div:first-child")
    .forEach(function (el) {
      if (!el.hasAttribute("data-reveal")) el.setAttribute("data-reveal", "");
    });

  var revealEls = document.querySelectorAll("[data-reveal]");
  if (revealEls.length) {
    if (reduce || !("IntersectionObserver" in window)) {
      revealEls.forEach(function (el) {
        el.classList.add("is-in");
      });
    } else {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-in");
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
      );
      revealEls.forEach(function (el, i) {
        var group = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : i;
        el.style.setProperty("--d", String(Math.min(group, 5)));
        io.observe(el);
      });
    }
  }

  if (reduce) return;

  /* ---------- rotating word in the headline ---------- */

  var rotator = document.querySelector(".rotator");
  if (rotator && rotator.dataset.words) {
    var words = rotator.dataset.words.split("|");
    var readable = document.createElement("span");
    readable.className = "sr-only";
    readable.textContent = rotator.textContent;
    rotator.parentNode.insertBefore(readable, rotator);
    rotator.setAttribute("aria-hidden", "true");

    var current = document.createElement("span");
    current.className = "rotator-word";
    current.textContent = words[0];
    rotator.textContent = "";
    rotator.appendChild(current);

    var wordIndex = 0;
    window.setInterval(function () {
      if (document.hidden) return;
      current.classList.add("is-out");
      window.setTimeout(function () {
        wordIndex = (wordIndex + 1) % words.length;
        current.textContent = words[wordIndex];
        current.classList.remove("is-out");
        current.style.animation = "none";
        void current.offsetWidth;
        current.style.animation = "";
      }, 300);
    }, 2600);
  }

  /* ---------- pointer effects (mouse and trackpad only) ---------- */

  if (!window.matchMedia("(hover: hover)").matches) return;

  var hero = document.querySelector(".hero");
  if (hero) {
    hero.addEventListener(
      "pointermove",
      function (event) {
        var rect = hero.getBoundingClientRect();
        hero.style.setProperty("--mx", (((event.clientX - rect.left) / rect.width) * 100).toFixed(1) + "%");
        hero.style.setProperty("--my", (((event.clientY - rect.top) / rect.height) * 100).toFixed(1) + "%");
      },
      { passive: true }
    );
  }

  /* Main buttons lean slightly toward the cursor. */
  document.querySelectorAll(".btn-primary").forEach(function (btn) {
    btn.addEventListener("pointermove", function (event) {
      var rect = btn.getBoundingClientRect();
      var x = (event.clientX - rect.left - rect.width / 2) / rect.width;
      var y = (event.clientY - rect.top - rect.height / 2) / rect.height;
      btn.style.transform = "translate(" + (x * 6).toFixed(1) + "px," + (y * 4).toFixed(1) + "px)";
    });
    btn.addEventListener("pointerleave", function () {
      btn.style.transform = "";
    });
  });

  document.querySelectorAll(".tilt").forEach(function (el) {
    el.addEventListener("pointermove", function (event) {
      var rect = el.getBoundingClientRect();
      var x = (event.clientX - rect.left) / rect.width - 0.5;
      var y = (event.clientY - rect.top) / rect.height - 0.5;
      el.style.transform = "perspective(900px) rotateX(" + (-y * 5).toFixed(2) + "deg) rotateY(" + (x * 6).toFixed(2) + "deg)";
    });
    el.addEventListener("pointerleave", function () {
      el.style.transform = "";
    });
  });
})();
