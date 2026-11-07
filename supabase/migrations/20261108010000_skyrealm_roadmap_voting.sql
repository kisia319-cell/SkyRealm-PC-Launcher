-- Player voting, deduplicated suggestions and roadmap states. All writes are mediated by the skyrealm-roadmap Edge Function.
create table if not exists public.skyrealm_roadmap_ideas (
 id uuid primary key default gen_random_uuid(), title text not null check(char_length(title) between 5 and 72),
 description text not null default '' check(char_length(description)<=500), normalized_key text not null unique,
 status text not null default 'collecting' check(status in ('collecting','voting','planned','in_progress','done')),
 source_count integer not null default 1 check(source_count>=0), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.skyrealm_roadmap_submissions (
 id uuid primary key default gen_random_uuid(), idea_id uuid not null references public.skyrealm_roadmap_ideas(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now(), unique(idea_id,user_id)
);
create table if not exists public.skyrealm_roadmap_votes (
 id uuid primary key default gen_random_uuid(), idea_id uuid not null references public.skyrealm_roadmap_ideas(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now(), unique(idea_id,user_id)
);
create index if not exists skyrealm_roadmap_ideas_status_idx on public.skyrealm_roadmap_ideas(status,created_at desc);
create index if not exists skyrealm_roadmap_votes_idea_idx on public.skyrealm_roadmap_votes(idea_id);
alter table public.skyrealm_roadmap_ideas enable row level security;
alter table public.skyrealm_roadmap_submissions enable row level security;
alter table public.skyrealm_roadmap_votes enable row level security;
revoke all on public.skyrealm_roadmap_ideas,public.skyrealm_roadmap_submissions,public.skyrealm_roadmap_votes from anon,authenticated;
grant all on public.skyrealm_roadmap_ideas,public.skyrealm_roadmap_submissions,public.skyrealm_roadmap_votes to service_role;
insert into public.skyrealm_roadmap_ideas(title,description,normalized_key,status,source_count) values
('Новые боссы и уникальные добивания','Новые боссы, арены и индивидуальные кинематографические завершающие атаки.','новые боссы и уникальные добивания','voting',0),
('Больше биомов и островов','Новые регионы, острова, пещеры и редкие события исследования.','больше биомов и островов','voting',0),
('Строительство поселений','Развитие строительства, NPC, поселений и защиты базы.','строительство поселений','voting',0),
('Новые профессии и ремёсла','Новые профессии, рецепты, производственные цепочки и инструменты.','новые профессии и ремесла','voting',0),
('Улучшение кооператива','Новые совместные активности, комнаты, события и награды.','улучшение кооператива','voting',0)
on conflict(normalized_key) do nothing;