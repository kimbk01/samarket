import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { COMMERCE_SETTING_KEYS } from "@/lib/stores/commerce-settings-keys";
import { listCommerceSettingKeysInDb, loadCommerceSettings } from "@/lib/stores/load-commerce-settings";
import {
  getOrderMatchAlertSoundUrl,
  ORDER_MATCH_CHAT_ALERT_SOUND_KEY,
} from "@/lib/stores/order-match-alert-sound";
import { isValidStoreDeliverySoundUrlInput } from "@/lib/stores/store-delivery-alert-sound";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  adminSettingVersionsByField,
  casWriteAdminSetting,
  checkExpectedAdminSettingVersions,
  loadAdminSettingVersions,
  type AdminSettingCasOp,
  type AdminSettingVersionToken,
} from "@/lib/admin/concurrency/admin-settings-cas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 요청 필드 → admin_settings.key (CAS 버전 `settings_updated_at` · `expected_updated_at` 공통 키). */
const COMMERCE_SETTINGS_FIELD_TO_KEY = {
  store_auto_complete_days: COMMERCE_SETTING_KEYS.autoCompleteDays,
  store_settlement_fee_bp: COMMERCE_SETTING_KEYS.settlementFeeBp,
  store_settlement_delay_days: COMMERCE_SETTING_KEYS.settlementDelayDays,
  order_match_chat_alert_sound_url: ORDER_MATCH_CHAT_ALERT_SOUND_KEY,
} as const;

type CommerceSettingsField = keyof typeof COMMERCE_SETTINGS_FIELD_TO_KEY;

const COMMERCE_SETTINGS_KEYS = Object.values(COMMERCE_SETTINGS_FIELD_TO_KEY);

async function loadCommerceSettingVersions(
  sb: NonNullable<ReturnType<typeof tryGetSupabaseForStores>>
): Promise<Record<CommerceSettingsField, AdminSettingVersionToken> | null> {
  const loaded = await loadAdminSettingVersions(sb, COMMERCE_SETTINGS_KEYS);
  if (!loaded.ok) return null;
  return adminSettingVersionsByField(COMMERCE_SETTINGS_FIELD_TO_KEY, loaded.versions);
}

/** 관리자: 매장 커머스 수치(자동완료·정산) 조회 — DB+env 병합 결과 */
export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const effective = await loadCommerceSettings(sb);
  const inDb = await listCommerceSettingKeysInDb(sb);
  const orderMatchSoundUrl = await getOrderMatchAlertSoundUrl(sb);
  const settingsUpdatedAt = await loadCommerceSettingVersions(sb);

  return NextResponse.json({
    ok: true,
    /** 필드별 행 버전 — 저장 시 `expected_updated_at` 으로 그대로 돌려보낸다 (null = 행 없음·기본값). */
    settings_updated_at: settingsUpdatedAt,
    effective: {
      store_auto_complete_days: effective.autoCompleteDays,
      store_settlement_fee_bp: effective.settlementFeeBp,
      store_settlement_delay_days: effective.settlementDelayDays,
    },
    order_match_chat_alert_sound_url: orderMatchSoundUrl,
    overridden_in_db: {
      store_auto_complete_days: inDb.has(COMMERCE_SETTING_KEYS.autoCompleteDays),
      store_settlement_fee_bp: inDb.has(COMMERCE_SETTING_KEYS.settlementFeeBp),
      store_settlement_delay_days: inDb.has(COMMERCE_SETTING_KEYS.settlementDelayDays),
      order_match_chat_alert_sound: orderMatchSoundUrl != null,
    },
  });
}

type PutBody = {
  store_auto_complete_days?: number | null;
  store_settlement_fee_bp?: number | null;
  store_settlement_delay_days?: number | null;
  /** 주문 채팅(일치 확인 등) 알림음 MP3/오디오 URL — null이면 DB 행 삭제 */
  order_match_chat_alert_sound_url?: string | null;
  /** 작업 기록 사유 (초기화 L2 확인 등). */
  reason?: string | null;
  /** CAS — GET 의 `settings_updated_at` (쓰는 필드마다 필수, null = 불러올 때 행 없음). */
  expected_updated_at?: Partial<Record<CommerceSettingsField, string | null>> | null;
};

/**
 * 관리자: 값 저장(null이면 해당 키 행 삭제 → env 기본값)
 * C-9 · DUP-4 · DEF-4: `store_settlement_fee_bp`(수수료는 수수료 정책·DB 트리거 SSOT)와
 * `store_settlement_delay_days`(레거시 정산 writer 중단)는 더 이상 값을 저장하지 않는다 — null(정리)만 허용.
 */
