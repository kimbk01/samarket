/**
 * v4 W5 — DB 마이그레이션·데이터 스크립트 정적 계약 (멱등 구문 · 권한 · 범위).
 * 운영 적용은 Owner 검토 후 — 여기서는 파일 내용만 검사한다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const MIG = "supabase/migrations";
const stripComments = (sql: string) => sql.replace(/--.*$/gm, "");

describe("W5 DB-02 라이더 관리 컬럼·스냅샷 함수 재적용", () => {
  const sql = stripComments(read(`${MIG}/20270708150000_delivery_riders_admin_center_reapply_db02.sql`));
  it("컬럼 4개 IF NOT EXISTS · 제약 drop-if-exists 후 add", () => {
    for (const col of ["admin_status", "admin_note", "suspended_at", "suspended_by"]) {
      expect(sql).toMatch(new RegExp(`add column if not exists ${col}\\b`, "i"));
    }
    expect(sql).toMatch(/drop constraint if exists delivery_riders_admin_status_chk/i);
    expect(sql).toMatch(/check \(admin_status in \('ok', 'flagged', 'paused'\)\)/i);
  });
  it("스냅샷 함수 create or replace · service_role 전용 실행", () => {
    expect(sql).toMatch(/create or replace function public\.admin_delivery_riders_operations_snapshot\(\)/i);
    expect(sql).toMatch(/revoke all on function public\.admin_delivery_riders_operations_snapshot\(\) from anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.admin_delivery_riders_operations_snapshot\(\) to service_role/i);
    expect(sql).not.toMatch(/to authenticated/i);
  });
  it("관리자 라이더 PATCH 가 읽는 컬럼과 일치", () => {
    const route = read("app/api/admin/delivery-riders/[riderId]/route.ts");
    for (const col of ["admin_status", "admin_note", "suspended_at", "suspended_by"]) {
      expect(route).toContain(col);
    }
  });
});

describe("W5 DB-03 쿠폰 만료·발급 대조 함수 재적용", () => {
  const sql = stripComments(read(`${MIG}/20270708150100_coupon_entitlement_lifecycle_reapply_db03.sql`));
  it("두 함수 CREATE OR REPLACE · service_role 전용 · pg_cron 블록 없음", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.expire_stale_coupon_entitlements\(p_batch_limit integer DEFAULT 500\)/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.reconcile_coupon_campaign_issued\(p_campaign_id uuid\)/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.expire_stale_coupon_entitlements\(integer\) TO service_role;/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.expire_stale_coupon_entitlements\(integer\) FROM anon, authenticated;/);
    expect(sql).not.toMatch(/TO authenticated/);
    expect(sql).not.toMatch(/cron\.schedule/);
  });
  it("만료 = status expired + 캠페인 reserved_spend_php 0 하한 차감 + 감사 1건 (같은 함수)", () => {
    expect(sql).toMatch(/SET status = 'expired'/);
    expect(sql).toMatch(/reserved_spend_php = greatest\(0, reserved_spend_php - v_ent\.reserved_php\)/);
    expect(sql).toMatch(/'expire',/);
  });
  it("데이터 스크립트는 직접 UPDATE 없이 함수 1회 호출", () => {
    const s = stripComments(read("scripts/delivery-v4/db03-expire-stale-coupons.sql"));
    expect(s).toMatch(/SELECT public\.expire_stale_coupon_entitlements\(500\)/);
    expect(s).not.toMatch(/\bUPDATE\b/i);
  });
});

describe("W5 DB-07 중복 인덱스 정리", () => {
  const raw = read(`${MIG}/20270708150200_drop_exact_duplicate_indexes_db07.sql`);
  const sql = stripComments(raw);
  it("삭제는 가드(남길 인덱스 존재·정의 동일·비제약·비고유) 뒤 DROP INDEX IF EXISTS 만", () => {
    expect(sql).toMatch(/DROP INDEX IF EXISTS public\.%I/);
    expect(sql).toMatch(/pg_constraint WHERE conindid = v_drop_oid/);
    expect(sql).toMatch(/indisunique OR indisprimary/);
    expect(sql).toMatch(/v_drop_def IS DISTINCT FROM v_keep_def/);
    expect(sql).not.toMatch(/DROP CONSTRAINT/i);
    expect(sql).not.toMatch(/CONCURRENTLY/i);
  });
  it("고유 인덱스끼리 중복(store_categories slug · friendships pair)은 삭제 목록에 없음", () => {
    for (const name of [
      "store_categories_slug_unique",
      "store_categories_slug_uniq",
      "community_messenger_friendships_pair_idx",
      "community_messenger_friendships_pair_uidx",
    ]) {
      expect(sql).not.toContain(`'${name}'`);
    }
  });
  it("삭제 쌍 9개(매장·배달 테이블 한정) · 각 삭제 인덱스 롤백 CREATE INDEX 주석 존재", () => {
    const pairs = [...sql.matchAll(/ARRAY\['([a-z0-9_]+)', '([a-z0-9_]+)'\]/g)];
    expect(pairs).toHaveLength(9);
    for (const p of pairs) expect(p[1]).toMatch(/store|delivery|business_cash/);
    for (const p of pairs) {
      expect(raw).toContain(`CREATE INDEX IF NOT EXISTS ${p[1]} ON public.`);
    }
  });
});

describe("W5 PERF-12 검색 trigram 인덱스", () => {
  const sql = stripComments(read(`${MIG}/20270708150300_store_search_trgm_indexes_perf12.sql`));
  it("검색 OR 컬럼 4개 gin_trgm_ops IF NOT EXISTS", () => {
    for (const [table, col] of [
      ["store_products", "title"],
      ["store_products", "summary"],
      ["stores", "store_name"],
      ["stores", "description"],
    ] as const) {
      expect(sql).toMatch(
        new RegExp(`CREATE INDEX IF NOT EXISTS \\w+\\s+ON public\\.${table} USING gin \\(${col} extensions\\.gin_trgm_ops\\)`)
      );
    }
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions/);
  });
  it("검색 코드가 같은 컬럼을 ilike 로 쓴다", () => {
    const src = read("lib/delivery/search/search-delivery.ts");
    for (const frag of ["store_name.ilike", "description.ilike", "title.ilike", "summary.ilike"]) {
      expect(src).toContain(frag);
    }
  });
});

describe("W5 데이터 스크립트 범위", () => {
  it("PL-04 잠금은 관리자 숨김 감사 기록(마지막 노출 기록이 admin·false)이 있는 숨김 매장만", () => {
    const s = stripComments(read("scripts/delivery-v4/pl04-admin-visibility-lock-backfill.sql"));
    expect(s).toMatch(/l\.actor_type = 'admin'/);
    expect(s).toMatch(/l\.vis = 'false'/);
    expect(s).toMatch(/s\.is_visible = false/);
    expect(s).toMatch(/s\.admin_visibility_locked = false/);
    expect(s).toMatch(/BEGIN;[\s\S]*COMMIT;/);
  });
  it("DB-05 삭제는 store_categories 에 없는 primary_slug 스냅샷만", () => {
    const s = stripComments(read("scripts/delivery-v4/db05-delete-unknown-browse-snapshots.sql"));
    expect(s).toMatch(/DELETE FROM public\.stores_browse_snapshots s\s+WHERE NOT EXISTS \(SELECT 1 FROM public\.store_categories c WHERE c\.slug = s\.primary_slug\)/);
  });
  it("PL-05 는 기존 refreshDiscoveryScheduleProjectionForStoreId 호출 · 기본 dry-run · 샘플·NULL 만", () => {
    const s = read("scripts/delivery-v4/refresh-sample-schedule.ts");
    expect(s).toContain("refreshDiscoveryScheduleProjectionForStoreId");
    expect(s).toContain('process.argv.includes("--apply")');
    expect(s).toContain('.eq("store_kind", "sample")');
    expect(s).toContain('.is("discovery_schedule_state", null)');
  });
});
