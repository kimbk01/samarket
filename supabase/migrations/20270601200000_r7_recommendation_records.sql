-- R7 후속 (reco) — 추천 운영·분석 기록을 전용 테이블에 건별 보관 (Owner 승인: DB 신설).
--
-- 원인: 추천 이슈·알림 이벤트·자동화 실행 이력(recommendation_runtime_v1)과 노출 기록(recommendation_analytics_v1.impressions)이
--       admin_settings.value_json.payload 한 칸에 묶음 전체로 저장되고, 브라우저가 묶음 전체를 받아 메모리 배열
--       (MAX_INCIDENTS 200 · MAX_ALERT_EVENTS 200 · MAX_EXECUTIONS 300 · MAX_IMPRESSIONS 500 링버퍼)에 넣었다가
--       PUT 으로 묶음 전체를 다시 저장 → 상한 초과 기록이 DB 에서도 지워지고, 동시 저장 시 나중 저장이 덮어썼다.
-- 수정: 기록 4종을 테이블로 분리하고 건별 INSERT/UPDATE(앱 서버 service role) · 목록은 서버 페이지 RPC · 요약은 집계 RPC.
--
-- 대상 화면: /admin/recommendation-monitoring (요약 카드·타임라인·이슈·알림 이벤트 탭)
--            /admin/recommendation-automation (요약 카드·시뮬레이터·실행 이력)
--            /admin/recommendation-analytics (성과 요약) · /admin/recommendation-reports (보고서 생성 KPI)
--            /admin/recommendation-experiments · /admin/recommendation-deployments (실험 성과·승자 선택)
--
-- 보관 정책: 기간·건수 기반 삭제 없음 (감사 성격 기록 · 운영 발생량 0건 — admin_settings recommendation% 0행).
--            impressions 도 삭제 작업을 만들지 않는다.
--
-- 권한: 테이블 RLS ON · 정책 없음 · PUBLIC/anon/authenticated 권한 회수 → service_role 만 읽기·쓰기.
--       RPC 는 SECURITY DEFINER · STABLE · search_path=public · PUBLIC/anon/authenticated EXECUTE 회수 · service_role 만 실행
--       (앱 서버가 requireAdminApiUser 통과 후 service role 로 호출).
--
-- 롤백:
--   DROP FUNCTION IF EXISTS public.admin_recommendation_records_summary(timestamptz, jsonb);
--   DROP FUNCTION IF EXISTS public.admin_recommendation_impressions_page(text, text, text, integer, integer);
--   DROP FUNCTION IF EXISTS public.admin_recommendation_automation_executions_page(text, text, integer, integer);
--   DROP FUNCTION IF EXISTS public.admin_recommendation_alert_events_page(boolean, text, integer, integer);
--   DROP FUNCTION IF EXISTS public.admin_recommendation_incidents_page(text, text, integer, integer);
--   DROP TABLE IF EXISTS public.recommendation_impressions;
--   DROP TABLE IF EXISTS public.recommendation_automation_executions;
--   DROP TABLE IF EXISTS public.recommendation_alert_events;
--   DROP TABLE IF EXISTS public.recommendation_incidents;
--   (인덱스는 테이블과 함께 삭제된다. 롤백 전 앱 코드도 이전 커밋으로 되돌려야 한다.)

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. 테이블
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.recommendation_incidents (
  id text PRIMARY KEY,
  surface text NOT NULL CHECK (surface IN ('home', 'search', 'shop')),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  incident_type text NOT NULL CHECK (incident_type IN (
    'empty_feed_spike', 'ctr_drop', 'conversion_drop', 'fallback_activated',
    'kill_switch_enabled', 'deployment_failure', 'section_disabled'
  )),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  related_version_id text,
  related_deployment_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by_admin_id uuid,
  acknowledged_by_admin_nickname text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recommendation_incidents_started_id_idx
  ON public.recommendation_incidents (started_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS recommendation_incidents_status_started_id_idx
  ON public.recommendation_incidents (status, started_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS recommendation_incidents_surface_started_id_idx
  ON public.recommendation_incidents (surface, started_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.recommendation_alert_events (
  id text PRIMARY KEY,
  rule_id text NOT NULL,
  surface text NOT NULL CHECK (surface IN ('home', 'search', 'shop')),
  severity text NOT NULL CHECK (severity IN ('warning', 'critical')),
  metric_key text NOT NULL,
  current_value double precision NOT NULL,
  threshold_value double precision NOT NULL,
  message text NOT NULL DEFAULT '',
  is_acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_at timestamptz,
  acknowledged_by_admin_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recommendation_alert_events_created_id_idx
  ON public.recommendation_alert_events (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS recommendation_alert_events_ack_created_id_idx
  ON public.recommendation_alert_events (is_acknowledged, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS recommendation_alert_events_surface_created_id_idx
  ON public.recommendation_alert_events (surface, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.recommendation_automation_executions (
  id text PRIMARY KEY,
  surface text NOT NULL CHECK (surface IN ('home', 'search', 'shop')),
  incident_id text REFERENCES public.recommendation_incidents (id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN (
    'auto_fallback', 'auto_kill_switch', 'auto_rollback', 'auto_recovery', 'send_escalation'
  )),
  execution_mode text NOT NULL CHECK (execution_mode IN ('dry_run', 'live')),
  status text NOT NULL CHECK (status IN ('success', 'skipped', 'failed')),
  reason text NOT NULL DEFAULT '',
  before_state text NOT NULL DEFAULT '',
  after_state text NOT NULL DEFAULT '',
  created_by_admin_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS recommendation_automation_executions_created_id_idx
  ON public.recommendation_automation_executions (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS recommendation_automation_executions_surface_created_id_idx
  ON public.recommendation_automation_executions (surface, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS recommendation_automation_executions_action_created_id_idx
  ON public.recommendation_automation_executions (action_type, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS recommendation_automation_executions_incident_idx
  ON public.recommendation_automation_executions (incident_id) WHERE incident_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.recommendation_impressions (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  surface text NOT NULL CHECK (surface IN ('home', 'search', 'shop')),
  section_key text NOT NULL,
  candidate_id text NOT NULL,
  candidate_type text NOT NULL CHECK (candidate_type IN ('product', 'shop', 'sponsored')),
  impression_at timestamptz NOT NULL DEFAULT now(),
  clicked boolean NOT NULL DEFAULT false,
  clicked_at timestamptz,
  converted boolean NOT NULL DEFAULT false,
  converted_at timestamptz,
  reason_label text NOT NULL DEFAULT '',
  score double precision NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS recommendation_impressions_at_id_idx
  ON public.recommendation_impressions (impression_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS recommendation_impressions_surface_section_at_id_idx
  ON public.recommendation_impressions (surface, section_key, impression_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS recommendation_impressions_user_at_id_idx
  ON public.recommendation_impressions (user_id, impression_at DESC, id DESC);

ALTER TABLE public.recommendation_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_alert_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_automation_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommendation_impressions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.recommendation_incidents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.recommendation_alert_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.recommendation_automation_executions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.recommendation_impressions FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recommendation_incidents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recommendation_alert_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recommendation_automation_executions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recommendation_impressions TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. 목록 RPC — limit 1..100 · offset ≥ 0 · 정렬 (시각 DESC, id DESC) · 정확한 total
--    rows 는 화면 TS 타입(camelCase) 그대로.
-- ═══════════════════════════════════════════════════════════════════════════

-- 이슈: p_status = open|acknowledged|resolved|NULL(전체) · p_surface = home|search|shop|NULL
CREATE OR REPLACE FUNCTION public.admin_recommendation_incidents_page(
  p_status text,
  p_surface text,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT nullif(btrim(coalesce(p_status, '')), '') AS status,
           nullif(btrim(coalesce(p_surface, '')), '') AS surface,
           LEAST(100, GREATEST(1, coalesce(p_limit, 50))) AS lim,
           GREATEST(0, coalesce(p_offset, 0)) AS off
  ),
  filtered AS (
    SELECT i.*
      FROM public.recommendation_incidents i
     CROSS JOIN params pr
     WHERE (pr.status IS NULL OR i.status = pr.status)
       AND (pr.surface IS NULL OR i.surface = pr.surface)
  ),
  page AS (
    SELECT f.* FROM filtered f
     ORDER BY f.started_at DESC, f.id DESC
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id,
               'surface', p.surface,
               'severity', p.severity,
               'incidentType', p.incident_type,
               'title', p.title,
               'description', p.description,
               'status', p.status,
               'relatedVersionId', p.related_version_id,
               'relatedDeploymentId', p.related_deployment_id,
               'startedAt', p.started_at,
               'resolvedAt', p.resolved_at,
               'acknowledgedAt', p.acknowledged_at,
               'acknowledgedByAdminId', p.acknowledged_by_admin_id,
               'acknowledgedByAdminNickname', p.acknowledged_by_admin_nickname
             ) ORDER BY p.started_at DESC, p.id DESC)
        FROM page p
    ), '[]'::jsonb)
  );
$$;

-- 알림 이벤트: p_acknowledged = true|false|NULL(전체) · p_surface
CREATE OR REPLACE FUNCTION public.admin_recommendation_alert_events_page(
  p_acknowledged boolean,
  p_surface text,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT nullif(btrim(coalesce(p_surface, '')), '') AS surface,
           LEAST(100, GREATEST(1, coalesce(p_limit, 50))) AS lim,
           GREATEST(0, coalesce(p_offset, 0)) AS off
  ),
  filtered AS (
    SELECT e.*
      FROM public.recommendation_alert_events e
     CROSS JOIN params pr
     WHERE (p_acknowledged IS NULL OR e.is_acknowledged = p_acknowledged)
       AND (pr.surface IS NULL OR e.surface = pr.surface)
  ),
  page AS (
    SELECT f.* FROM filtered f
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id,
               'ruleId', p.rule_id,
               'surface', p.surface,
               'severity', p.severity,
               'metricKey', p.metric_key,
               'currentValue', p.current_value,
               'thresholdValue', p.threshold_value,
               'message', p.message,
               'isAcknowledged', p.is_acknowledged,
               'acknowledgedAt', p.acknowledged_at,
               'acknowledgedByAdminId', p.acknowledged_by_admin_id,
               'createdAt', p.created_at
             ) ORDER BY p.created_at DESC, p.id DESC)
        FROM page p
    ), '[]'::jsonb)
  );
$$;

-- 자동화 실행 이력: p_surface · p_action_type
CREATE OR REPLACE FUNCTION public.admin_recommendation_automation_executions_page(
  p_surface text,
  p_action_type text,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT nullif(btrim(coalesce(p_surface, '')), '') AS surface,
           nullif(btrim(coalesce(p_action_type, '')), '') AS action_type,
           LEAST(100, GREATEST(1, coalesce(p_limit, 50))) AS lim,
           GREATEST(0, coalesce(p_offset, 0)) AS off
  ),
  filtered AS (
    SELECT x.*
      FROM public.recommendation_automation_executions x
     CROSS JOIN params pr
     WHERE (pr.surface IS NULL OR x.surface = pr.surface)
       AND (pr.action_type IS NULL OR x.action_type = pr.action_type)
  ),
  page AS (
    SELECT f.* FROM filtered f
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id,
               'surface', p.surface,
               'incidentId', p.incident_id,
               'actionType', p.action_type,
               'executionMode', p.execution_mode,
               'status', p.status,
               'reason', p.reason,
               'beforeState', p.before_state,
               'afterState', p.after_state,
               'createdAt', p.created_at,
               'completedAt', p.completed_at
             ) ORDER BY p.created_at DESC, p.id DESC)
        FROM page p
    ), '[]'::jsonb)
  );
$$;

-- 노출 기록: p_surface · p_section_key · p_user_id
CREATE OR REPLACE FUNCTION public.admin_recommendation_impressions_page(
  p_surface text,
  p_section_key text,
  p_user_id text,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT nullif(btrim(coalesce(p_surface, '')), '') AS surface,
           nullif(btrim(coalesce(p_section_key, '')), '') AS section_key,
           nullif(btrim(coalesce(p_user_id, '')), '') AS user_id,
           LEAST(100, GREATEST(1, coalesce(p_limit, 50))) AS lim,
           GREATEST(0, coalesce(p_offset, 0)) AS off
  ),
  filtered AS (
    SELECT m.*
      FROM public.recommendation_impressions m
     CROSS JOIN params pr
     WHERE (pr.surface IS NULL OR m.surface = pr.surface)
       AND (pr.section_key IS NULL OR m.section_key = pr.section_key)
       AND (pr.user_id IS NULL OR m.user_id = pr.user_id)
  ),
  page AS (
    SELECT f.* FROM filtered f
     ORDER BY f.impression_at DESC, f.id DESC
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id,
               'userId', p.user_id,
               'surface', p.surface,
               'sectionKey', p.section_key,
               'candidateId', p.candidate_id,
               'candidateType', p.candidate_type,
               'impressionAt', p.impression_at,
               'clicked', p.clicked,
               'clickedAt', p.clicked_at,
               'converted', p.converted,
               'convertedAt', p.converted_at,
               'reasonLabel', p.reason_label,
               'score', p.score
             ) ORDER BY p.impression_at DESC, p.id DESC)
        FROM page p
    ), '[]'::jsonb)
  );
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. 요약 RPC — 요약 카드·보고서·자동화 평가·실험 성과가 쓰는 집계만
--    p_since       : 「오늘 실행」 기준 시각 (앱 서버가 마닐라 오늘 0시 UTC 를 넘김)
--    p_user_groups : 실험 성과용 [{ "key": text, "surface": text, "userIds": [text] }] (없으면 NULL)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_recommendation_records_summary(
  p_since timestamptz,
  p_user_groups jsonb
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH surfaces(surface) AS (VALUES ('home'), ('search'), ('shop')),
  inc_surface AS (
    SELECT s.surface,
           count(i.id) FILTER (WHERE i.severity = 'critical' AND i.status = 'open') AS critical_open,
           count(i.id) FILTER (WHERE i.incident_type = 'deployment_failure' AND i.status <> 'resolved') AS deploy_fail_unresolved
      FROM surfaces s
      LEFT JOIN public.recommendation_incidents i ON i.surface = s.surface
     GROUP BY s.surface
  ),
  imp_section AS (
    SELECT m.surface,
           m.section_key,
           count(*) AS impression_count,
           count(*) FILTER (WHERE m.clicked) AS click_count,
           count(*) FILTER (WHERE m.converted) AS conversion_count,
           coalesce(sum(m.score), 0) AS score_sum
      FROM public.recommendation_impressions m
     GROUP BY m.surface, m.section_key
  ),
  imp_reason AS (
    SELECT DISTINCT ON (r.surface, r.section_key)
           r.surface, r.section_key, r.reason
      FROM (
        SELECT m.surface, m.section_key,
               coalesce(nullif(m.reason_label, ''), '-') AS reason,
               count(*) AS cnt,
               max(m.impression_at) AS last_at
          FROM public.recommendation_impressions m
         GROUP BY m.surface, m.section_key, coalesce(nullif(m.reason_label, ''), '-')
      ) r
     ORDER BY r.surface, r.section_key, r.cnt DESC, r.last_at DESC, r.reason ASC
  ),
  groups AS (
    SELECT g.value ->> 'key' AS key,
           g.value ->> 'surface' AS surface,
           g.value -> 'userIds' AS user_ids
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(p_user_groups) = 'array' THEN p_user_groups ELSE '[]'::jsonb END
           ) AS g(value)
  ),
  group_stats AS (
    SELECT g.key,
           count(m.id) AS impression_count,
           count(m.id) FILTER (WHERE m.clicked) AS click_count,
           count(m.id) FILTER (WHERE m.converted) AS conversion_count,
           coalesce(sum(m.score), 0) AS score_sum
      FROM groups g
      LEFT JOIN public.recommendation_impressions m
        ON m.surface = g.surface
       AND jsonb_typeof(g.user_ids) = 'array'
       AND m.user_id IN (SELECT jsonb_array_elements_text(g.user_ids))
     GROUP BY g.key
  )
  SELECT jsonb_build_object(
    'incidents', jsonb_build_object(
      'total', (SELECT count(*) FROM public.recommendation_incidents),
      'open', (SELECT count(*) FROM public.recommendation_incidents WHERE status = 'open'),
      'bySurface', (
        SELECT jsonb_object_agg(x.surface, jsonb_build_object(
                 'criticalOpen', x.critical_open,
                 'deploymentFailureUnresolved', x.deploy_fail_unresolved))
          FROM inc_surface x
      )
    ),
    'alertEvents', jsonb_build_object(
      'total', (SELECT count(*) FROM public.recommendation_alert_events),
      'unacknowledged', (SELECT count(*) FROM public.recommendation_alert_events WHERE NOT is_acknowledged)
    ),
    'executions', (
      SELECT jsonb_build_object(
               'total', count(*),
               'latestCreatedAt', max(x.created_at),
               'since', jsonb_build_object(
                 'total', count(*) FILTER (WHERE p_since IS NOT NULL AND x.created_at >= p_since),
                 'success', count(*) FILTER (WHERE p_since IS NOT NULL AND x.created_at >= p_since AND x.status = 'success'),
                 'failed', count(*) FILTER (WHERE p_since IS NOT NULL AND x.created_at >= p_since AND x.status = 'failed'),
                 'skipped', count(*) FILTER (WHERE p_since IS NOT NULL AND x.created_at >= p_since AND x.status NOT IN ('success', 'failed'))
               ),
               'byActionType', jsonb_build_object(
                 'auto_fallback', count(*) FILTER (WHERE x.action_type = 'auto_fallback'),
                 'auto_kill_switch', count(*) FILTER (WHERE x.action_type = 'auto_kill_switch'),
                 'auto_rollback', count(*) FILTER (WHERE x.action_type = 'auto_rollback'),
                 'auto_recovery', count(*) FILTER (WHERE x.action_type = 'auto_recovery'),
                 'send_escalation', count(*) FILTER (WHERE x.action_type = 'send_escalation')
               )
             )
        FROM public.recommendation_automation_executions x
    ),
    'impressions', jsonb_build_object(
      'total', (SELECT count(*) FROM public.recommendation_impressions),
      'sections', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'surface', s.surface,
                 'sectionKey', s.section_key,
                 'impressionCount', s.impression_count,
                 'clickCount', s.click_count,
                 'conversionCount', s.conversion_count,
                 'scoreSum', s.score_sum,
                 'topReason', coalesce(r.reason, '-')
               ) ORDER BY s.impression_count DESC, s.surface, s.section_key)
          FROM imp_section s
          LEFT JOIN imp_reason r ON r.surface = s.surface AND r.section_key = s.section_key
      ), '[]'::jsonb)
    ),
    'userGroups', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'key', gs.key,
               'impressionCount', gs.impression_count,
               'clickCount', gs.click_count,
               'conversionCount', gs.conversion_count,
               'scoreSum', gs.score_sum
             ) ORDER BY gs.key)
        FROM group_stats gs
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_recommendation_incidents_page(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recommendation_incidents_page(text, text, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.admin_recommendation_alert_events_page(boolean, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recommendation_alert_events_page(boolean, text, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.admin_recommendation_automation_executions_page(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recommendation_automation_executions_page(text, text, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.admin_recommendation_impressions_page(text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recommendation_impressions_page(text, text, text, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.admin_recommendation_records_summary(timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recommendation_records_summary(timestamptz, jsonb) TO service_role;
