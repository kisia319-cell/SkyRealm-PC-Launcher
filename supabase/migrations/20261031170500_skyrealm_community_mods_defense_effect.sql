alter table public.skyrealm_community_mods drop constraint if exists skyrealm_community_mods_effect_key_check;
alter table public.skyrealm_community_mods add constraint skyrealm_community_mods_effect_key_check check (effect_key in ('damage','defense','speed','hunger','mining','farming'));
