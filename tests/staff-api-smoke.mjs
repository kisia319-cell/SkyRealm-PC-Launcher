import assert from "node:assert/strict";

const base = "https://jaaguprbfrzrcwuusher.supabase.co";
const anonKey = "sb_publishable_MKaNYqw3r0BLa1GTDVvjfw_yU3Wd6QL";
const staff = base + "/functions/v1/skyrealm-staff";

async function call(route, options = {}) {
  const url = new URL(staff);
  url.searchParams.set("route", route);
  const headers = { apikey: anonKey, ...(options.token ? { Authorization: "Bearer " + options.token } : {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

const health = await call("/health");
assert.equal(health.status, 200);
assert.equal(health.body.status, "ok");
assert.equal(health.body.service, "skyrealm-staff");

for (const route of ["/api/staff/me", "/api/staff/players"]) {
  const result = await call(route);
  assert.equal(result.status, 401, route + " must reject a request without a session.");
  assert.equal(result.body?.error?.code, "NO_SESSION");
}
for (const route of ["/api/staff/me", "/api/staff/players"]) {
  const result = await call(route, { token: "definitely-invalid-access-token" });
  assert.equal(result.status, 401, route + " must reject a forged or invalid session.");
  assert.equal(result.body?.error?.code, "INVALID_SESSION");
}
const unauthorizedMutation = await call("/api/staff/moderators", {
  method: "POST",
  token: "definitely-invalid-access-token",
  body: { user_id: "53413a08-00bb-4654-81f8-94c27341dee1", action: "grant" },
});
assert.equal(unauthorizedMutation.status, 401);
assert.equal(unauthorizedMutation.body?.error?.code, "INVALID_SESSION");

const table = new URL(base + "/rest/v1/skyrealm_staff_roles");
table.searchParams.set("select", "user_id,role");
const direct = await fetch(table, { headers: { apikey: anonKey }, cache: "no-store" });
if (direct.ok) {
  const rows = await direct.json();
  assert.deepEqual(rows, [], "The role table must not disclose staff assignments to anonymous clients.");
} else {
  assert.ok([401,403].includes(direct.status), "Direct client reads must be denied.");
}
console.log("SkyRealm staff API health, invalid-session rejection and private-role-table tests passed.");

