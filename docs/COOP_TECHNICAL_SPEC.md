# SkyRealm Co-op Technical Specification

Status: Phase 2 backend deployed; Phase 3 lobby UI and auth-token bridge added on \`feature/co-op-foundation\`. Settings: 8 players, invite-code-only access, shared death mode, owner-toggle PvP (default OFF), pause when owner leaves.

## Agreed behavior
- Single-player remains the default and its current save format, localStorage, import/export and simulation loop are not changed.
- Authenticated accounts only. Rooms are invite-code-only and capped at 8 members.
- Invitation code is generated with Web Crypto, displayed once to the owner, and only its SHA-256 hash is stored.
- A user may occupy one active/offline room membership at a time. Room membership changes are transactional.
- Join attempts are limited to 8 per 15 minutes per account.
- Explicit owner leave pauses the room and marks the owner offline; the previous state (lobby/running) is saved so resume restores the correct state. During a running room, members check owner heartbeat; >30 seconds stale causes a pause.
- PvP is a persisted owner-only setting, defaults OFF.
- Shared death is stored as \`shared\`; the existing difficulty-specific death rules must be wired into the shared simulation phase.

## Backend delivered
- Dedicated Supabase Edge Function \`skyrealm-coop\`, independent of the existing \`skyrealm-auth\`.
- Routes: \`/health\`, \`/api/coop/create\`, \`/api/coop/join\`, \`/api/coop/current\`, \`/api/coop/leave\`, \`/api/coop/resume\`, \`/api/coop/pvp\`, \`/api/coop/heartbeat\`, \`/api/coop/recover-owner\`.
- The function validates the bearer session with Supabase Auth; the service-role key stays server-side.
- New tables: \`co_op_rooms\`, \`co_op_members\`, \`co_op_world_snapshots\`, \`co_op_audit_events\`, and private rate-limit table \`private.co_op_join_limits\`.
- RLS is enabled. Authenticated clients have no direct SELECT grants; service-role backend policies and RPCs handle authoritative data.
- Private Realtime channel authorization policies are defined on \`realtime.messages\` for topic \`skyrealm:room:<uuid>\`. Project-wide “Allow public access” must still be switched OFF in dashboard before enabling live Realtime channels.
- GitHub Actions verifies the core rules, JS parse checks and Python launcher syntax.

## Lobby UI delivered
- New main-menu entry “Кооператив”.
- Create a room and receive a one-time 8-character invite code; copy it to clipboard.
- Join an existing room by entering its invite code.
- View room status and member roster, refresh automatically, leave, resume as owner, and change the saved PvP setting as owner.
- In the desktop runner, launcher Auth session is passed through the child process environment and exposed to the game once via the PyWebView API. It is not put in query parameters or saved to disk.
- Browser preview uses the same-origin session/local storage token.
- Supabase Realtime Presence tracks online state on a private `skyrealm:room:<uuid>` channel; roster falls back to authenticated polling every 5 seconds.
- A first cosmetic position prototype broadcasts player coordinates at up to 8 updates/second. Remote avatars are drawn for matching difficulty and surface/trade mode; position packets are range-checked and discarded after 6.5 seconds. These client broadcasts are untrusted cosmetic data only and cannot modify world state, inventory, damage or saves.

## Not yet playable as a shared-world game
- Player position/avatar exchange is a cosmetic prototype only; there is not yet an authoritative shared world. Local world generation, obstacles, enemy state, loot, inventory, crafting or combat are not synchronized.
- The snapshot table is scaffolding only and currently starts with an empty JSON payload. A world serializer and save/restore protocol are not implemented.
- Realtime Presence is wired for online state and Broadcast carries cosmetic positions. The roster still refreshes from authenticated API every 5 seconds for durable membership names. Movement is not server-authoritative and must not be used for combat or progression.
- PvP preference is stored and owner-gated, but does not yet gate damage because combat is still local. Do not advertise PvP combat as working.
- Kick/revoke-code management, owner handoff, rate limits by IP, and eight-player load testing remain for later hardening.
- No release is published and main is unchanged.

## Next phases
1. Prove authenticated two-client create/join/leave/resume flow.
2. Add private Realtime Presence/Broadcast and test 2 clients; then 4 and 8.
3. Add authoritative snapshot serialization and shared simulation beginning with remote movement and player presence.
4. Sync world interactions, mobs, loot, day/night, inventory/crafting/trading and combat; enforce PvP and shared death rules server-side.
5. Add kick/code rotation, reconnect, resilience/load/exploit tests, and then release opt-in.

## Security and release checklist
- Disable Realtime public-channel access at project level before subscribing to private channels.
- Validate all player inputs server-side; never trust client balances, inventory or whole-world snapshots.
- Keep service-role key in Supabase Edge Function secrets only.
- Keep single-player as the default path and run its regression tests before merging.
