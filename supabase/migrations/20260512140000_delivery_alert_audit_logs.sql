-- 배달 운영 알림 감사 로그 (append-only)
-- - open (rule_id, order_id) 부분 유니크 불변
-- - SLA 스캔 함수 미수정
-- - repeat 로그: repeat_fire_count 가 1 또는 10의 배수일 때만 기록 (크론 폭주 완화)

-- ─── 감사 테이블 ───────────────────────────────────────────────────────────
create table if not exists public.delivery_operation_alert_event_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.delivery_operation_alert_events(id) on delete cascade,
  action_type text not null,
  actor_admin_id uuid references public.profiles(id) on delete set null,
  previous_status text,
  next_status text,
  previous_assignee uuid references public.profiles(id) on delete set null,
  next_assignee uuid references public.profiles(id) on delete set null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists delivery_operation_alert_event_logs_event_created_idx
  on public.delivery_operation_alert_event_logs (event_id, created_at desc);

alter table public.delivery_operation_alert_event_logs enable row level security;

drop policy if exists delivery_operation_alert_event_logs_admin_all on public.delivery_operation_alert_event_logs;
create policy delivery_operation_alert_event_logs_admin_all
  on public.delivery_operation_alert_event_logs
  for all
  to authenticated
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- API 가 요청자 UUID 를 한 번만 넘기면 행에는 저장하지 않음 (POOL 안전: 트랜잭션 로컬 설정)
alter table public.delivery_operation_alert_events
  add column if not exists mutation_actor_id uuid references public.profiles(id) on delete set null;

-- ─── BEFORE: 트랜잭션 로컬 actor + 컬럼 제거 ────────────────────────────────
create or replace function public.delivery_operation_alert_events_audit_actor_bu()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.mutation_actor_id is distinct from old.mutation_actor_id then
    perform set_config(
      'samarket.alert_audit_actor',
      coalesce(new.mutation_actor_id::text, ''),
      true
    );
  else
    perform set_config('samarket.alert_audit_actor', '', true);
  end if;
  new.mutation_actor_id := null;
  return new;
end;
$$;

drop trigger if exists trg_delivery_alert_audit_actor_bu on public.delivery_operation_alert_events;
create trigger trg_delivery_alert_audit_actor_bu
before update on public.delivery_operation_alert_events
for each row
execute function public.delivery_operation_alert_events_audit_actor_bu();

