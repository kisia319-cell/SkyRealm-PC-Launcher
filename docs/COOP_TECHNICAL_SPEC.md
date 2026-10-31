# SkyRealm Co-op Technical Specification

Status: The co-op foundation remains on a feature branch. This branch adds host-authoritative shared enemy damage, boss health/death state and one-time shared loot claims. The matching SQL migration and Edge Function route are implemented in source but must pass CI and be deployed before players can use these actions. The feature remains Draft and is not merged into `main`.

## Agreed behavior
- Single-player remains the default and its current save format, localStorage, import/export and simulation loop are not changed.
- Authenticated accounts only. Rooms are invite-code-only and capped at 8 members.
- Invitation code is generated with Web Crypto, displayed once to the owner, and only its SHA-256 hash is stored.
- A user may occupy one active/offline room membership at a time. Room membership changes are transactional.
- Join attempts are limited to 8 per 15 minutes per account.
- Explicit owner leave pauses the room and marks the owner offline; the previous state (lobby/running) is saved so resume restores the correct state. During lobby or running state, members check owner heartbeat; >30 seconds stale pauses the room.
- PvP is a persisted owner-only setting, defaults OFF.
- Shared death is server-sequenced: an active member reports death once, and each active client applies the existing difficulty-specific respawn penalty once per unseen shared-death sequence. The server merges duplicate reports inside a short incident window.

## Shared map session foundation
- The room owner chooses one of the existing difficulties before creating the room and explicitly starts the session.
- Each participant entering a local world while the room is running is forced to the room difficulty and uses a co-op save key scoped to room + account. Original solo save keys and data are not overwritten.
- Surface geometry is deterministic from tile coordinates and selected difficulty, so matching difficulty produces the same static map layout. The mine layout uses a stable room-scoped identifier.
- Each player has a room-and-account scoped save key; personal inventory, wallet, health, hunger, XP, equipment, appearance and player position are not copied between accounts.
- Personal inventory, wallet, equipment, XP and health remain per-account. Shared world snapshots never include `resources`, `walletCents` or `equipment`.
- The room owner periodically publishes a filtered, versioned world snapshot. It includes supported world-owned state such as structures, farm plots, mine nodes, opened chests, cave/boss progress and world loot. Other members can restore that snapshot into their own co-op save without overwriting personal player data.
- Shared ordinary monsters are stored under `adventureQuestProgress.coopMonsters` with stable IDs, positions, health and AI timers. The owner simulates the shared mob state; guests send validated `damage_enemy` actions through the room queue. Boss health/death fields remain in the canonical snapshot. The owner validates the requesting guest's fresh Realtime position, room difficulty, target and attack reach before committing damage.
- Snapshot writes are owner-only, limited to 64 KB, restricted to a fixed list of world fields, and protected by optimistic version checks. Reads require active/offline room membership.
- All three treasure chest types use validated shared-world claims: outdoor chests, the cave vault and the final dungeon chest. Only one active room member can claim each object per room, enforced by a unique database key. Successful claims update the matching canonical snapshot flag; later attempts do not award duplicate loot.

## Database migration history
- The repository now tracks all 24 migration versions recorded by the connected Supabase project, in the same order (verified against the live migration history on 2026-10-30).
- The initial SkyRealm profile/Auth trigger migrations were restored from the deployed schema and function definition; they intentionally keep profile rows inaccessible through direct client RLS policies. The co-op public RPC functions were checked in PostgreSQL: `anon` and `authenticated` have no EXECUTE privilege; only `service_role` does. Private Realtime channel RLS checks room membership.
- The co-op base schema and its RPC/policy objects are split into the matching deployed migration versions. Shared clock, shared death, snapshots and the death-actor index each have their own version-aligned SQL file.

