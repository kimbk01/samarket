-- R17-OS — OS start screen admin (BUILD-TIME pending values).
-- Apps never read this at runtime: values reach devices only via
-- `npm run os-launch:pull` → native build → store release.
-- Capability = background color + one centered static logo (transparent PNG).

create table if not exists public.os_launch_config (
  id text primary key default 'default' check (id = 'default'),
  background_color text not null check (background_color ~ '^#[0-9A-F]{6}$'),
  logo_storage_path text,
  logo_width integer check (logo_width is null or logo_width > 0),
  logo_height integer check (logo_height is null or logo_height > 0),
  logo_sha256 text check (logo_sha256 is null or logo_sha256 ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint os_launch_config_logo_all_or_none check (
    (logo_storage_path is null and logo_width is null and logo_height is null and logo_sha256 is null)
    or (logo_storage_path is not null and logo_width is not null and logo_height is not null and logo_sha256 is not null)
  )
);

comment on table public.os_launch_config is
  'R17-OS pending OS start visual (next native build). Service role only; never read by app runtime.';

-- Service role only: RLS on, no policies; revoke client roles.
alter table public.os_launch_config enable row level security;
revoke all on public.os_launch_config from anon, authenticated;

-- Private bucket for pending logos (admin preview uses signed URLs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('os-launch-assets', 'os-launch-assets', false, 5242880, array['image/png'])
on conflict (id) do nothing;
