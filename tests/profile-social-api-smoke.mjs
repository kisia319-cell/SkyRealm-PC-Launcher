import assert from "node:assert/strict";
const base="https://jaaguprbfrzrcwuusher.supabase.co/functions/v1/skyrealm-social";
const url=new URL(base); url.searchParams.set("route","/api/social/profile");
const response=await fetch(url,{headers:{apikey:"sb_publishable_MKaNYqw3r0BLa1GTDVvjfw_yU3Wd6QL"}});
assert.equal(response.status,401,"Social profile endpoint must reject unauthenticated access");
console.log("SkyRealm social API auth smoke test passed.");
