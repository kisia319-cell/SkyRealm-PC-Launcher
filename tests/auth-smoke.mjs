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


const invalidEmailResponse = await fetch(url("/api/auth/register"), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "valid_player", email: "not-an-email", password: "correct-horse-battery" }),
});
assert.equal(invalidEmailResponse.status, 400, "registration should reject malformed email");
const invalidEmail = await invalidEmailResponse.json();
assert.equal(invalidEmail?.detail?.code, "INVALID_EMAIL");

const invalidPasswordResponse = await fetch(url("/api/auth/register"), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username: "valid_player", email: "player@example.com", password: "short" }),
});
assert.equal(invalidPasswordResponse.status, 400, "registration should reject a short password");
const invalidPassword = await invalidPasswordResponse.json();
assert.equal(invalidPassword?.detail?.code, "INVALID_PASSWORD");

const invalidCodeResponse = await fetch(url("/api/auth/verify"), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "player@example.com", code: "abc" }),
});
assert.equal(invalidCodeResponse.status, 400, "verification should reject a malformed code");
const invalidCode = await invalidCodeResponse.json();
assert.equal(invalidCode?.detail?.code, "INVALID_CODE");


const shortResetResponse = await fetch(url("/api/auth/reset-password"), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ password: "short" }),
});
assert.equal(shortResetResponse.status, 400, "password reset should reject a short password before requiring a token");
const shortReset = await shortResetResponse.json();
assert.equal(shortReset?.detail?.code, "INVALID_PASSWORD");


const invalidRecoveryCodeResponse = await fetch(url("/api/auth/reset-password"), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "player@example.com", code: "abc", password: "new-valid-password" }),
});
assert.equal(invalidRecoveryCodeResponse.status, 400, "password reset should reject a malformed recovery code");
const invalidRecoveryCode = await invalidRecoveryCodeResponse.json();
assert.equal(invalidRecoveryCode?.detail?.code, "INVALID_RECOVERY_CODE");

console.log("SkyRealm auth smoke tests passed.");

const refreshWithoutToken = await fetch(url("/api/auth/refresh"), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({}),
});
assert.equal(refreshWithoutToken.status, 401, "refresh endpoint must reject a missing refresh token");
const refreshError = await refreshWithoutToken.json();
assert.equal(refreshError?.detail?.code, "NO_SESSION");
