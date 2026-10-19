import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  DELIVERY_OPS_SETTING_KEYS,
  DEFAULT_DELIVERY_DISTANCE_POLICY,
  DEFAULT_DELIVERY_STORE_DISTANCE_OVERRIDES,
  invalidateDeliveryDistanceSettingsCache,
  invalidateDeliveryRideTimeSourceCache,
  normalizeDeliveryDistancePolicy,
  normalizeDeliveryRideTimeSource,
  normalizeDeliveryStoreDistanceOverrides,
  type DeliveryDistancePolicy,
  type DeliveryRideTimeSource,
  type DeliveryStoreDistanceOverrides,
} from "@/lib/delivery/delivery-ops-settings";
import { invalidateDiscoveryGlobalDistancePolicy } from "@/lib/stores/discovery/invalidate-discovery-store-projections";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";
import {
  adminSettingVersionsByField,
  adminSettingVersionsFromRows,
  casWriteAdminSetting,
  checkExpectedAdminSettingVersions,
  loadAdminSettingVersions,
  type AdminSettingCasOp,
} from "@/lib/admin/concurrency/admin-settings-cas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readBoolSetting(row: { value_json?: unknown } | null | undefined): boolean {
  const v = row?.value_json as { value?: unknown } | null | undefined;
  return v?.value === true;
}

const DELIVERY_SETTINGS_KEYS = [
  DELIVERY_OPS_SETTING_KEYS.riderLocationEnabled,
  DELIVERY_OPS_SETTING_KEYS.rideTimeSource,
  DELIVERY_OPS_SETTING_KEYS.distancePolicy,
  DELIVERY_OPS_SETTING_KEYS.storeDistanceOverrides,
] as const;

/** 응답 필드 → admin_settings.key (CAS 버전 `settings_updated_at` · `expected_updated_at` 공통 키). */
const DELIVERY_SETTINGS_FIELD_TO_KEY = {
  rider_location_enabled: DELIVERY_OPS_SETTING_KEYS.riderLocationEnabled,
  ride_time_source: DELIVERY_OPS_SETTING_KEYS.rideTimeSource,
  distance_policy: DELIVERY_OPS_SETTING_KEYS.distancePolicy,
  store_distance_overrides: DELIVERY_OPS_SETTING_KEYS.storeDistanceOverrides,
} as const;

type DeliverySettingsField = keyof typeof DELIVERY_SETTINGS_FIELD_TO_KEY;

function buildSettingsVersions(rows: { key?: string; updated_at?: unknown }[]) {
  return adminSettingVersionsByField(
    DELIVERY_SETTINGS_FIELD_TO_KEY,
    adminSettingVersionsFromRows(DELIVERY_SETTINGS_KEYS, rows)
  );
}

function buildSettingsPayload(rows: { key?: string; value_json?: unknown; updated_at?: unknown }[]) {
  const riderRow = rows.find((r) => r.key === DELIVERY_OPS_SETTING_KEYS.riderLocationEnabled);
  const rideRow = rows.find((r) => r.key === DELIVERY_OPS_SETTING_KEYS.rideTimeSource);
  const distanceRow = rows.find((r) => r.key === DELIVERY_OPS_SETTING_KEYS.distancePolicy);
  const overridesRow = rows.find((r) => r.key === DELIVERY_OPS_SETTING_KEYS.storeDistanceOverrides);
  const rideJson = rideRow?.value_json as { value?: unknown } | null | undefined;

  return {
    rider_location_enabled: readBoolSetting(riderRow ?? null),
    ride_time_source: normalizeDeliveryRideTimeSource(rideJson?.value),
    distance_policy: normalizeDeliveryDistancePolicy(
      distanceRow?.value_json ?? DEFAULT_DELIVERY_DISTANCE_POLICY
    ),
    store_distance_overrides: normalizeDeliveryStoreDistanceOverrides(
      overridesRow?.value_json ?? DEFAULT_DELIVERY_STORE_DISTANCE_OVERRIDES
    ),
    /** 필드별 행 버전 — 저장 시 `expected_updated_at` 으로 그대로 돌려보낸다 (null = 행 없음·기본값). */
    settings_updated_at: buildSettingsVersions(rows),
  };
}

