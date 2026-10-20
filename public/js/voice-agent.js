/* BrandX Web assistant: typed or spoken questions, answers on screen and (optionally) read aloud.
   It only appears when the server reports that the assistant is configured. */
(function () {
  "use strict";

  var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var canSpeak = "speechSynthesis" in window;
  var history = [];
  var busy = false;
  var listening = false;
  var readAloud = false;
  var recognition = null;
  var lastWasVoice = false;
  var els = {};

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function icon(id, className) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "icon " + (className || ""));
    svg.setAttribute("aria-hidden", "true");
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#" + id);
    svg.appendChild(use);
    return svg;
  }

  function addMessage(role, text, extraClass) {
    var row = el("div", "va-msg va-" + role + (extraClass ? " " + extraClass : ""));
    row.textContent = text;
    els.log.appendChild(row);
    els.log.scrollTop = els.log.scrollHeight;
    return row;
  }

  function speak(text) {
    if (!canSpeak || !readAloud) return;
    window.speechSynthesis.cancel();
    var utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = document.documentElement.lang || "en-IN";
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }

  function setBusy(value) {
    busy = value;
    els.send.disabled = value;
    els.panel.classList.toggle("is-busy", value);
  }

  function send(text, fromVoice) {
    text = (text || "").trim();
    if (!text || busy) return;
    lastWasVoice = Boolean(fromVoice);
    addMessage("user", text);
    els.input.value = "";
    setBusy(true);
    var typing = addMessage("bot", "", "va-typing");
    for (var i = 0; i < 3; i += 1) typing.appendChild(el("span", "va-dot"));

    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ message: text, history: history.slice(-6) })
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
        typing.remove();
        if (!result.ok || !result.data.reply) {
          addMessage("bot", result.data.message || "The assistant could not answer. Please use the request form or WhatsApp.", "va-error");
          return;
        }
        history.push({ role: "user", text: text });
        history.push({ role: "assistant", text: result.data.reply });
        addMessage("bot", result.data.reply);
        if (lastWasVoice) speak(result.data.reply);
      })
      .catch(function () {
        typing.remove();
        addMessage("bot", "We could not reach the server. Check your connection and try again.", "va-error");
      })
      .then(function () {
        setBusy(false);
        els.input.focus();
      });
  }

  function stopListening() {
    if (recognition && listening) recognition.stop();
  }

  function startListening() {
    if (!SpeechRec || busy) return;
    if (listening) return stopListening();
    if (canSpeak) window.speechSynthesis.cancel();
    recognition = new SpeechRec();
    recognition.lang = navigator.language || "en-IN";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    var finalText = "";

    recognition.onstart = function () {
      listening = true;
      els.mic.classList.add("is-live");
      els.mic.setAttribute("aria-pressed", "true");
      els.mic.setAttribute("aria-label", "Stop listening");
      els.input.placeholder = "Listening...";
    };
    recognition.onresult = function (event) {
      var interim = "";
      for (var i = event.resultIndex; i < event.results.length; i += 1) {
        var piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += piece;
        else interim += piece;
      }
      els.input.value = (finalText + interim).trim();
    };
    recognition.onerror = function (event) {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        addMessage("bot", "Microphone access is blocked. Allow it in your browser, or type your question.", "va-error");
      }
    };
    recognition.onend = function () {
      listening = false;
      els.mic.classList.remove("is-live");
      els.mic.setAttribute("aria-pressed", "false");
      els.mic.setAttribute("aria-label", "Speak your question");
      els.input.placeholder = "Ask about your website";
      var heard = els.input.value.trim();
      if (heard) send(heard, true);
    };
    try {
      recognition.start();
    } catch (error) {
      listening = false;
    }
  }

  function open() {
    els.panel.hidden = false;
    els.launcher.setAttribute("aria-expanded", "true");
    window.requestAnimationFrame(function () {
      els.panel.classList.add("is-open");
    });
    els.input.focus();
  }

  function close() {
    stopListening();
    if (canSpeak) window.speechSynthesis.cancel();
    els.panel.classList.remove("is-open");
    els.launcher.setAttribute("aria-expanded", "false");
    window.setTimeout(function () {
      if (!els.panel.classList.contains("is-open")) els.panel.hidden = true;
    }, 220);
    els.launcher.focus();
  }

  function build() {
    els.launcher = el("button", "va-launcher");
    els.launcher.type = "button";
    els.launcher.setAttribute("aria-expanded", "false");
    els.launcher.setAttribute("aria-controls", "vaPanel");
    els.launcher.appendChild(icon("i-spark"));
    els.launcher.appendChild(el("span", "", "Ask BrandX"));

    els.panel = el("section", "va-panel");
    els.panel.id = "vaPanel";
    els.panel.hidden = true;
    els.panel.setAttribute("role", "dialog");
    els.panel.setAttribute("aria-label", "BrandX Web assistant");

    var head = el("header", "va-head");
    var title = el("div", "va-title");
    title.appendChild(el("strong", "", "BrandX assistant"));
    title.appendChild(el("span", "", "Ask about websites for your business"));
    head.appendChild(title);

    var tools = el("div", "va-tools");
    if (canSpeak) {
      var speaker = el("button", "va-iconbtn");
      speaker.type = "button";
      speaker.setAttribute("aria-pressed", "false");
      speaker.setAttribute("aria-label", "Read answers aloud");
      speaker.title = "Read answers aloud";
      speaker.appendChild(icon("i-speaker"));
      speaker.addEventListener("click", function () {
        readAloud = !readAloud;
        speaker.setAttribute("aria-pressed", String(readAloud));
        speaker.classList.toggle("is-on", readAloud);
        if (!readAloud) window.speechSynthesis.cancel();
      });
      tools.appendChild(speaker);
    }
    var closeBtn = el("button", "va-iconbtn");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close assistant");
    closeBtn.appendChild(icon("i-close"));
    closeBtn.addEventListener("click", close);
    tools.appendChild(closeBtn);
    head.appendChild(tools);

    els.log = el("div", "va-log");
    els.log.setAttribute("role", "log");
    els.log.setAttribute("aria-live", "polite");
    addMessage("bot", "Hi, I am the BrandX Web assistant. Ask me about websites for a shop, clinic, restaurant or school. For a quote, use the request form on this page.");

    var chips = el("div", "va-chips");
    ["What does a website include?", "How does tracking work?", "Do I need photos?"].forEach(function (q) {
      var chip = el("button", "va-chip", q);
      chip.type = "button";
      chip.addEventListener("click", function () {
        send(q, false);
      });
      chips.appendChild(chip);
    });

    var form = el("form", "va-form");
    form.setAttribute("novalidate", "");
    els.input = el("input", "va-input");
    els.input.type = "text";
    els.input.maxLength = 800;
    els.input.placeholder = "Ask about your website";
    els.input.setAttribute("aria-label", "Your question");
    els.input.autocomplete = "off";

    if (SpeechRec) {
      els.mic = el("button", "va-mic");
      els.mic.type = "button";
      els.mic.setAttribute("aria-pressed", "false");
      els.mic.setAttribute("aria-label", "Speak your question");
      els.mic.appendChild(icon("i-mic"));
      els.mic.addEventListener("click", startListening);
      form.appendChild(els.mic);
    }

    els.send = el("button", "va-send");
    els.send.type = "submit";
    els.send.setAttribute("aria-label", "Send");
    els.send.appendChild(icon("i-send"));
    form.appendChild(els.input);
    form.appendChild(els.send);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      send(els.input.value, false);
    });

    var note = el(
      "p",
      "va-note",
      "AI answers can be wrong, so check details with us. Voice input uses your browser's speech service."
    );

    els.panel.appendChild(head);
    els.panel.appendChild(els.log);
    els.panel.appendChild(chips);
    els.panel.appendChild(form);
    els.panel.appendChild(note);

    els.launcher.addEventListener("click", function () {
      if (els.panel.hidden) open();
      else close();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !els.panel.hidden) close();
    });

    document.body.appendChild(els.launcher);
    document.body.appendChild(els.panel);
  }

  fetch("/api/chat/status", { headers: { Accept: "application/json" }, cache: "no-store" })
    .then(function (response) {
      return response.ok ? response.json() : { enabled: false };
    })
    .then(function (data) {
      if (data && data.enabled) build();
    })
    .catch(function () {
      /* assistant stays hidden if the server cannot be reached */
    });
})();
