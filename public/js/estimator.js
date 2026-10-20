/* Cost guide. Turns three answers into one of the four budget ranges that already exist in the request form,
   so the suggestion can never be a price the server would reject. Nothing is sent anywhere from here. */
(function () {
  "use strict";

  var root = document.getElementById("estimator");
  var budget = document.getElementById("budget");
  var typeSelect = document.getElementById("type");
  if (!root || !budget || !typeSelect) return;

  var fallback = document.getElementById("estFallback");
  var typeBox = document.getElementById("estType");
  var rangeEl = document.getElementById("estRange");
  var summaryEl = document.getElementById("estSummary");
  var useBtn = document.getElementById("estUse");
  var segments = root.querySelectorAll(".est-meter span");
  var ticks = root.querySelectorAll(".est-ticks span");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Budget ranges come straight from the request form (option 0 is the "Choose a range" placeholder). */
  var ranges = Array.prototype.slice.call(budget.options, 1).map(function (o) {
    return o.value;
  });
  if (ranges.length !== 4) return;

  var types = Array.prototype.slice.call(typeSelect.options, 1).map(function (o) {
    return o.value;
  });
  var pageLabels = ["1 to 3 pages", "4 to 7 pages", "8 or more pages"];

  types.forEach(function (name, i) {
    var label = document.createElement("label");
    label.className = "chip";
    var input = document.createElement("input");
    input.type = "radio";
    input.name = "estType";
    input.value = name;
    if (i === 0) input.checked = true;
    var span = document.createElement("span");
    span.textContent = name;
    label.appendChild(input);
    label.appendChild(span);
    typeBox.appendChild(label);
  });

  var current = { index: 0, type: types[0], pages: 0, extras: [] };
  var swapTimer = null;

  function compute() {
    var type = root.querySelector('input[name="estType"]:checked');
    var pages = root.querySelector('input[name="estPages"]:checked');
    var score = Number(pages ? pages.value : 0);
    var extras = [];
    root.querySelectorAll('input[name="estExtra"]:checked').forEach(function (box) {
      score += Number(box.value) || 0;
      extras.push(box.getAttribute("data-label"));
    });
    // Real estate and medical sites usually need more structure, so they start one half step higher.
    if (type && (type.value === "Real Estate" || type.value === "Medical")) score += 0.5;

    var index = score < 1.5 ? 0 : score < 3.5 ? 1 : score < 5.5 ? 2 : 3;
    current = {
      index: index,
      type: type ? type.value : types[0],
      pages: pages ? Number(pages.value) : 0,
      extras: extras
    };
    render();
  }

  function render() {
    segments.forEach(function (seg, i) {
      seg.classList.toggle("on", i <= current.index);
    });
    ticks.forEach(function (tick, i) {
      tick.classList.toggle("on", i === current.index);
    });

    var next = ranges[current.index];
    var line =
      current.type +
      " website, " +
      pageLabels[current.pages] +
      (current.extras.length ? ", with " + current.extras.join(", ") : ", no extras") +
      ".";

    if (reduce) {
      rangeEl.textContent = next;
      summaryEl.textContent = line;
      return;
    }
    rangeEl.classList.add("swap");
    clearTimeout(swapTimer);
    swapTimer = setTimeout(function () {
      rangeEl.textContent = next;
      summaryEl.textContent = line;
      rangeEl.classList.remove("swap");
    }, 160);
  }

  root.addEventListener("change", compute);

  useBtn.addEventListener("click", function () {
    budget.value = ranges[current.index];
    if (types.indexOf(current.type) >= 0) typeSelect.value = current.type;

    var note =
      "Website size: " +
      pageLabels[current.pages] +
      ". Extras: " +
      (current.extras.length ? current.extras.join(", ") : "none") +
      ".";
    var box = document.getElementById("description");
    if (box && box.value.indexOf("Website size:") === -1) {
      box.value = (box.value ? box.value.trim() + "\n\n" : "") + note;
    }

    var target = document.getElementById("request");
    if (target) target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    var name = document.getElementById("name");
    if (name) {
      window.setTimeout(function () {
        name.focus({ preventScroll: true });
      }, reduce ? 0 : 600);
    }
  });

  root.hidden = false;
  if (fallback) fallback.hidden = true;
  current.index = 0;
  compute();
})();
