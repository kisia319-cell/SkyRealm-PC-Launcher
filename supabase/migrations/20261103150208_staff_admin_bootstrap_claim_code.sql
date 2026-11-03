alter table public.skyrealm_staff_settings
  add column if not exists bootstrap_code_hash text,
  add column if not exists bootstrap_claimed_at timestamptz;

-- Keep unrestricted public role grants disabled. The one-time bootstrap hash
-- is randomly generated and only its matching code is shared with the owner.
update public.skyrealm_staff_settings
set public_grants_enabled = false,
    bootstrap_code_hash = '50738a9f1764b743c25f90b46d084adc5512f248da78284535d38608c22e4a90',
    bootstrap_claimed_at = null,
    updated_at = now()
where id = true;