## Backend delivered
- Dedicated Supabase Edge Function `skyrealm-coop`, independent of the existing `skyrealm-auth`.
- Routes: `/health`, `/api/coop/create`, `/api/coop/join`, `/api/coop/start`, `/api/coop/current`, `/api/coop/leave`, `/api/coop/resume`, `/api/coop/pvp`, `/api/coop/heartbeat`, `/api/coop/recover-owner`, `/api/coop/clock`, `/api/coop/death`, `/api/coop/snapshot/get`, `/api/coop/snapshot/save`, `/api/coop/claim`, `/api/coop/actions/enqueue`, `/api/coop/actions/pending`, `/api/coop/actions/status`, `/api/coop/actions/commit`, `/api/coop/actions/commit-farm`, `/api/coop/actions/commit-mine`, `/api/coop/actions/reject`.
- The function validates the bearer session with Supabase Auth; the service-role key stays server-side.
- Shared monster/boss hits use `damage_enemy`; shared drop claims use `pickup_loot`. The owner commits enemy state and loot removal through `commit_co_op_enemy_action`. For pickup, the transaction verifies the exact shared drop ID in the previous snapshot, verifies the matching reward and ensures the drop is absent from the new snapshot. The action result is visible only to its requesting player, who receives the item or gold in their own personal inventory/balance.
- New tables: `co_op_rooms`, `co_op_members`, `co_op_world_snapshots`, `co_op_audit_events`, private rate-limit tables `private.co_op_join_limits` and `private.co_op_world_action_limits`, and `co_op_world_actions`.
- RLS is enabled. Authenticated clients have no direct SELECT grants; service-role backend policies and RPCs handle authoritative data. The world-death actor foreign key is indexed.
- Private Realtime channel authorization policies are defined on `realtime.messages` for topic `skyrealm:room:<uuid>`. The project-wide “Allow public access” setting has not yet been verified OFF in the dashboard and remains a release check.
- GitHub Actions verifies core rules, owner-only snapshot writes in the client adapter, client-to-Edge-Function route parity, the exact 24-file Supabase migration history, JavaScript syntax, Python launcher syntax, and deployed API health plus rejection of unauthenticated snapshot requests. The latest workflow for branch commit `6ccfb221bdb1d04e0bb0644b04657b424808428f` passed all 14 steps on 2026-10-30: [run 41024653032](https://github.com/kisia319-cell/SkyRealm-PC-Launcher/actions/runs/41024653032). This run includes the 24-migration history, mining/tree queue and client tests, solo-safe host pause, JavaScript syntax checks and protected API smoke tests.

## Lobby UI delivered
- New main-menu entry “Кооператив”.
- Create a room and receive a one-time 8-character invite code; copy it to clipboard.
- Join an existing room by entering its invite code.
- View room status and member roster, refresh automatically, leave, resume as owner, and change the saved PvP setting as owner.
- In the desktop runner, launcher Auth session is passed through the child process environment and exposed to the game once via the PyWebView API. It is not put in query parameters or saved to disk.
- Browser preview uses the same-origin session/local storage token.
- Supabase Realtime Presence tracks online state on a private `skyrealm:room:<uuid>` channel; roster falls back to authenticated polling every 5 seconds.
- A position prototype broadcasts player coordinates at up to 8 updates/second. Remote avatars are drawn for matching difficulty and location mode (surface, trade, mine, cave, dungeon or house); position packets are range-checked and discarded after 6.5 seconds. These client broadcasts are untrusted cosmetic data only and cannot modify world state, inventory, damage or saves.

## Shared combat and personal loot rules
- Shared enemies and bosses have one canonical health/death state for the room. A guest's attack is a request, not a local HP edit; the owner validates range and target before the room snapshot changes.
- A defeated shared enemy creates one world drop set. A drop has a stable UUID and is removed transactionally when the first eligible player picks it up. Only that player receives the item or gold; other players see the drop disappear and receive no duplicate reward.
- Player inventories, currency, equipment, crafting materials already owned, character XP and health remain personal. Co-op snapshots do not transfer these fields. Personal death drops remain local and are not published as shared loot.

## Not yet playable as a shared-world game
- Player position/avatar exchange remains a cosmetic prototype, not authoritative movement. Shared mob positions and health are owner-simulated and snapshot-synchronized; guest hits are owner-validated. PvP, general crafting/trading and all world interactions are not yet fully authoritative.
- The owner-authoritative world snapshot transport and restore path are implemented. Guest building, farming, mining, tree chopping, shared enemy damage and shared loot pickup are submitted as idempotent requests. Guest inventory edits and crafting remain local and are deliberately not synchronized.
- Realtime Presence is wired for online state and Broadcast carries cosmetic positions. The roster still refreshes from authenticated API every 5 seconds for durable membership names. Movement is not server-authoritative; PvP hit handling currently checks the latest broadcast position locally and must not be treated as exploit-proof.
- PvP preference is stored and owner-gated. When enabled, the current prototype sends hit events over the private room channel and the receiving client validates recent attacker position, world mode and weapon range. Damage is still client-validated rather than server-authoritative; treat this as a limited test feature, not anti-cheat-safe competitive PvP.
- Kick/revoke-code management, owner handoff, rate limits by IP, and eight-player load testing remain for later hardening.
- No release is published and main is unchanged.

## Next phases
1. Prove authenticated two-client create/join/leave/resume flow.
2. Add private Realtime Presence/Broadcast and test 2 clients; then 4 and 8.
3. Extend the host-authoritative world-action queue to general loot collection, crafting and other shared-world edits.
4. Move player movement, enemies, loot, day/night, crafting/trading and combat to validated authoritative simulation; enforce PvP and shared death rules server-side.
5. Add kick/code rotation, reconnect, resilience/load/exploit tests, and then release opt-in.

## Live security audit (2026-10-30)
- Deployed Edge Function version 13 exactly matches `supabase/functions/skyrealm-coop/index.ts` in this branch.
- PostgreSQL privilege check confirms `anon=false`, `authenticated=false`, and `service_role=true` for all public co-op mutation/read RPC functions inspected. Private topic helper functions are executable by `authenticated` only so Realtime RLS can call them.
- `realtime.messages` has separate SELECT and INSERT policies that validate the authenticated user's room membership/status through private helper functions. The SDK requests `config.private=true` and sets the access token before joining.
- Security Advisor still reports leaked-password protection disabled in Supabase Auth and `public.profiles` with RLS enabled but no policies. These are pre-existing account/auth configuration concerns; do not toggle auth policy without testing the current registration flow. The profile table is intentionally not directly exposed to clients.
- Performance Advisor currently lists seven co-op indexes as unused; this is expected on an empty/near-empty new feature and should be re-evaluated after test traffic rather than dropped pre-emptively.

## Security and release checklist
- Verify that Realtime project-wide “Allow public access” is OFF before release. Security Advisor also reports leaked-password protection is disabled in Supabase Auth; enable after reviewing the existing sign-up policy. It reports `public.profiles` as RLS-enabled with no policies (currently inaccessible through direct API, but confirm the intended app access model).
- Validate all player inputs server-side; never trust client balances, inventory or whole-world snapshots.
- Keep service-role key in Supabase Edge Function secrets only.
- Keep single-player as the default path and run its regression tests before merging.

## Shared death and room bootstrap
- A death by an active member records a server-side room sequence. All active clients apply their existing difficulty-specific death/respawn penalty once for each unseen sequence. Reports arriving inside a four-second incident window are deduplicated.
- Room state and shared events are polled after the game loads and every five seconds, even while the lobby is hidden; a 12-second heartbeat allows stale-owner recovery. If the death API is unavailable, the dying client applies its local penalty as fallback, but the room event may not propagate.


## Guest building queue (2026-10-30)
- Live migration versions `20261030071818_co_op_guest_world_action_queue` and `20261030071834_co_op_guest_world_action_rls_policies` and `20261030073436_co_op_world_action_room_uuid_unique` add `public.co_op_world_actions` and private `private.co_op_world_action_limits`. Both are RLS-enabled and explicitly service-role-only. PostgreSQL privilege checks confirmed that `anon` and `authenticated` cannot execute any of the five queue RPCs.
- Supported actions include `place_structure` for `furnace`, `house`, `torch`, `coal`, `storage` and `farmplot`, plus `farm_plant`, `farm_water`, `farm_compost`, `farm_fertilize`, `farm_harvest`, `mine_rock` and `chop_tree`. Payloads are restricted to exact key sets; mine requests include a bounded rock index and approved pickaxe, while tree requests include grid-aligned coordinates and the axe tool. Each account is limited to 20 requests/minute and each room to 100 pending requests.
- Requests are UUID-idempotent, with a database unique index on `(room_id, action_id)` to keep owner-side commit lookup unambiguous across different participants. The guest reserves one local build item while pending. The owner checks terrain, trees, rocks, existing structures and the map area before committing the new structure. Commit updates snapshot version and action status in one transaction. Denied or missing requests refund the local item.
- The guest's resource inventory is still local/client-side; this queue does not yet make resources cheat-proof. Only the host simulation determines whether a structure is valid and appears in the canonical snapshot.
- Supabase Edge Function version 13 is active; its `index.ts` and `deno.json` were verified against the feature branch. The mining and tree-action migrations add `mine_rock`/`chop_tree` and dedicated `commit_co_op_mine_action`/`commit_co_op_tree_action` RPCs. The production endpoint retains its existing bearer-token validation and `verify_jwt=false` setting.
- Still outstanding: shared tree/rock gathering outside the mine, general loot, shared enemy movement/AI, server-authoritative damage and PvP, two-account live playtest, and 2/4/8-player load/regression tests.
