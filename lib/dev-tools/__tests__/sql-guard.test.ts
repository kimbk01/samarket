/**
 * 작업 세션 운영 DB MCP 조회 검사 훅 (docs/audit/mcp-sql-guard-hook-design-2026-11-16.md).
 * 시험 자료 = 운영 Postgres 로그 11-15 10:37 ~ 11-16 10:37 PHT 작업 세션 오류 22건 원문
 * (DO 시험 실행 1건은 줄임) + 같은 표를 실제 컬럼으로 쓴 정상 조회.
 * 스키마 = 운영 pg_attribute 사진(2026-11-16) 중 시험에 쓰는 표만.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeSql, type SqlGuardSnapshot } from "../../../.claude/hooks/sql-guard-core.mjs";

const SNAP = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/sql-guard-prod-schema-2026-11-16.json"), "utf8")
) as SqlGuardSnapshot;

/** 이름 추측 15건 → 거부 */
const NAME_GUESS: Array<[string, string]> = [
  [
    "caller_user_id",
    "select id, call_kind, status, caller_user_id, recipient_user_id, created_at at time zone 'Asia/Manila' as created_pht, answered_at at time zone 'Asia/Manila' as answered_pht, ended_at at time zone 'Asia/Manila' as ended_pht, ended_reason\nfrom community_messenger_call_sessions\nwhere created_at >= '2026-11-15 02:45:00+00' order by created_at;",
  ],
  [
    "device_model",
    "select platform, app_version, device_model, updated_at from public.user_devices where updated_at > now() - interval '2 days' order by updated_at desc limit 12",
  ],
  [
    "admin_messenger_call_settings",
    "select incoming_ring_timeout_seconds, busy_auto_reject_enabled, repeated_call_cooldown_seconds, suppress_incoming_local_notifications, updated_at from admin_messenger_call_settings limit 3;",
  ],
  [
    "caller_user_id",
    "select s.id, s.ended_at at time zone 'Asia/Manila' e, s.end_reason, pc.nickname caller, pr.nickname callee from community_messenger_call_sessions s left join profiles pc on pc.id=s.caller_user_id left join profiles pr on pr.id=s.peer_user_id where s.id in ('1a46506b-3dec-469c-b064-a01fccfc0bd2','d2d0ed54-103c-4326-a541-3c1683745542')",
  ],
  [
    "device_model",
    "select p.nickname, d.platform, d.push_provider, d.app_version, d.is_active, d.device_model, (d.last_seen_at at time zone 'Asia/Manila')::timestamp(0) seen from user_devices d join profiles p on p.id=d.user_id where d.platform='ios' and d.is_active and d.last_seen_at > now() - interval '30 days' order by d.last_seen_at desc limit 15",
  ],
  [
    "channel",
    "select (created_at at time zone 'Asia/Manila')::time(2) t, channel, status, left(coalesce(error_summary,''),120) err, left(payload::text,160) p from notification_deliveries where created_at > now() - interval '15 minutes' and (payload::text like '%b7942d37%' or payload::text like '%0ae9d14b%') order by created_at",
  ],
  [
    "provider",
    "select d.target_id, d.event_type, d.status, d.created_at, d.environment, left(d.provider_response::text, 300) resp, ud.provider, ud.platform, right(ud.token,12) tok, ud.app_version, ud.is_active\nfrom notification_deliveries d left join user_devices ud on ud.id = d.device_id\nwhere d.user_id='631a4438-586d-429a-8a9c-bd73c9b622b8' order by d.created_at",
  ],
  [
    "last_message_preview",
    "select r.id, r.room_type, (r.last_message_at at time zone 'Asia/Manila')::text last_pht, left(r.last_message_preview,20) prev, (select string_agg(p2.user_id::text, ',') from community_messenger_participants p2 where p2.room_id=r.id) members\nfrom community_messenger_rooms r join community_messenger_participants p on p.room_id=r.id and p.user_id='9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8' and p.left_at is null\norder by r.last_message_at desc nulls last limit 6;",
  ],
  [
    "sticker_packs",
    "select p.slug, p.name, count(i.id) items, min(i.file_url) sample from sticker_packs p left join sticker_items i on i.pack_id=p.id group by p.slug,p.name order by p.slug;",
  ],
  [
    "os_version",
    "select platform, split_part(coalesce(os_version,''),'.',1) os_major, count(*) n from user_devices where is_active is not false and last_seen_at > now()-interval '30 days' group by 1,2 order by 1,2;",
  ],
  [
    "device_model",
    "select d.user_id, d.device_model, d.app_version, d.last_seen_at from user_devices d where d.device_model ilike any(array['%24076RP19G%','%M156S%']) order by last_seen_at desc nulls last limit 6;",
  ],
  [
    "client_message_id",
    "select id, sender_id, message_type, content, created_at, client_message_id from community_messenger_messages where room_id='1de13b3e-ba94-49bf-b611-582ef3f39ab9' and created_at > now()-interval '5 minutes' order by created_at;",
  ],
  [
    "metadata",
    "select created_at at time zone 'Asia/Manila' t, action, target_type, left(target_id::text,8) tid, left(coalesce(metadata::text, details::text, ''),400) meta from audit_logs where created_at > now() - interval '36 hours' and (action ilike '%delete%' or action ilike '%withdraw%') order by created_at desc limit 20;",
  ],
  [
    "messenger_direct_key",
    "select r.id, r.messenger_direct_key, r.created_at::date from community_messenger_rooms r where r.id='33a8f97f-ec41-43f7-bb6e-2b666f647830'\nunion all\nselect null, 'trade_rooms_total='||count(*)||' general_key='||count(*) filter (where messenger_direct_key not like '%:%:%' and messenger_direct_key is not null)||' null_key='||count(*) filter (where messenger_direct_key is null), null from community_messenger_rooms where summary like '{\"v\":1,\"kind\":\"trade\"%'",
  ],
  [
    "item_id",
    "select\n (select count(*) from posts where id='0fc71fc7-3f1d-4f96-9c60-bdafb6ce00a4') as is_post,\n (select count(*) from product_chats where id='0fc71fc7-3f1d-4f96-9c60-bdafb6ce00a4') as is_pc,\n (select count(*) from product_chats where item_id::text='0fc71fc7-3f1d-4f96-9c60-bdafb6ce00a4') as is_pc_item,\n (select count(*) from community_messenger_rooms where direct_key like 'trade_item:%') as trade_rooms",
  ],
];

