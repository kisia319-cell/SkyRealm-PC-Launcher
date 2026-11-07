-- Supporting indexes for per-player idea and vote lookups.
create index if not exists skyrealm_roadmap_submissions_user_created_idx on public.skyrealm_roadmap_submissions(user_id,created_at desc);
create index if not exists skyrealm_roadmap_votes_user_idx on public.skyrealm_roadmap_votes(user_id);