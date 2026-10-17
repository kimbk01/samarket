-- R13-D — ADMIN NOTIFICATION reliable delivery (depends on 20270508120000_admin_notifications_inbox).
--
-- Failure model and where a recoverable event lives:
--   1. Source rows are the durable record (e.g. support_messages for support_customer_replied).
--      admin_notification_replay_support_replies() re-derives any reply that has no admin
--      notification yet → so even if BOTH the inbox insert and the outbox insert fail, the next
--      worker run recovers it from the source (lookback window).
--   2. admin_notification_outbox: one row per EVENT (source_key UNIQUE). Written by the app when
--      the inbox write fails, and by the replay. Worker claims with FOR UPDATE SKIP LOCKED,
--      bounded exponential backoff, attempts + last_error tracked, 'dead' after max attempts.
--   3. admin_notification_push_deliveries: one row per inbox notification push. Push is
--      AT-MOST-ONCE: only explicit retryable failures are retried; a send whose outcome is
--      unknown (claimed but never finished) is NOT resent (inbox row already guarantees delivery).
--   Idempotency end-to-end: admin_notifications UNIQUE(recipient_admin_id, dedupe_key).
--   Access: RLS on, no policies, no grants to anon/authenticated; functions = service_role only.
--   Re-run safe; non-destructive (no DROP).

begin;

create table if not exists public.admin_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  kind text not null,
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'delivered', 'dead')),
  attempts integer not null default 0,
  max_attempts integer not null default 8,
  last_error text null,
  next_attempt_at timestamptz not null default now(),
  claim_token uuid null,
  claimed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz null,
  constraint admin_notification_outbox_source_key unique (source_key)
);

create index if not exists admin_notification_outbox_due_idx
  on public.admin_notification_outbox (next_attempt_at)
  where status in ('pending', 'processing');

create index if not exists admin_notification_outbox_dead_idx
  on public.admin_notification_outbox (created_at desc)
  where status = 'dead';

create table if not exists public.admin_notification_push_deliveries (
  notification_id uuid primary key references public.admin_notifications(id) on delete cascade,
  recipient_admin_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'retry', 'skipped_revoked', 'skipped_permission',
                      'skipped_disabled', 'unknown_outcome', 'dead')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  last_error text null,
  next_attempt_at timestamptz not null default now(),
  claim_token uuid null,
  claimed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_notification_push_deliveries_due_idx
  on public.admin_notification_push_deliveries (next_attempt_at)
  where status in ('pending', 'retry', 'sending');

alter table public.admin_notification_outbox enable row level security;
alter table public.admin_notification_push_deliveries enable row level security;
revoke all on public.admin_notification_outbox from anon, authenticated;
revoke all on public.admin_notification_push_deliveries from anon, authenticated;
grant all on public.admin_notification_outbox to service_role;
grant all on public.admin_notification_push_deliveries to service_role;

-- Backoff: 1, 2, 4, 8 … minutes, capped at 6 hours.
create or replace function public.admin_notification_backoff(p_attempts integer)
returns interval
language sql
immutable
as $$
  select least(interval '6 hours', make_interval(mins => power(2, greatest(p_attempts - 1, 0))::int));
$$;