export async function GET() {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const { data, error } = await sb
    .from("admin_settings")
    .select("key, value_json, updated_at")
    .in("key", DELIVERY_SETTINGS_KEYS);
  if (error) {
    if (error.message?.includes("admin_settings") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as { key?: string; value_json?: unknown }[];
  const payload = buildSettingsPayload(rows);

  return NextResponse.json({
    ok: true,
    ...payload,
  });
}

type PutBody = {
  rider_location_enabled?: boolean | null;
  ride_time_source?: DeliveryRideTimeSource | null;
  distance_policy?: DeliveryDistancePolicy | null;
  store_distance_overrides?: DeliveryStoreDistanceOverrides | null;
  /** CAS — GET 의 `settings_updated_at` (쓰는 필드마다 필수, null = 불러올 때 행 없음). */
  expected_updated_at?: Partial<Record<DeliverySettingsField, string | null>> | null;
};

export async function PUT(req: NextRequest) {
  // B-1 권한 매트릭스 — 배달 설정 변경 = business (다른 배달 설정 API 와 동일)
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const hasRider = "rider_location_enabled" in body;
  const hasRide = "ride_time_source" in body;
  const hasDistancePolicy = "distance_policy" in body;
  const hasStoreDistanceOverrides = "store_distance_overrides" in body;
  if (!hasRider && !hasRide && !hasDistancePolicy && !hasStoreDistanceOverrides) {
    return NextResponse.json({ ok: false, error: "no_fields" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const afterJson: Record<string, unknown> = {};
  const writes: Array<{ field: DeliverySettingsField; op: AdminSettingCasOp }> = [];

  if (hasRider) {
    const v = body.rider_location_enabled;
    const enable = v === true;
    writes.push({
      field: "rider_location_enabled",
      op: v === null ? { kind: "delete" } : { kind: "upsert", valueJson: { value: enable } },
    });
    afterJson.rider_location_enabled = enable;
  }

  if (hasRide) {
    const src = normalizeDeliveryRideTimeSource(body.ride_time_source);
    if (body.ride_time_source === null) {
      writes.push({ field: "ride_time_source", op: { kind: "delete" } });
      afterJson.ride_time_source = "store";
    } else {
      writes.push({ field: "ride_time_source", op: { kind: "upsert", valueJson: { value: src } } });
      afterJson.ride_time_source = src;
    }
  }

  if (hasDistancePolicy) {
    if (body.distance_policy === null) {
      writes.push({ field: "distance_policy", op: { kind: "delete" } });
      afterJson.distance_policy = DEFAULT_DELIVERY_DISTANCE_POLICY;
    } else {
      const policy = normalizeDeliveryDistancePolicy(body.distance_policy);
      writes.push({ field: "distance_policy", op: { kind: "upsert", valueJson: policy } });
      afterJson.distance_policy = policy;
    }
  }

  if (hasStoreDistanceOverrides) {
    if (body.store_distance_overrides === null) {
      writes.push({ field: "store_distance_overrides", op: { kind: "delete" } });
      afterJson.store_distance_overrides = DEFAULT_DELIVERY_STORE_DISTANCE_OVERRIDES;
    } else {
      const overrides = normalizeDeliveryStoreDistanceOverrides(body.store_distance_overrides);
      writes.push({ field: "store_distance_overrides", op: { kind: "upsert", valueJson: overrides } });
      afterJson.store_distance_overrides = overrides;
    }
  }

  // CAS — admin_settings 에는 updated_at 트리거가 없다: 현재 행 버전을 읽어 화면 버전과 비교하고,
  // 각 행은 이전 updated_at 조건부로만 UPDATE/DELETE(없던 행은 INSERT, 동시 INSERT 는 PK 충돌 → 409).
  const loaded = await loadAdminSettingVersions(sb, DELIVERY_SETTINGS_KEYS);
  if (!loaded.ok) {
    return NextResponse.json(
      { ok: false, error: loaded.error },
      { status: loaded.error === "table_missing" ? 503 : 500 }
    );
  }
  const currentByField = adminSettingVersionsByField(DELIVERY_SETTINGS_FIELD_TO_KEY, loaded.versions);
  const check = checkExpectedAdminSettingVersions(
    body.expected_updated_at,
    writes.map((w) => w.field),
    currentByField
  );
  if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: check.status });

  let failure: { status: number; error: string } | null = null;
  const written: DeliverySettingsField[] = [];
  for (const w of writes) {
    const r = await casWriteAdminSetting(sb, {
      key: DELIVERY_SETTINGS_FIELD_TO_KEY[w.field],
      prev: currentByField[w.field],
      op: w.op,
    });
    if (!r.ok) {
      failure = { status: r.status, error: r.error };
      break;
    }
    written.push(w.field);
  }

  const wroteRide = written.includes("ride_time_source");
  const wroteDistance = written.includes("distance_policy") || written.includes("store_distance_overrides");
  if (wroteRide || wroteDistance) {
    invalidateDeliveryRideTimeSourceCache();
    invalidateDeliveryDistanceSettingsCache();
    /** ETA·거리 반영 홈 피드·browse·summary 응답 캐시 — 인스턴스 공통 무효화 (DEF-64) */
    bumpStorePublicSharedCacheGeneration("delivery_ops_settings.update");
  }

  if (wroteDistance) {
    void invalidateDiscoveryGlobalDistancePolicy(sb);
  }

  if (written.length > 0) {
    const writtenAfter: Record<string, unknown> = {};
    for (const f of written) writtenAfter[f] = afterJson[f];
    const actorId = await getRouteUserId();
    const rm = getAuditRequestMeta(req);
    void appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: actorId,
      target_type: "delivery_ops_settings",
      target_id: "global",
      action: "delivery_ops_settings.update",
      before_json: { settings_updated_at: currentByField },
      after_json: writtenAfter,
      ip: rm.ip,
      user_agent: rm.userAgent,
    });
  }

  if (failure) {
    return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status });
  }

  const { data: data2, error: err2 } = await sb
    .from("admin_settings")
    .select("key, value_json, updated_at")
    .in("key", DELIVERY_SETTINGS_KEYS);
  if (err2) {
    return NextResponse.json({ ok: true, ...afterJson }, { status: 200 });
  }
  const rows2 = (data2 ?? []) as { key?: string; value_json?: unknown; updated_at?: unknown }[];
  const payload2 = buildSettingsPayload(rows2);

  return NextResponse.json({
    ok: true,
    ...payload2,
  });
}