/** 문법 1건 → 거부 */
const SYNTAX =
  "select c->>'occurredAt' at, c->>'eventType' t, c->>'value' v from member_trust_snapshots s, jsonb_array_elements(s.metadata->'contributions') c where s.member_id='9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8' order by 1 desc";

/** 쓰기 2건 → 확인 창 */
const WRITES = [
  "begin;\nset local role authenticated;\ninsert into public.transaction_reviews (product_id, room_id, reviewer_id, reviewee_id, role_type, public_review_type)\nselect product_id, room_id, reviewee_id, reviewer_id, 'seller_to_buyer', 'bad' from public._bak_transaction_reviews_20261116 limit 1;\nrollback;",
  "DO $t$\nDECLARE u0 int;\nBEGIN\n  SELECT unread_count INTO u0 FROM community_messenger_participants WHERE room_id='1de13b3e-ba94-49bf-b611-582ef3f39ab9';\n  RAISE EXCEPTION 'DRYRUN u0=% (rolled back)', u0;\nEND\n$t$;",
];

/** 실행해야 알 수 있는 의미 오류 4건 → 통과(못 잡음 — 설계 4절) */
const SEMANTIC = [
  "select 'cp_live' k, count(*)::text v from community_posts where not coalesce(is_deleted,false)\nunion all select 'tr_role', string_agg(s,', ') from (select role_type||'/'||public_review_type||':'||count(*) s from transaction_reviews group by 1,public_review_type) x",
  "select 'con' k, conname||': '||pg_get_constraintdef(oid) v from pg_constraint where conrelid='public.transaction_reviews'::regclass\nunion all select 'rls', polname||' '||polcmd from pg_policy where polrelid='public.transaction_reviews'::regclass",
  "select to_regclass('public.auth_login_failures') t, (select version from supabase_migrations.schema_migrations order by version desc limit 3 offset 0) v;",
  "select (select count(*) from posts where id='0fc71fc7-3f1d-4f96-9c60-bdafb6ce00a4') as is_post,\n (select string_agg(table_name||'.'||column_name, ',') from information_schema.columns where table_schema='public' and table_name='product_chats') as pc_cols,\n (select count(*) from community_messenger_rooms where direct_key like 'trade_item:%' and summary::jsonb ? 'productChatId') as with_pcid",
];