-- ─── AFTER INSERT: created ───────────────────────────────────────────────────
create or replace function public.delivery_operation_alert_events_audit_ai()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.delivery_operation_alert_event_logs (
    event_id, action_type, actor_admin_id, previous_status, next_status,
    previous_assignee, next_assignee, note, metadata
  ) values (
    new.id,
    'created',
    null,
    null,
    new.event_status,
    null,
    null,
    null,
    jsonb_build_object(
      'severity', new.severity,
      'rule_id', new.rule_id,
      'order_id', new.order_id,
      'store_id', new.store_id
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_delivery_alert_audit_ai on public.delivery_operation_alert_events;
create trigger trg_delivery_alert_audit_ai
after insert on public.delivery_operation_alert_events
for each row
execute function public.delivery_operation_alert_events_audit_ai();

-- ─── AFTER UPDATE: 담당·메모·상태·에스컬·반복·자동해소 ──────────────────────
create or replace function public.delivery_operation_alert_events_audit_au()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_txt text;
begin
  begin
    v_txt := nullif(trim(current_setting('samarket.alert_audit_actor', true)), '');
    if v_txt is not null
       and v_txt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_actor := v_txt::uuid;
    end if;
  exception when others then
    v_actor := null;
  end;

  if old.assigned_admin_id is distinct from new.assigned_admin_id then
    if new.assigned_admin_id is null then
      insert into public.delivery_operation_alert_event_logs (
        event_id, action_type, actor_admin_id, previous_status, next_status,
        previous_assignee, next_assignee, note, metadata
      ) values (
        new.id, 'unassigned', v_actor, old.event_status, new.event_status,
        old.assigned_admin_id, null, null, '{}'::jsonb
      );
    else
      insert into public.delivery_operation_alert_event_logs (
        event_id, action_type, actor_admin_id, previous_status, next_status,
        previous_assignee, next_assignee, note, metadata
      ) values (
        new.id, 'assigned', v_actor, old.event_status, new.event_status,
        old.assigned_admin_id, new.assigned_admin_id, new.assignment_note, '{}'::jsonb
      );
    end if;
  end if;

  if old.handling_note is distinct from new.handling_note then
    insert into public.delivery_operation_alert_event_logs (
      event_id, action_type, actor_admin_id, previous_status, next_status,
      previous_assignee, next_assignee, note, metadata
    ) values (
      new.id, 'note_updated', coalesce(v_actor, new.acknowledged_by, new.resolved_by),
      old.event_status, new.event_status, old.assigned_admin_id, new.assigned_admin_id,
      new.handling_note,
      jsonb_build_object('field', 'handling_note')
    );
  end if;

  if new.escalation_count > old.escalation_count then
    insert into public.delivery_operation_alert_event_logs (
      event_id, action_type, actor_admin_id, previous_status, next_status,
      previous_assignee, next_assignee, note, metadata
    ) values (
      new.id, 'escalated', null,
      old.event_status, new.event_status, old.assigned_admin_id, new.assigned_admin_id,
      null,
      jsonb_build_object(
        'from_count', old.escalation_count,
        'to_count', new.escalation_count,
        'severity_before', old.severity,
        'severity_after', new.severity
      )
    );
  end if;

  if new.repeat_fire_count > old.repeat_fire_count
     and (new.repeat_fire_count = 1 or new.repeat_fire_count % 10 = 0) then
    insert into public.delivery_operation_alert_event_logs (
      event_id, action_type, actor_admin_id, previous_status, next_status,
      previous_assignee, next_assignee, note, metadata
    ) values (
      new.id, 'repeated', null,
      old.event_status, new.event_status, old.assigned_admin_id, new.assigned_admin_id,
      null,
      jsonb_build_object('repeat_fire_count', new.repeat_fire_count)
    );
  end if;

  if old.event_status is distinct from new.event_status then
    if new.event_status = 'resolved' and new.resolved_by is null then
      insert into public.delivery_operation_alert_event_logs (
        event_id, action_type, actor_admin_id, previous_status, next_status,
        previous_assignee, next_assignee, note, metadata
      ) values (
        new.id, 'auto_resolved', null,
        old.event_status, new.event_status, old.assigned_admin_id, new.assigned_admin_id,
        null,
        jsonb_build_object('source', 'sync')
      );
    elsif new.event_status = 'resolved' and new.resolved_by is not null then
      insert into public.delivery_operation_alert_event_logs (
        event_id, action_type, actor_admin_id, previous_status, next_status,
        previous_assignee, next_assignee, note, metadata
      ) values (
        new.id, 'resolved', coalesce(v_actor, new.resolved_by),
        old.event_status, new.event_status, old.assigned_admin_id, new.assigned_admin_id,
        new.resolve_note,
        '{}'::jsonb
      );
    elsif new.event_status = 'acknowledged' then
      insert into public.delivery_operation_alert_event_logs (
        event_id, action_type, actor_admin_id, previous_status, next_status,
        previous_assignee, next_assignee, note, metadata
      ) values (
        new.id, 'acknowledged', coalesce(v_actor, new.acknowledged_by),
        old.event_status, new.event_status, old.assigned_admin_id, new.assigned_admin_id,
        new.acknowledge_note,
        '{}'::jsonb
      );
    elsif new.event_status = 'muted' then
      insert into public.delivery_operation_alert_event_logs (
        event_id, action_type, actor_admin_id, previous_status, next_status,
        previous_assignee, next_assignee, note, metadata
      ) values (
        new.id, 'muted', coalesce(v_actor, new.acknowledged_by),
        old.event_status, new.event_status, old.assigned_admin_id, new.assigned_admin_id,
        new.mute_note,
        '{}'::jsonb
      );
    else
      insert into public.delivery_operation_alert_event_logs (
        event_id, action_type, actor_admin_id, previous_status, next_status,
        previous_assignee, next_assignee, note, metadata
      ) values (
        new.id, 'status_changed', coalesce(v_actor, new.resolved_by, new.acknowledged_by),
        old.event_status, new.event_status, old.assigned_admin_id, new.assigned_admin_id,
        null,
        '{}'::jsonb
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_delivery_alert_audit_au on public.delivery_operation_alert_events;
create trigger trg_delivery_alert_audit_au
after update on public.delivery_operation_alert_events
for each row
execute function public.delivery_operation_alert_events_audit_au();

revoke all on function public.delivery_operation_alert_events_audit_actor_bu() from public;
revoke all on function public.delivery_operation_alert_events_audit_ai() from public;
revoke all on function public.delivery_operation_alert_events_audit_au() from public;
