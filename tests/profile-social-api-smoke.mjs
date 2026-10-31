import assert from "node:assert/strict";
const base="https://jaaguprbfrzrcwuusher.supabase.co/functions/v1/skyrealm-social";
const url=new URL(base); url.searchParams.set("route","/api/social/profile");
const headers={apikey:"sb_publishable_MKaNYqw3r0BLa1GTDVvjfw_yU3Wd6QL"};
const response=await fetch(url,{headers});
assert.equal(response.status,401,"Social profile endpoint must reject unauthenticated access");
for(const [route,method,body] of [
  ["/api/social/room-invites","GET"],
  ["/api/social/room-invites","POST",{room_id:"123e4567-e89b-12d3-a456-426614174000",friend_id:"123e4567-e89b-12d3-a456-426614174001"}],
  ["/api/social/room-invites/respond","POST",{invite_id:"123e4567-e89b-12d3-a456-426614174002",decision:"accept"}]
]) {
  const endpoint=new URL(base);endpoint.searchParams.set("route",route);
  const result=await fetch(endpoint,{method,headers:{...headers,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
  assert.equal(result.status,401,"Unauthenticated route must be rejected: "+route);
}
console.log("SkyRealm social API auth smoke test passed.");
