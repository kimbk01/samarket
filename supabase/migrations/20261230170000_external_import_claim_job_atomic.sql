-- Atomic claim for external_import_jobs (multi-worker safe).
-- CTE + FOR UPDATE SKIP LOCKED: two workers cannot claim the same queued row.

create or replace function public.claim_external_import_job(p_worker_id text)
returns public.external_import_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.external_import_jobs;
begin
  if p_worker_id is null or btrim(p_worker_id) = '' then
    raise exception 'worker_id_required';
  end if;

  with next_job as (
    select id
    from public.external_import_jobs
    where status = 'queued'
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.external_import_jobs j
  set
    status = 'running',
    claimed_by = btrim(p_worker_id),
    claimed_at = now(),
    started_at = now(),
    updated_at = now(),
    error = null
  from next_job
  where j.id = next_job.id
  returning j.* into v_row;

  return v_row;
end;
$$;

revoke all on function public.claim_external_import_job(text) from public;
grant execute on function public.claim_external_import_job(text) to service_role;

comment on function public.claim_external_import_job(text) is
  'Atomically claim oldest queued external_import_jobs row (FOR UPDATE SKIP LOCKED). Worker-only.';