export async function PUT(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  let body: PutBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const ops: { field: CommerceSettingsField; op: AdminSettingCasOp }[] = [];

  for (const retired of ["store_settlement_fee_bp", "store_settlement_delay_days"] as const) {
    if (retired in body && body[retired] !== null && body[retired] !== undefined) {
      return NextResponse.json({ ok: false, error: "legacy_setting_retired", field: retired }, { status: 400 });
    }
  }
  const beforeEffective = await loadCommerceSettings(sb);

  if ("store_auto_complete_days" in body) {
    const v = body.store_auto_complete_days;
    if (v === null) ops.push({ field: "store_auto_complete_days", op: { kind: "delete" } });
    else if (v !== undefined) {
      const n = Math.round(Number(v));
      if (!Number.isFinite(n) || n < 1 || n > 90) {
        return NextResponse.json({ ok: false, error: "invalid_auto_complete_days" }, { status: 400 });
      }
      ops.push({ field: "store_auto_complete_days", op: { kind: "upsert", valueJson: { value: n } } });
    }
  }

  // 레거시 키는 위에서 null(정리)만 통과한다.
  if ("store_settlement_fee_bp" in body && body.store_settlement_fee_bp === null) {
    ops.push({ field: "store_settlement_fee_bp", op: { kind: "delete" } });
  }
  if ("store_settlement_delay_days" in body && body.store_settlement_delay_days === null) {
    ops.push({ field: "store_settlement_delay_days", op: { kind: "delete" } });
  }

  if ("order_match_chat_alert_sound_url" in body) {
    const raw = body.order_match_chat_alert_sound_url;
    if (raw === null) {
      ops.push({ field: "order_match_chat_alert_sound_url", op: { kind: "delete" } });
    } else if (raw !== undefined) {
      if (typeof raw !== "string") {
        return NextResponse.json({ ok: false, error: "invalid_order_match_sound_url" }, { status: 400 });
      }
      const t = raw.trim();
      if (t.length > 2048) {
        return NextResponse.json({ ok: false, error: "order_match_sound_url_too_long" }, { status: 400 });
      }
      if (t.length > 0 && !isValidStoreDeliverySoundUrlInput(t)) {
        return NextResponse.json({ ok: false, error: "invalid_order_match_sound_url" }, { status: 400 });
      }
      ops.push({
        field: "order_match_chat_alert_sound_url",
        op: t.length === 0 ? { kind: "delete" } : { kind: "upsert", valueJson: { value: t } },
      });
    }
  }

  if (ops.length === 0) {
    return NextResponse.json({ ok: false, error: "no_fields" }, { status: 400 });
  }

  // CAS — admin_settings 에는 updated_at 트리거가 없다: 현재 행 버전을 화면 버전과 비교하고,
  // 각 행은 이전 updated_at 조건부로만 UPDATE/DELETE(없던 행은 INSERT, 동시 INSERT 는 PK 충돌 → 409).
  const loaded = await loadAdminSettingVersions(sb, COMMERCE_SETTINGS_KEYS);
  if (!loaded.ok) {
    return NextResponse.json(
      { ok: false, error: loaded.error },
      { status: loaded.error === "table_missing" ? 503 : 500 }
    );
  }
  const currentByField = adminSettingVersionsByField(COMMERCE_SETTINGS_FIELD_TO_KEY, loaded.versions);
  const check = checkExpectedAdminSettingVersions(
    body.expected_updated_at,
    ops.map((o) => o.field),
    currentByField
  );
  if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: check.status });

  for (const o of ops) {
    const r = await casWriteAdminSetting(sb, {
      key: COMMERCE_SETTINGS_FIELD_TO_KEY[o.field],
      prev: currentByField[o.field],
      op: o.op,
    });
    if (!r.ok) {
      if (r.status === 500) console.error("[PUT commerce-settings write]", o.field, r.error);
      return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    }
  }

  const effective = await loadCommerceSettings(sb);
  const inDb = await listCommerceSettingKeysInDb(sb);
  const orderMatchSoundUrlAfter = await getOrderMatchAlertSoundUrl(sb);

  const settingsUpdatedAtAfter = await loadCommerceSettingVersions(sb);

  const payload = {
    ok: true as const,
    settings_updated_at: settingsUpdatedAtAfter,
    effective: {
      store_auto_complete_days: effective.autoCompleteDays,
      store_settlement_fee_bp: effective.settlementFeeBp,
      store_settlement_delay_days: effective.settlementDelayDays,
    },
    order_match_chat_alert_sound_url: orderMatchSoundUrlAfter,
    overridden_in_db: {
      store_auto_complete_days: inDb.has(COMMERCE_SETTING_KEYS.autoCompleteDays),
      store_settlement_fee_bp: inDb.has(COMMERCE_SETTING_KEYS.settlementFeeBp),
      store_settlement_delay_days: inDb.has(COMMERCE_SETTING_KEYS.settlementDelayDays),
      order_match_chat_alert_sound: orderMatchSoundUrlAfter != null,
    },
  };

  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: gate.actor.userId,
    target_type: "commerce_settings",
    target_id: "global",
    action: "commerce_settings.update",
    before_json: {
      store_auto_complete_days: beforeEffective.autoCompleteDays,
      store_settlement_fee_bp: beforeEffective.settlementFeeBp,
      store_settlement_delay_days: beforeEffective.settlementDelayDays,
    },
    after_json: {
      ...(payload as unknown as Record<string, unknown>),
      request: body as Record<string, unknown>,
      reason: typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) || null : null,
    },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json(payload);
}