-- Enqueue (idempotent per event). Returns true when a new row was created.
create or replace function public.admin_notification_outbox_enqueue(
  p_source_key text,
  p_kind text,
  p_payload jsonb,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_source_key is null or length(trim(p_source_key)) = 0 then
    raise exception 'invalid_source_key';
  end if;
  insert into public.admin_notification_outbox (source_key, kind, payload, last_error, attempts, next_attempt_at)
  values (
    p_source_key, p_kind, p_payload, left(p_error, 1000),
    case when p_error is null then 0 else 1 end,
    case when p_error is null then now() else now() + public.admin_notification_backoff(1) end
  )
  on conflict (source_key) do nothing
  returning id into v_id;
  return v_id is not null;
end;
$$;

-- Source replay: customer replies on open, assigned cases with no admin notification yet.
-- Skips replies already delivered through the legacy member store (same dedupe key).
create or replace function public.admin_notification_replay_support_replies(
  p_lookback interval default interval '72 hours',
  p_limit integer default 200
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select m.id as message_id, m.body, m.sender_user_id, c.id as case_id, c.public_case_no,
           c.assigned_admin_id
      from public.support_messages m
      join public.support_cases c on c.id = m.case_id
     where m.message_type = 'PUBLIC'
       and m.sender_type in ('MEMBER', 'OWNER')
       and m.deleted_at is null
       and m.created_at > now() - p_lookback
       and c.assigned_admin_id is not null
       and c.status not in ('RESOLVED', 'ARCHIVED')
       and internal.is_platform_admin(c.assigned_admin_id)
       and not exists (
         select 1 from public.admin_notifications n
          where n.recipient_admin_id = c.assigned_admin_id
            and n.dedupe_key = 'support_customer_replied:' || m.id::text
       )
       and not exists (
         select 1 from public.notification_events e
          where e.user_id = c.assigned_admin_id
            and e.dedupe_key = 'support_customer_replied:' || m.id::text
       )
       and not exists (
         select 1 from public.admin_notification_outbox o
          where o.source_key = 'support_customer_replied:' || m.id::text
       )
     order by m.created_at
     limit greatest(1, least(p_limit, 1000))
  loop
    if public.admin_notification_outbox_enqueue(
      'support_customer_replied:' || r.message_id::text,
      'support_customer_replied',
      jsonb_build_object(
        'recipientAdminIds', jsonb_build_array(r.assigned_admin_id),
        'kind', 'support_customer_replied',
        'title', '문의 ' || r.public_case_no,
        'body', left(r.body, 500),
        'linkUrl', '/admin/support/' || r.case_id::text,
        'workRef', jsonb_build_object('table', 'support_cases', 'id', r.case_id),
        'dedupeKey', 'support_customer_replied:' || r.message_id::text,
        'actorUserId', r.sender_user_id,
        'push', true
      ),
      null
    ) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Claim due outbox rows (concurrency-safe). A 'processing' row whose worker died is reclaimed
-- after 10 minutes; its attempt counts.
create or replace function public.admin_notification_outbox_claim(p_limit integer default 20)
returns setof public.admin_notification_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select o.id
      from public.admin_notification_outbox o
     where (o.status = 'pending' and o.next_attempt_at <= now())
        or (o.status = 'processing' and o.claimed_at < now() - interval '10 minutes')
     order by o.next_attempt_at
     limit greatest(1, least(p_limit, 100))
     for update skip locked
  )
  update public.admin_notification_outbox o
     set status = 'processing',
         claim_token = gen_random_uuid(),
         claimed_at = now(),
         attempts = o.attempts + 1,
         updated_at = now()
    from due
   where o.id = due.id
  returning o.*;
end;
$$;

-- Finish a claimed outbox row (CAS on claim_token). Failure → backoff or dead.
create or replace function public.admin_notification_outbox_finish(
  p_id uuid,
  p_claim_token uuid,
  p_ok boolean,
  p_error text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.admin_notification_outbox%rowtype;
begin
  select * into v_row from public.admin_notification_outbox
   where id = p_id and claim_token = p_claim_token and status = 'processing'
   for update;
  if not found then
    return 'stale_claim';
  end if;
  if p_ok then
    update public.admin_notification_outbox
       set status = 'delivered', delivered_at = now(), claim_token = null, last_error = null, updated_at = now()
     where id = p_id;
    return 'delivered';
  end if;
  if v_row.attempts >= v_row.max_attempts then
    update public.admin_notification_outbox
       set status = 'dead', claim_token = null, last_error = left(p_error, 1000), updated_at = now()
     where id = p_id;
    return 'dead';
  end if;
  update public.admin_notification_outbox
     set status = 'pending', claim_token = null, last_error = left(p_error, 1000),
         next_attempt_at = now() + public.admin_notification_backoff(v_row.attempts), updated_at = now()
   where id = p_id;
  return 'retry';
end;
$$;

-- Claim push deliveries due for an attempt. 'sending' rows older than 10 minutes become
-- 'unknown_outcome' (never resent → no duplicate pushes); only pending/retry are claimed.
create or replace function public.admin_notification_push_claim(p_limit integer default 20)
returns setof public.admin_notification_push_deliveries
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.admin_notification_push_deliveries
     set status = 'unknown_outcome', claim_token = null, updated_at = now()
   where status = 'sending' and claimed_at < now() - interval '10 minutes';

  return query
  with due as (
    select d.notification_id
      from public.admin_notification_push_deliveries d
     where d.status in ('pending', 'retry') and d.next_attempt_at <= now()
     order by d.next_attempt_at
     limit greatest(1, least(p_limit, 100))
     for update skip locked
  )
  update public.admin_notification_push_deliveries d
     set status = 'sending',
         claim_token = gen_random_uuid(),
         claimed_at = now(),
         attempts = d.attempts + 1,
         updated_at = now()
    from due
   where d.notification_id = due.notification_id
  returning d.*;
end;
$$;

-- Finish a claimed push (CAS). p_result: sent | retryable | permanent | skipped_revoked |
-- skipped_permission | skipped_disabled.
create or replace function public.admin_notification_push_finish(
  p_notification_id uuid,
  p_claim_token uuid,
  p_result text,
  p_error text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.admin_notification_push_deliveries%rowtype;
  v_status text;
begin
  select * into v_row from public.admin_notification_push_deliveries
   where notification_id = p_notification_id and claim_token = p_claim_token and status = 'sending'
   for update;
  if not found then
    return 'stale_claim';
  end if;
  v_status := case
    when p_result = 'sent' then 'sent'
    when p_result in ('skipped_revoked', 'skipped_permission', 'skipped_disabled') then p_result
    when p_result = 'retryable' and v_row.attempts < v_row.max_attempts then 'retry'
    else 'dead'
  end;
  update public.admin_notification_push_deliveries
     set status = v_status,
         claim_token = null,
         last_error = case when v_status = 'sent' then null else left(p_error, 1000) end,
         next_attempt_at = case when v_status = 'retry'
                                then now() + public.admin_notification_backoff(v_row.attempts)
                                else v_row.next_attempt_at end,
         updated_at = now()
   where notification_id = p_notification_id;
  update public.admin_notifications
     set push_status = case v_status
                         when 'sent' then 'sent'
                         when 'skipped_revoked' then 'skipped_revoked'
                         when 'skipped_permission' then 'skipped_permission'
                         when 'skipped_disabled' then 'skipped_disabled'
                         when 'retry' then 'none'
                         else 'failed' end,
         push_attempted_at = now()
   where id = p_notification_id;
  return v_status;
end;
$$;

-- Operational health (dead letters) — read by the server for the admin inbox banner.
create or replace function public.admin_notification_delivery_health()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'outbox_dead', (select count(*) from public.admin_notification_outbox where status = 'dead'),
    'outbox_pending', (select count(*) from public.admin_notification_outbox where status in ('pending', 'processing')),
    'push_dead', (select count(*) from public.admin_notification_push_deliveries where status = 'dead'),
    'push_unknown', (select count(*) from public.admin_notification_push_deliveries where status = 'unknown_outcome')
  );
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.admin_notification_backoff(integer)',
    'public.admin_notification_outbox_enqueue(text, text, jsonb, text)',
    'public.admin_notification_replay_support_replies(interval, integer)',
    'public.admin_notification_outbox_claim(integer)',
    'public.admin_notification_outbox_finish(uuid, uuid, boolean, text)',
    'public.admin_notification_push_claim(integer)',
    'public.admin_notification_push_finish(uuid, uuid, text, text)',
    'public.admin_notification_delivery_health()'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('revoke all on function %s from anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

commit;
