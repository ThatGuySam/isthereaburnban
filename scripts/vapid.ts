// @ts-nocheck -- Bun script; node types are not installed for the Worker typecheck.
// Generate a VAPID key pair for web push and append it to .dev.vars (gitignored).
// Usage: bun scripts/vapid.ts   (refuses to overwrite existing keys)
import { existsSync, readFileSync, appendFileSync } from "node:fs";

const b64url = (b: ArrayBuffer) => Buffer.from(b).toString("base64url");
const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
const publicKey = b64url((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
const privateKey = ((await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey).d!;

const path = ".dev.vars";
const current = existsSync(path) ? readFileSync(path, "utf8") : "";
if (/^VAPID_PRIVATE_KEY=/m.test(current)) {
  console.error(".dev.vars already has VAPID keys; not overwriting.");
  process.exit(1);
}
appendFileSync(path, `${current && !current.endsWith("\n") ? "\n" : ""}VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\n`);
console.log(`Wrote VAPID keys to ${path}. Public key:\n${publicKey}`);
