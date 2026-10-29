import assert from "node:assert/strict";

const base = (process.env.SKYREALM_AUTH_URL || "https://jaaguprbfrzrcwuusher.supabase.co/functions/v1/skyrealm-auth").replace(/\/+$/, "");
const url = (route) => base + "?route=" + encodeURIComponent(route);

const healthResponse = await fetch(url("/health"));
assert.equal(healthResponse.status, 200, "health endpoint should return HTTP 200");
const health = await healthResponse.json();
assert.equal(health.status, "ok");
assert.equal(health.service, "skyrealm-auth");

const invalidResponse = await fetch(url("/api/auth/register"), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "x", email: "invalid", password: "short" }),
});
assert.equal(invalidResponse.status, 400);
const invalid = await invalidResponse.json();
assert.equal(invalid?.detail?.code, "INVALID_USERNAME");
const recoveryResponse = await fetch(url("/api/auth/forgot-password"), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "not-an-email" }),
});
assert.equal(recoveryResponse.status, 400, "password recovery should reject malformed email");
const recovery = await recoveryResponse.json();
assert.equal(recovery?.detail?.code, "INVALID_EMAIL");

console.log("SkyRealm auth smoke tests passed.");