/** 실제 컬럼으로 쓴 정상 조회 → 통과 (잘못 막음 0) */
const GOOD = [
  "select id, call_kind, status, initiator_user_id, recipient_user_id, created_at at time zone 'Asia/Manila' as created_pht from community_messenger_call_sessions where created_at >= '2026-11-15 02:45:00+00' order by created_pht",
  "select platform, app_version, push_provider, updated_at from public.user_devices where updated_at > now() - interval '2 days' order by updated_at desc limit 12",
  "select s.id, s.ended_reason, pc.nickname caller, pr.nickname callee from community_messenger_call_sessions s left join profiles pc on pc.id=s.initiator_user_id left join profiles pr on pr.id=s.recipient_user_id",
  "select d.target_id, d.event_type, d.status, ud.push_provider, ud.platform, right(ud.push_token,12) tok from notification_deliveries d left join user_devices ud on ud.id = d.device_id order by d.created_at",
  "select r.id, (select string_agg(p2.user_id::text, ',') from community_messenger_participants p2 where p2.room_id=r.id) members from community_messenger_rooms r join community_messenger_participants p on p.room_id=r.id and p.left_at is null order by r.last_message_at desc nulls last limit 6",
  "begin read only;\nset local statement_timeout = '30s';\nselect count(*) from user_devices where is_active;\nrollback;",
  "with recent as (select user_id, max(last_seen_at) seen from user_devices group by user_id) select p.nickname, recent.seen from recent join profiles p on p.id = recent.user_id order by recent.seen desc",
  "with x as (select id from posts limit 3) select id, foo_from_cte from x",
  "select c->>'occurredAt' at_, c->>'eventType' t from member_trust_snapshots s, jsonb_array_elements(s.metadata->'contributions') c where c->>'eventType' like 'trade_review%'",
  "select p.id from profiles p where exists (select 1 from user_devices d where d.user_id = p.id and d.platform = 'ios')",
  "select id from posts where id in (select post_id from product_chats where seller_id = posts.user_id)",
  "select table_name, column_name from information_schema.columns where table_schema='public' and table_name='user_devices'",
  "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname='dibay_cm_canonical_unread_count'",
  "select name, setting from pg_settings where name like 'log_%'",
  "explain select id from posts where id = '0fc71fc7-3f1d-4f96-9c60-bdafb6ce00a4'",
  "show server_version",
  "select 1",
  "select now() at time zone 'Asia/Manila'",
  "select ctid, xmin, id from posts limit 1",
  "select count(*) filter (where platform='ios') ios, count(*) filter (where platform='android') android from user_devices",
  "select version from supabase_migrations.schema_migrations order by version desc limit 3",
  "select t.x from unnest(array[1,2,3]) as t(x)",
  "select a.id from posts a join product_chats b using (id) where seller_id is not null",
  "select platform, count(*) n from user_devices group by platform order by n desc",
  "select * from cron.job limit 5",
  "select row_to_json(p) from profiles p limit 1",
  "select to_jsonb(user_devices) from user_devices limit 1",
  "select \"public\".\"posts\".\"id\" from \"public\".\"posts\" limit 1",
];

describe("sql-guard — 실제 작업 세션 오류 22건", () => {
  it.each(NAME_GUESS)("없는 이름 %s → 거부·실제 이름 안내", async (name, sql) => {
    const r = await analyzeSql(sql, SNAP);
    expect(r.decision).toBe("deny");
    expect(r.reason).toContain(name);
  });

  it("없는 컬럼이면 그 표의 실제 컬럼 목록을 알려 준다", async () => {
    const r = await analyzeSql(NAME_GUESS[1]![1], SNAP);
    expect(r.reason).toContain("public.user_devices");
    expect(r.reason).toContain("push_provider");
  });

  it("문법 오류 → DB 에 보내지 않고 거부", async () => {
    const r = await analyzeSql(SYNTAX, SNAP);
    expect(r.decision).toBe("deny");
    expect(r.reason).toContain("문법");
  });

  it("문법 검사는 스키마 사진이 없어도 동작", async () => {
    expect((await analyzeSql(SYNTAX, null)).decision).toBe("deny");
  });

  it.each(WRITES.map((s, i) => [i, s] as const))("쓰기 %i → Owner 확인 창", async (_i, sql) => {
    const r = await analyzeSql(sql, SNAP);
    expect(r.decision).toBe("ask");
    expect(r.reason).toContain("rollback");
  });

  it.each(SEMANTIC.map((s, i) => [i, s] as const))("의미 오류 %i → 통과 (실행해야 알 수 있음)", async (_i, sql) => {
    expect((await analyzeSql(sql, SNAP)).decision).toBe("allow");
  });
});

