# SkyRealm Co-op Technical Specification

Status: Phase 1 foundation. Approved product settings: 8 players, invite-code-only access, shared existing difficulty/death rules, owner-toggle PvP (default OFF), pause world when owner leaves.

## Requirements
- Preserve single-player unchanged: existing local saves, localStorage format, backup import/export, and game loop remain intact. Co-op is an explicit separate mode; never auto-migrate solo worlds.
- Authenticated accounts only. A room has one owner, an unguessable invite code (store only a hash), max 8 concurrent players, and explicit membership.
- Lifecycle: create -> lobby -> running -> paused when owner disconnects/leaves -> owner resumes. On owner departure, stop simulation, persist a snapshot, notify/pause remaining clients. Only owner resumes.
- Server-authoritative world state. Clients send input intents; server validates movement, combat, cooldowns, inventory, crafting, building permissions and resource transactions. Never trust client balances or whole-world snapshots.
- Supabase Realtime Presence is for roster/heartbeat; Broadcast for transient events. Postgres stores durable room/member/settings/snapshot data. Use private channels and membership-aware RLS.
- PvP is owner-only, persisted, defaults OFF, and checked server-side for every player attack.
- Shared death uses the existing selected world difficulty rules, applied consistently.
- Reconnect revalidates auth, membership and room status, then loads latest durable snapshot. Owner can kick; kicked players cannot rejoin using the old code. Audit owner actions.

## Architecture
- Reuse existing Supabase Auth.
- Add a dedicated co-op Edge Function; do not put room logic into the existing auth function.
- Postgres tables: co_op_rooms, co_op_members, co_op_world_snapshots. Enable RLS on all. Clients get membership-scoped reads only; authoritative writes go through validated server endpoints/RPC.
- Private Realtime channels; disable public channel access in project settings before production.
- Isolated multiplayer client adapter loaded only in co-op mode; leave solo code path untouched.

## Initial schema design (not applied yet)
- co_op_rooms: id uuid PK, owner_id FK auth.users, invite_code_hash unique, status lobby|running|paused|closed, max_players constrained to 8, pvp_enabled default false, world_id, world_version, timestamps.
- co_op_members: room_id/user_id FKs, role owner|member, status active|kicked|left, joined_at/last_seen_at, unique(room_id,user_id).
- co_op_world_snapshots: room_id FK, version bigint, payload jsonb, created_at, unique(room_id,version).
- Index active membership, owner, room status and snapshot version. No client writes to authoritative room/world data.

## Delivery phases
1. Foundation (current): isolated feature branch, this spec, multiplayer adapter contract and unit tests. No production DB mutation yet.
2. Secure backend: review JWT/Auth, dedicated Edge Function, SQL migration + RLS/private Realtime policies; implement create/join/leave/kick/resume/PvP/pause; verify with SQL/RLS and API tests.
3. Lobby/networking: Network Game menu, room create/join code, lobby roster, connection states, Presence, rate-limited input broadcasts; test two clients before eight.
4. Shared simulation: movement/animation, then world interactions, mobs, loot, day/night; server-validated inventory/crafting/trading/combat/death; PvP toggle.
5. Reliability/release: owner pause, snapshots, reconnect, kick/code rotation, load tests at 2/4/8, latency/packet loss/dupe exploit tests; opt-in release, solo remains default.

## Acceptance criteria
- Existing solo worlds continue to open/save/export/import unchanged.
- Two authenticated accounts can join the same invite-only room and see each other.
- Ninth concurrent player rejected.
- Invalid/expired/revoked codes rejected without disclosing room existence.
- Non-members cannot read snapshots or subscribe to private channels.
- Non-owner cannot kick/resume/change PvP.
- Owner departure pauses simulation and saves a recoverable snapshot.
- PvP defaults off and server enforces toggle.
- Death matches selected difficulty.
- Client cannot mint items/currency or overwrite authoritative state.
