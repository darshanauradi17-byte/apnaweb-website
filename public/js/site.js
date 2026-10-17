(function () {
  "use strict";

  /* ---------- helpers ---------- */

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  function clearFieldErrors(form) {
    form.querySelectorAll("[data-error-for]").forEach(function (el) {
      el.textContent = "";
    });
    form.querySelectorAll("[aria-invalid]").forEach(function (el) {
      el.removeAttribute("aria-invalid");
    });
  }

  function showFieldErrors(form, errors) {
    var first = null;
    Object.keys(errors || {}).forEach(function (name) {
      var holder = form.querySelector('[data-error-for="' + name + '"]');
      var input = form.elements[name];
      if (holder) holder.textContent = errors[name];
      if (input) {
        input.setAttribute("aria-invalid", "true");
        if (!first) first = input;
      }
    });
    if (first) first.focus();
  }

  function showAlert(el, message) {
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
  }

  function hideAlert(el) {
    if (!el) return;
    el.textContent = "";
    el.hidden = true;
  }

  function postJson(url, payload) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    }).then(function (response) {
      return response
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          return { ok: response.ok, status: response.status, data: data };
        });
    });
  }

  function formPayload(form) {
    var payload = {};
    new FormData(form).forEach(function (value, key) {
      payload[key] = typeof value === "string" ? value.trim() : value;
    });
    return payload;
  }

  /* Native validation first, so people see browser messages for empty fields. */
  function validateNative(form) {
    var invalid = null;
    Array.prototype.forEach.call(form.elements, function (el) {
      var holder = form.querySelector('[data-error-for="' + el.name + '"]');
      if (!el.willValidate || !holder) return;
      if (el.checkValidity()) {
        holder.textContent = "";
        el.removeAttribute("aria-invalid");
        return;
      }
      var message = el.validationMessage;
      if (el.validity.valueMissing) message = "This field is required.";
      if (el.validity.typeMismatch && el.type === "email") message = "Enter a valid email address.";
      if (el.validity.patternMismatch && el.type === "tel") message = "Enter a 10 digit mobile number.";
      holder.textContent = message;
      el.setAttribute("aria-invalid", "true");
      if (!invalid) invalid = el;
    });
    if (invalid) invalid.focus();
    return !invalid;
  }

  var NETWORK_MESSAGE =
    "We could not reach the server. Check your internet connection and try again.";

  /* ---------- footer year ---------- */

  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  /* ---------- mobile menu ---------- */

  var toggle = $("#menuToggle");
  var nav = $("#primaryNav");

  function setMenu(open) {
    if (!toggle || !nav) return;
    nav.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      setMenu(toggle.getAttribute("aria-expanded") !== "true");
    });

    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) setMenu(false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && nav.classList.contains("open")) {
        setMenu(false);
        toggle.focus();
      }
    });

    document.addEventListener("click", function (event) {
      if (nav.classList.contains("open") && !event.target.closest(".header-inner")) {
        setMenu(false);
      }
    });

    window.matchMedia("(min-width: 861px)").addEventListener("change", function (query) {
      if (query.matches) setMenu(false);
    });
  }

  /* ---------- website request form ---------- */

  var requestForm = $("#requestForm");

  if (requestForm) {
    var requestCard = $("#requestCard");
    var successPanel = $("#successPanel");
    var formError = $("#formError");
    var submitBtn = $("#submitBtn");
    var lastRequestId = "";

    requestForm.addEventListener("submit", function (event) {
      event.preventDefault();
      hideAlert(formError);
      clearFieldErrors(requestForm);

      if (!validateNative(requestForm)) return;

      submitBtn.disabled = true;
      submitBtn.textContent = "Sending...";

      postJson("/api/submit", formPayload(requestForm))
        .then(function (result) {
          if (!result.ok) {
            if (result.data && result.data.errors) {
              showFieldErrors(requestForm, result.data.errors);
            }
            showAlert(
              formError,
              (result.data && result.data.message) || "Something went wrong. Please try again."
            );
            return;
          }

          lastRequestId = result.data.requestId;
          setText($("#successId"), lastRequestId);
          setText($("#successName"), requestForm.elements.ownerName.value.trim());
          requestForm.reset();
          requestCard.hidden = true;
          successPanel.hidden = false;
          $("#successTitle").focus();

          var trackInput = $("#trackInput");
          if (trackInput) trackInput.value = lastRequestId;
        })
        .catch(function () {
          showAlert(formError, NETWORK_MESSAGE);
        })
        .then(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = "Submit request";
        });
    });

    $("#copyIdBtn").addEventListener("click", function () {
      var label = $("#copyIdBtn span");
      function done(text) {
        label.textContent = text;
        setTimeout(function () {
          label.textContent = "Copy ID";
        }, 2000);
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(lastRequestId).then(
          function () {
            done("Copied");
          },
          function () {
            done("Copy failed");
          }
        );
      } else {
        done("Select the ID to copy");
      }
    });

    $("#newRequestBtn").addEventListener("click", function () {
      successPanel.hidden = true;
      requestCard.hidden = false;
      requestForm.elements.ownerName.focus();
    });
  }

  /* ---------- tracking ---------- */

  var trackForm = $("#trackForm");

  if (trackForm) {
    var trackInput = $("#trackInput");
    var trackBtn = $("#trackBtn");
    var trackError = $("#trackError");
    var trackResult = $("#trackResult");

    var STAGES = [
      { key: "New", title: "Request received", note: "We have your request and will contact you within 2 days." },
      { key: "Contacted", title: "We have contacted you", note: "We have reached out to you about this project. Keep an eye on your phone and email." },
      { key: "In Progress", title: "Website being built", note: "Your website is being built. We will share the first version for you to review." },
      { key: "Delivered", title: "Website delivered", note: "Your website is ready. Contact us if you would like any changes." }
    ];

    function formatDate(value) {
      var date = new Date(value);
      if (isNaN(date.getTime())) return "";
      return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    }

    function showTracking(data) {
      var index = STAGES.findIndex(function (s) {
        return s.key === data.status;
      });
      if (index < 0) index = 0;

      setText($("#trackId"), data.requestId);
      setText($("#trackBusiness"), data.businessName);

      var meta = [];
      if (data.city) meta.push(data.city);
      if (data.createdAt) meta.push("Submitted " + formatDate(data.createdAt));
      if (data.updatedAt && data.updatedAt !== data.createdAt) {
        meta.push("Updated " + formatDate(data.updatedAt));
      }
      setText($("#trackMeta"), meta.join(" | "));

      var list = $("#trackTimeline");
      list.textContent = "";
      STAGES.forEach(function (stage, i) {
        var li = document.createElement("li");
        var strong = document.createElement("strong");
        strong.textContent = stage.title;
        li.appendChild(strong);
        var state = document.createElement("span");
        if (i < index) {
          li.className = "done";
          state.textContent = "Done";
        } else if (i === index) {
          li.className = "current";
          li.setAttribute("aria-current", "step");
          state.textContent = "Current stage";
        } else {
          state.textContent = "Not started";
        }
        li.appendChild(state);
        list.appendChild(li);
      });

      setText($("#trackNote"), STAGES[index].note);
      trackResult.hidden = false;
    }

    function track(id) {
      hideAlert(trackError);
      trackResult.hidden = true;

      var clean = id.trim().toUpperCase().replace(/[.,;:!?\s]+$/, "");
      if (!clean) {
        showAlert(trackError, "Enter your request ID.");
        trackInput.focus();
        return;
      }

      trackBtn.disabled = true;
      trackBtn.textContent = "Checking...";

      fetch("/api/track/" + encodeURIComponent(clean), {
        headers: { Accept: "application/json" },
        cache: "no-store"
      })
        .then(function (response) {
          return response
            .json()
            .catch(function () {
              return {};
            })
            .then(function (data) {
              return { ok: response.ok, data: data };
            });
        })
        .then(function (result) {
          if (!result.ok) {
            showAlert(trackError, result.data.message || "Could not find that request.");
            return;
          }
          showTracking(result.data);
        })
        .catch(function () {
          showAlert(trackError, NETWORK_MESSAGE);
        })
        .then(function () {
          trackBtn.disabled = false;
          trackBtn.textContent = "Track request";
        });
    }

    trackForm.addEventListener("submit", function (event) {
      event.preventDefault();
      track(trackInput.value);
    });

    var goTrack = $("#goTrackBtn");
    if (goTrack) {
      goTrack.addEventListener("click", function () {
        if (trackInput.value) track(trackInput.value);
      });
    }

    var fromUrl = new URLSearchParams(window.location.search).get("requestId");
    if (fromUrl) {
      trackInput.value = fromUrl;
      track(fromUrl);
    }
  }

  /* ---------- portfolio contact form ---------- */

  var contactForm = $("#contactForm");

  if (contactForm) {
    var contactCard = $("#contactCard");
    var contactSuccess = $("#contactSuccess");
    var contactError = $("#contactError");
    var contactBtn = $("#contactBtn");

    contactForm.addEventListener("submit", function (event) {
      event.preventDefault();
      hideAlert(contactError);
      clearFieldErrors(contactForm);

      if (!validateNative(contactForm)) return;

      contactBtn.disabled = true;
      contactBtn.textContent = "Sending...";

      postJson("/api/contact", formPayload(contactForm))
        .then(function (result) {
          if (!result.ok) {
            if (result.data && result.data.errors) {
              showFieldErrors(contactForm, result.data.errors);
            }
            showAlert(
              contactError,
              (result.data && result.data.message) || "Something went wrong. Please try again."
            );
            return;
          }
          contactForm.reset();
          contactCard.hidden = true;
          contactSuccess.hidden = false;
          $("#contactSuccessTitle").focus();
        })
        .catch(function () {
          showAlert(contactError, NETWORK_MESSAGE);
        })
        .then(function () {
          contactBtn.disabled = false;
          contactBtn.textContent = "Send message";
        });
    });

    $("#contactAgain").addEventListener("click", function () {
      contactSuccess.hidden = true;
      contactCard.hidden = false;
      contactForm.elements.name.focus();
    });
  }
})();
