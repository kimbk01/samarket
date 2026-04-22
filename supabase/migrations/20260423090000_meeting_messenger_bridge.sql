alter table public.meetings
  add column if not exists community_messenger_room_id uuid references public.community_messenger_rooms (id) on delete set null,
  add column if not exists cover_image_url text,
  add column if not exists region_text text,
  add column if not exists category_text text,
  add column if not exists platform_approval_required boolean not null default true,
  add column if not exists platform_approval_status text not null default 'pending_approval';

alter table public.meetings
  drop constraint if exists meetings_platform_approval_status_check;

alter table public.meetings
  add constraint meetings_platform_approval_status_check
  check (platform_approval_status in ('pending_approval', 'approved', 'rejected'));

create table if not exists public.meeting_join_questions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  question_order integer not null default 1,
  question_text text not null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists meeting_join_questions_meeting_order_idx
  on public.meeting_join_questions (meeting_id, question_order);

create table if not exists public.meeting_join_answers (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  question_id uuid not null references public.meeting_join_questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answer_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists meeting_join_answers_question_user_idx
  on public.meeting_join_answers (question_id, user_id);

create index if not exists meeting_members_meeting_status_role_idx
  on public.meeting_members (meeting_id, status, role);

create index if not exists meeting_members_user_status_idx
  on public.meeting_members (user_id, status);

create index if not exists meetings_platform_status_created_idx
  on public.meetings (platform_approval_status, status, created_at desc);

create index if not exists meetings_cm_room_idx
  on public.meetings (community_messenger_room_id)
  where community_messenger_room_id is not null;
