create table if not exists public.community_messenger_reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('room', 'message', 'user')),
  room_id uuid null references public.community_messenger_rooms(id) on delete cascade,
  message_id uuid null references public.community_messenger_messages(id) on delete cascade,
  reported_user_id uuid null references public.profiles(id) on delete set null,
  reporter_user_id uuid not null references public.profiles(id) on delete cascade,
  reason_type text not null check (
    reason_type in (
      'abuse',
      'spam',
      'scam',
      'sexual',
      'hate',
      'threat',
      'impersonation',
      'stalking',
      'harassment',
      'privacy',
      'etc'
    )
  ),
  reason_detail text not null default '',
  status text not null default 'received' check (status in ('received', 'reviewing', 'resolved', 'rejected', 'sanctioned')),
  admin_note text not null default '',
  assigned_admin_id uuid null references public.profiles(id) on delete set null,
  handled_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (report_type = 'room' and room_id is not null)
    or (report_type = 'message' and room_id is not null and message_id is not null)
    or (report_type = 'user' and reported_user_id is not null)
  )
);

create index if not exists community_messenger_reports_room_idx
  on public.community_messenger_reports (room_id, created_at desc);

create index if not exists community_messenger_reports_message_idx
  on public.community_messenger_reports (message_id, created_at desc);

create index if not exists community_messenger_reports_status_idx
  on public.community_messenger_reports (status, created_at desc);

create index if not exists community_messenger_reports_reporter_idx
  on public.community_messenger_reports (reporter_user_id, created_at desc);

alter table public.community_messenger_reports enable row level security;

drop policy if exists community_messenger_reports_insert_policy on public.community_messenger_reports;
create policy community_messenger_reports_insert_policy
  on public.community_messenger_reports
  for insert
  with check (auth.uid() = reporter_user_id);

drop policy if exists community_messenger_reports_select_own_policy on public.community_messenger_reports;
create policy community_messenger_reports_select_own_policy
  on public.community_messenger_reports
  for select
  using (auth.uid() = reporter_user_id);