describe("sql-guard — 정상 조회는 막지 않는다", () => {
  it.each(GOOD.map((s) => [s.slice(0, 70), s] as const))("%s", async (_label, sql) => {
    const r = await analyzeSql(sql, SNAP);
    expect(r, r.reason).toMatchObject({ decision: "allow" });
  });

  it("스키마 사진이 없으면 이름 검사 없이 통과", async () => {
    expect((await analyzeSql(NAME_GUESS[1]![1], null)).decision).toBe("allow");
  });

  it.each([
    "update posts set title = 'x' where id = '0fc71fc7-3f1d-4f96-9c60-bdafb6ce00a4'",
    "delete from posts where false",
    "with d as (delete from posts where false returning id) select count(*) from d",
    "select id from posts for update",
    "create table x (id int)",
    "set role authenticated",
  ])("쓰기 문장 %s → 확인 창", async (sql) => {
    expect((await analyzeSql(sql, SNAP)).decision).toBe("ask");
  });
});

describe("sql-guard 훅 — 운영 project 만 검사", () => {
  const run = (toolName: string, projectId: string, query: string) =>
    execFileSync("node", [path.join(process.cwd(), ".claude/hooks/sql-guard.mjs")], {
      input: JSON.stringify({ tool_name: toolName, tool_input: { project_id: projectId, query } }),
      encoding: "utf8",
      env: { ...process.env, SUPABASE_DB_PASSWORD: "" , CLAUDE_PROJECT_DIR: "/nonexistent" },
    });

  it("다른 project·다른 도구는 출력 없이 통과", () => {
    expect(run("mcp__x__execute_sql", "other-project", "select a, from t")).toBe("");
    expect(run("mcp__x__list_tables", "ckdosyydvgzqwpbwuhon", "select a, from t")).toBe("");
  });
});

describe("guard.sh — 테스트 DB 차단이 새 도구 이름에서도 동작 (11-16 결함 수정)", () => {
  const guard = (toolName: string, projectId: string) =>
    execFileSync("bash", [path.join(process.cwd(), ".claude/hooks/guard.sh")], {
      input: JSON.stringify({ tool_name: toolName, tool_input: { project_id: projectId } }),
      encoding: "utf8",
    });

  it.each([
    ["mcp__152a0794-7923-4f87-99ce-71e2a0e4f22b__execute_sql", "tcwnueuzuxftyomttdyu"],
    ["mcp__Supabase__execute_sql", "gczyogboohpixpurckkg"],
  ])("%s · %s → 거부", (tool, project) => {
    expect(JSON.parse(guard(tool, project)).hookSpecificOutput.permissionDecision).toBe("deny");
  });

  it("운영 project 는 guard.sh 가 막지 않음", () => {
    expect(guard("mcp__152a0794-7923-4f87-99ce-71e2a0e4f22b__execute_sql", "ckdosyydvgzqwpbwuhon")).toBe("");
  });

  it("settings.json matcher 가 새 도구 이름을 잡는다", () => {
    const s = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".claude/settings.json"), "utf8"));
    const matchers: string[] = s.hooks.PreToolUse.map((h: { matcher: string }) => h.matcher);
    const name = "mcp__152a0794-7923-4f87-99ce-71e2a0e4f22b__execute_sql";
    expect(matchers.filter((m) => new RegExp(`^(?:${m})$`).test(name))).toHaveLength(2);
    expect(matchers.some((m) => new RegExp(`^(?:${m})$`).test("mcp__github__actions_list"))).toBe(true);
  });
});
