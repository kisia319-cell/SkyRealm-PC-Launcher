# SkyRealm Co-op Technical Specification

Status: Phase 2 backend foundation prepared. Product settings: 8 players, invite-code-only access, shared death rules, owner-controlled PvP (default OFF), pause when owner leaves or times out.

## Product requirements
- Preserve single-player unchanged: local saves, localStorage format, import/export, and existing game loop remain intact. Co-op is a separate, opt-in mode; never auto-migrate solo worlds.
- Authenticated accounts only. A room has one owner, a cryptographically random 8-character invitation code (only SHA-256 hash stored), max 8 concurrent members, and explicit membership.
- Owner departure: pause room immediately on explicit leave. For an ungraceful disconnect, other members call the recovery endpoint; if the owner's heartbeat is older than 30 seconds, the room is paused. Only the owner can resume.
- Owner-only PvP toggle, persisted and initially OFF.
- Shared death setting is persisted as \`shared\`; applying the existing difficulty-specific death penalty is part of the shared simulation phase.
- Clients must never write authoritative world/inventory/currency data. Future game actions are validated server-side.

## Backend architecture
- Reuse existing Supabase Auth. The co-op function independently validates the bearer access token against \`/auth/v1/user\`.
- Dedicated function: \`skyrealm-coop\`. Existing \`skyrealm-auth\` is not modified.
- New tables: \`public.co_op_rooms\`, \`public.co_op_members\`, \`public.co_op_world_snapshots\`, \`public.co_op_audit_events\`, and private rate-limit table \`private.co_op_join_limits\`.
- RLS enabled on all new tables. No direct client table grants; authoritative operations are exposed through a service-role-only RPC layer invoked by the Edge Function. The service-role key never enters the game client.
- Invitation codes are returned only once at room creation and never stored in plaintext. Joining is rate-limited to 8 attempts per 15 minutes per authenticated user.
- Operations prepared: create, join, get current room/roster, leave, resume, set PvP, heartbeat, recover from stale owner heartbeat.
- Room capacity is locked transactionally in the join RPC. Ninth player is rejected. One active room per account is enforced by a unique index.
- Private Realtime channel topic: \`skyrealm:room:<uuid>\`. Authorization policies require room membership; writes are denied while the room is paused. Realtime's project-level “Allow public access” setting still must be disabled in the dashboard before shipping private channels.

## Current data model
- \`co_op_rooms\`: owner, hashed code, lifecycle, fixed max 8, shared death mode, PvP flag, pause reason, timestamps.
- \`co_op_members\`: room/user unique key, owner/player role, active/offline/left status, joined and heartbeat timestamps.
- \`co_op_world_snapshots\`: one versioned JSON snapshot row per room; empty initial payload until world serializer is integrated.
- \`co_op_audit_events\`: durable room lifecycle and PvP changes.
- \`private.co_op_join_limits\`: authenticated join attempt window.

## Explicitly not finished yet
- No client lobby/UI or Realtime client adapter is wired into \`game/index.html\`.
- No shared world simulation, movement/combat/inventory/crafting sync, or authoritative snapshot serializer exists yet.
- Snapshot payload currently starts empty; no world state is saved by this phase.
- PvP setting is stored and owner-gated; attack-level PvP enforcement comes with the combat simulation phase.
- Kick/revoke-code management is designed but not exposed by this first backend pass.
- Co-op does not launch from the released game yet. Solo is unaffected.

## Delivery phases
1. Foundation: isolated feature branch, this spec, core helpers and unit tests.
2. Backend: additive SQL schema, RLS and Realtime membership policies, separate authenticated Edge Function, database audit trail and heartbeat pause recovery.
3. Lobby/networking: opt-in multiplayer menu, create/join code, player roster, private Realtime Presence and reconnect handling; prove 2-client flow before increasing to 8.
4. Shared simulation: movement, world interactions, mobs/loot/day-night, inventory/crafting/trading/combat/death and server-enforced PvP.
5. Reliability/release: snapshots, reconnect, kick/code rotation, 2/4/8-player load tests, latency/packet-loss/dupe testing, opt-in release.

## Acceptance criteria
- Existing solo worlds continue to open/save/export/import unchanged.
- Two authenticated accounts join one invite-only room; ninth concurrent player is rejected.
- Invalid, paused, closed or rate-limited invitation codes are rejected without revealing whether a room exists.
- Non-members cannot subscribe to room channels or access snapshots.
- Non-owner cannot resume or change PvP.
- Owner leaves or heartbeat expires, pausing the room; owner can resume.
- PvP defaults OFF and must be checked by server combat logic before player damage.
- Death follows the existing selected world difficulty.
- No client can mint inventory/currency or overwrite the authoritative world state.
