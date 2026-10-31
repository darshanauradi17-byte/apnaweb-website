(function () {
  "use strict";

  var STATUSES = ["New", "Contacted", "In Progress", "Delivered"];

  var loginScreen = document.getElementById("loginScreen");
  var appScreen = document.getElementById("appScreen");
  var loginForm = document.getElementById("loginForm");
  var loginError = document.getElementById("loginError");
  var loginBtn = document.getElementById("loginBtn");
  var rowsEl = document.getElementById("rows");
  var emptyEl = document.getElementById("empty");
  var statsEl = document.getElementById("stats");
  var searchEl = document.getElementById("search");
  var filterEl = document.getElementById("statusFilter");
  var listError = document.getElementById("listError");
  var messagesEl = document.getElementById("messages");
  var messagesEmpty = document.getElementById("messagesEmpty");
  var detail = document.getElementById("detail");
  var toastEl = document.getElementById("toast");

  var submissions = [];
  var messages = [];
  var toastTimer = null;
  var pollTimer = null;

  /* The sign-in itself lives in an HttpOnly cookie that scripts cannot read.
     Only this short-lived CSRF token is kept, and only in memory. */
  var csrf = "";

  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  /* ---------- helpers ---------- */

  function el(tag, props, children) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      if (key === "text") node.textContent = props[key];
      else if (key === "class") node.className = props[key];
      else if (key === "dataset") {
        Object.keys(props.dataset).forEach(function (k) {
          node.dataset[k] = props.dataset[k];
        });
      } else node.setAttribute(key, props[key]);
    });
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function toast(message, isError) {
    toastEl.textContent = message;
    toastEl.className = "toast" + (isError ? " error" : "");
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.hidden = true;
    }, 3500);
  }

  function formatDate(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  /* Encodes everything except "@", so stored text can never add mail headers such as ?cc= to the link. */
  function mailtoHref(address) {
    return "mailto:" + encodeURIComponent(String(address || "")).replace(/%40/g, "@");
  }

  function phoneParts(raw) {
    var digits = String(raw || "").replace(/\D/g, "");
    if (digits.length === 10) digits = "91" + digits;
    if (digits.length < 10) return null;
    var national = digits.slice(-10);
    var pretty =
      digits.indexOf("91") === 0 && digits.length === 12
        ? "+91 " + national.slice(0, 5) + " " + national.slice(5)
        : "+" + digits;
    return { tel: "+" + digits, wa: digits, pretty: pretty };
  }

  function api(url, options) {
    options = options || {};
    var headers = { Accept: "application/json" };
    var method = (options.method || "GET").toUpperCase();
    if (method !== "GET") {
      headers["Content-Type"] = "application/json";
      headers["X-CSRF-Token"] = csrf;
    }

    return fetch(url, {
      method: method,
      headers: headers,
      body: method === "GET" || method === "DELETE" ? undefined : options.body || "{}",
      cache: "no-store",
      credentials: "same-origin"
    }).then(function (response) {
      if (response.status === 401) {
        signedOut("Your session ended. Please sign in again.");
        throw new Error("auth");
      }
      return response
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          if (!response.ok) {
            throw new Error(data.message || "Something went wrong.");
          }
          return data;
        });
    });
  }

  /* ---------- screens ---------- */

  function showApp() {
    loginScreen.hidden = true;
    appScreen.hidden = false;
    loadAll();
    clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      if (!document.hidden && !detail.open) loadAll(true);
    }, 60000);
  }

  function showLogin(message) {
    appScreen.hidden = true;
    loginScreen.hidden = false;
    if (message) {
      loginError.textContent = message;
      loginError.hidden = false;
    }
  }

  function signedOut(message) {
    csrf = "";
    clearInterval(pollTimer);
    submissions = [];
    messages = [];
    rowsEl.textContent = "";
    messagesEl.textContent = "";
    if (detail.open) detail.close();
    showLogin(message);
  }

  /* ---------- login ---------- */

  loginForm.addEventListener("submit", function (event) {
    event.preventDefault();
    loginError.hidden = true;

    var username = loginForm.elements.username.value.trim();
    var password = loginForm.elements.password.value;

    if (!username || !password) {
      loginError.textContent = "Enter your username and password.";
      loginError.hidden = false;
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = "Signing in...";

    fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username: username, password: password }),
      credentials: "same-origin"
    })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            if (!response.ok || !data.csrf) {
              throw new Error(data.message || "Could not sign in.");
            }
            return data;
          });
      })
      .then(function (data) {
        csrf = data.csrf;
        loginForm.reset();
        showApp();
      })
      .catch(function (error) {
        loginError.textContent =
          error.message === "Failed to fetch"
            ? "Could not reach the server. Check your connection."
            : error.message;
        loginError.hidden = false;
      })
      .then(function () {
        loginBtn.disabled = false;
        loginBtn.textContent = "Sign in";
      });
  });

  document.getElementById("logoutBtn").addEventListener("click", function () {
    api("/api/logout", { method: "POST" })
      .catch(function () {})
      .then(function () {
        signedOut();
      });
  });

  /* ---------- loading ---------- */

  function loadAll(quiet) {
    listError.hidden = true;
    return Promise.all([api("/api/submissions"), api("/api/messages")])
      .then(function (results) {
        submissions = (results[0].submissions || []).slice().sort(function (a, b) {
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        messages = (results[1].messages || []).slice().sort(function (a, b) {
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        renderStats();
        renderRows();
        renderMessages();
      })
      .catch(function (error) {
        if (error.message === "auth") return;
        if (!quiet) {
          listError.textContent = "Could not load requests. " + error.message;
          listError.hidden = false;
        }
      });
  }

  document.getElementById("refreshBtn").addEventListener("click", function () {
    loadAll().then(function () {
      if (listError.hidden) toast("Refreshed");
    });
  });

  var exportBtn = document.getElementById("exportBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", function () {
      window.location.href = "/api/submissions/export.csv";
    });
  }

  /* ---------- stats ---------- */

  function renderStats() {
    var counts = { New: 0, Contacted: 0, "In Progress": 0, Delivered: 0 };
    submissions.forEach(function (item) {
      var status = STATUSES.indexOf(item.status) >= 0 ? item.status : "New";
      counts[status] += 1;
    });

    statsEl.textContent = "";
    [["Total requests", submissions.length]]
      .concat(
        STATUSES.map(function (s) {
          return [s, counts[s]];
        })
      )
      .forEach(function (pair, i) {
        var card = el("div", { class: "stat" }, [
          el("strong", { text: String(pair[1]) }),
          el("span", { text: pair[0] })
        ]);
        card.style.setProperty("--i", String(i));
        if (i > 0) card.setAttribute("data-s", pair[0]);
        statsEl.appendChild(card);
        if (!statsShown) countUp(card.querySelector("strong"), pair[1]);
      });
    statsShown = true;
  }

  /* Numbers count up the first time the dashboard opens (skipped for reduced motion). */
  var statsShown = false;
  function countUp(node, target) {
    if (!node || target < 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var start = null;
    function step(now) {
      if (start === null) start = now;
      var t = Math.min((now - start) / 700, 1);
      node.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) window.requestAnimationFrame(step);
    }
    node.textContent = "0";
    window.requestAnimationFrame(step);
  }

  /* ---------- requests ---------- */

  function matches(item, query, status) {
    var itemStatus = STATUSES.indexOf(item.status) >= 0 ? item.status : "New";
    if (status !== "all" && itemStatus !== status) return false;
    if (!query) return true;
    var haystack = [
      item.requestId,
      item.ownerName,
      item.businessName,
      item.phone,
      item.email,
      item.city,
      item.businessType,
      item.requirements
    ]
      .join(" ")
      .toLowerCase();
    return haystack.indexOf(query) >= 0;
  }

  function renderRows() {
    var query = searchEl.value.trim().toLowerCase();
    var status = filterEl.value;
    var list = submissions.filter(function (item) {
      return matches(item, query, status);
    });

    rowsEl.textContent = "";

    if (!list.length) {
      emptyEl.textContent = submissions.length
        ? "No requests match your search."
        : "No requests yet. New requests from the website will appear here.";
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    list.forEach(function (item) {
      var key = item.id || item.requestId;
      var phone = phoneParts(item.phone);
      var itemStatus = STATUSES.indexOf(item.status) >= 0 ? item.status : "New";

      var select = el("select", {
        class: "status-select",
        "aria-label": "Status for " + (item.businessName || "request"),
        dataset: { id: key }
      });
      select.setAttribute("data-status", itemStatus);
      STATUSES.forEach(function (s) {
        var option = el("option", { value: s, text: s });
        if (s === itemStatus) option.selected = true;
        select.appendChild(option);
      });

      var contact = el("div", { class: "contact-links" });
      if (phone) {
        contact.appendChild(el("a", { href: "tel:" + phone.tel, text: phone.pretty }));
        contact.appendChild(
          el("a", {
            href: "https://wa.me/" + phone.wa,
            target: "_blank",
            rel: "noopener noreferrer",
            text: "WhatsApp"
          })
        );
      } else if (item.phone) {
        contact.appendChild(el("span", { text: item.phone }));
      }
      if (item.email) {
        contact.appendChild(el("a", { href: mailtoHref(item.email), text: item.email }));
      }

      var viewBtn = el("button", {
        class: "link-btn",
        type: "button",
        text: "View details",
        dataset: { action: "view", id: key }
      });

      var needs = [
        el("div", { class: "cell-name", text: item.businessType || "Not specified" }),
        item.budget ? el("div", { class: "cell-sub", text: item.budget }) : null,
        el("div", { class: "excerpt", text: item.requirements || "" }),
        viewBtn
      ];

      var del = el("button", {
        class: "btn btn-danger btn-sm",
        type: "button",
        text: "Delete",
        dataset: { action: "delete", id: key }
      });

      var tr = el("tr", {}, [
        el("td", { "data-label": "Request" }, [
          el("div", { class: "cell-id", text: item.requestId || "No ID" }),
          el("div", { class: "cell-sub", text: formatDate(item.createdAt) })
        ]),
        el("td", { "data-label": "Customer" }, [
          el("div", { class: "cell-name", text: item.ownerName || "" }),
          el("div", { text: item.businessName || "" }),
          el("div", { class: "cell-sub", text: item.city || "" })
        ]),
        el("td", { "data-label": "Contact" }, [contact]),
        el("td", { "data-label": "Needs" }, needs),
        el("td", { "data-label": "Status" }, [select]),
        el("td", { "data-label": "Actions" }, [del])
      ]);
      rowsEl.appendChild(tr);
    });
  }

  searchEl.addEventListener("input", renderRows);
  filterEl.addEventListener("change", renderRows);

  function findItem(id) {
    return submissions.find(function (item) {
      return String(item.id || item.requestId) === String(id);
    });
  }

  rowsEl.addEventListener("change", function (event) {
    var select = event.target.closest(".status-select");
    if (!select) return;

    var item = findItem(select.dataset.id);
    var previous = item ? item.status : "New";
    var next = select.value;
    select.disabled = true;

    api("/api/submissions/" + encodeURIComponent(select.dataset.id), {
      method: "PATCH",
      body: JSON.stringify({ status: next })
    })
      .then(function (data) {
        if (item) {
          item.status = next;
          item.updatedAt = data.submission ? data.submission.updatedAt : item.updatedAt;
        }
        toast("Status changed to " + next);
        renderStats();
        renderRows();
      })
      .catch(function (error) {
        if (error.message === "auth") return;
        select.value = previous;
        select.disabled = false;
        toast(error.message, true);
      });
  });

  rowsEl.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-action]");
    if (!button) return;
    var item = findItem(button.dataset.id);
    if (!item) return;

    if (button.dataset.action === "view") {
      openDetail(item);
      return;
    }

    if (button.dataset.action === "delete") {
      var label = item.businessName || item.requestId || "this request";
      if (!window.confirm("Delete " + label + "? This cannot be undone.")) return;

      button.disabled = true;
      api("/api/submissions/" + encodeURIComponent(button.dataset.id), { method: "DELETE" })
        .then(function () {
          submissions = submissions.filter(function (entry) {
            return entry !== item;
          });
          toast("Request deleted");
          renderStats();
          renderRows();
        })
        .catch(function (error) {
          if (error.message === "auth") return;
          button.disabled = false;
          toast(error.message, true);
        });
    }
  });

  /* ---------- details dialog ---------- */

  function openDetail(item) {
    var phone = phoneParts(item.phone);
    var rows = [
      ["Request ID", item.requestId || "No ID"],
      ["Submitted", formatDate(item.createdAt)],
      ["Customer", item.ownerName],
      ["Business", item.businessName],
      ["Category", item.businessType],
      ["City", item.city],
      ["Phone", phone ? phone.pretty : item.phone],
      ["Email", item.email],
      ["Budget", item.budget],
      ["Status", item.status]
    ];

    document.getElementById("detailTitle").textContent = item.businessName || "Request";
    var list = document.getElementById("detailList");
    list.textContent = "";
    rows.forEach(function (row) {
      if (!row[1]) return;
      list.appendChild(el("dt", { text: row[0] }));
      list.appendChild(el("dd", { text: row[1] }));
    });
    document.getElementById("detailText").textContent = item.requirements || "Nothing provided.";

    /* Admin notes */
    var notesArea = document.getElementById("detailNotes");
    var saveNotesBtn = document.getElementById("saveNotesBtn");
    if (notesArea && saveNotesBtn) {
      notesArea.value = item.adminNotes || "";
      saveNotesBtn.onclick = function () {
        saveNotesBtn.disabled = true;
        saveNotesBtn.textContent = "Saving...";
        var key = item.id || item.requestId;
        api("/api/submissions/" + encodeURIComponent(key), {
          method: "PATCH",
          body: JSON.stringify({ status: item.status, adminNotes: notesArea.value })
        })
          .then(function (data) {
            item.adminNotes = notesArea.value;
            if (data.submission) item.updatedAt = data.submission.updatedAt;
            toast("Notes saved");
          })
          .catch(function (error) {
            if (error.message !== "auth") toast(error.message, true);
          })
          .then(function () {
            saveNotesBtn.disabled = false;
            saveNotesBtn.textContent = "Save notes";
          });
      };
    }

    if (typeof detail.showModal === "function") detail.showModal();
  }

  document.getElementById("detailClose").addEventListener("click", function () {
    detail.close();
  });

  detail.addEventListener("click", function (event) {
    if (event.target === detail) detail.close();
  });

  /* ---------- messages ---------- */

  function renderMessages() {
    messagesEl.textContent = "";
    messagesEmpty.hidden = messages.length > 0;

    messages.forEach(function (message) {
      var del = el("button", {
        class: "btn btn-danger btn-sm",
        type: "button",
        text: "Delete",
        dataset: { id: message.id }
      });

      messagesEl.appendChild(
        el("article", { class: "message" }, [
          el("div", { class: "message-head" }, [
            el("strong", { text: message.name }),
            el("span", { class: "cell-sub", text: formatDate(message.createdAt) })
          ]),
          el("a", { href: mailtoHref(message.email), text: message.email }),
          el("p", { text: message.message }),
          del
        ])
      );
    });
  }

  messagesEl.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-id]");
    if (!button) return;
    if (!window.confirm("Delete this message? This cannot be undone.")) return;

    button.disabled = true;
    api("/api/messages/" + encodeURIComponent(button.dataset.id), { method: "DELETE" })
      .then(function () {
        messages = messages.filter(function (m) {
          return m.id !== button.dataset.id;
        });
        renderMessages();
        toast("Message deleted");
      })
      .catch(function (error) {
        if (error.message === "auth") return;
        button.disabled = false;
        toast(error.message, true);
      });
  });

  /* ---------- start: restore an existing session, otherwise show the login ---------- */

  fetch("/api/session", { headers: { Accept: "application/json" }, cache: "no-store", credentials: "same-origin" })
    .then(function (response) {
      return response.ok ? response.json() : null;
    })
    .then(function (data) {
      if (data && data.csrf) {
        csrf = data.csrf;
        showApp();
      } else {
        showLogin();
      }
    })
    .catch(function () {
      showLogin();
    });
})();
