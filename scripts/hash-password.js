"use strict";

/**
 * Creates a salted scrypt hash of the owner password.
 * Put the result in ADMIN_PASS_HASH, then delete ADMIN_PASS.
 *
 *   npm run hash-password
 */

const crypto = require("crypto");

function ask(prompt) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      let data = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => (data += chunk));
      process.stdin.on("end", () => resolve(data.replace(/\r?\n$/, "")));
      return;
    }
    process.stdout.write(prompt);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    let value = "";
    process.stdin.on("data", function onData(char) {
      if (char === "\u0003") process.exit(130);
      if (char === "\r" || char === "\n") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", onData);
        process.stdout.write("\n");
        return resolve(value);
      }
      if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
      else value += char;
    });
  });
}

(async function () {
  const password = await ask("New owner password (hidden): ");
  if (password.length < 12) {
    console.error("Use at least 12 characters. A long phrase of random words works well.");
    process.exit(1);
  }
  const N = 32768;
  const r = 8;
  const p = 1;
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: N, r: r, p: p, maxmem: 256 * N * r });
  const line = ["scrypt", N, r, p, salt.toString("base64url"), hash.toString("base64url")].join(":");
  console.log("\nAdd this to your .env file or host settings, and remove ADMIN_PASS:\n");
  console.log("ADMIN_PASS_HASH=" + line + "\n");
})();
