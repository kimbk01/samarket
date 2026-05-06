/**
 * `admin_delivery_operations_health()` RPC 응답 파서 (옵션 필드 방어).
 */

export type DeliveryOpsHeartbeatSlot = {
  last_run_at?: string | null;
  last_ok?: boolean;
  age_seconds?: number | null;
};

export type DeliveryOperationsHealth = {
  generated_at?: string;
  thresholds?: Record<string, unknown>;
  heartbeats?: Partial<Record<"sla_scan" | "alert_sync" | "auto_action_runner", DeliveryOpsHeartbeatSlot | null>>;
  counts?: Record<string, unknown>;
  verdict?: { overall?: string; issues?: unknown[] };
  banners?: string[];
};

function str(v: unknown): string {
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseHeartbeat(raw: unknown): DeliveryOpsHeartbeatSlot | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return {
    last_run_at: o.last_run_at == null ? null : str(o.last_run_at),
    last_ok: typeof o.last_ok === "boolean" ? o.last_ok : undefined,
    age_seconds: num(o.age_seconds),
  };
}

export function parseDeliveryOperationsHealth(v: unknown): DeliveryOperationsHealth | null {
  if (v == null || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const hbRaw = o.heartbeats;
  const heartbeats: DeliveryOperationsHealth["heartbeats"] = {};
  if (hbRaw != null && typeof hbRaw === "object" && !Array.isArray(hbRaw)) {
    const h = hbRaw as Record<string, unknown>;
    heartbeats.sla_scan = parseHeartbeat(h.sla_scan);
    heartbeats.alert_sync = parseHeartbeat(h.alert_sync);
    heartbeats.auto_action_runner = parseHeartbeat(h.auto_action_runner);
  }
  const verdictRaw = o.verdict;
  let verdict: DeliveryOperationsHealth["verdict"];
  if (verdictRaw != null && typeof verdictRaw === "object" && !Array.isArray(verdictRaw)) {
    const vr = verdictRaw as Record<string, unknown>;
    verdict = {
      overall: str(vr.overall),
      issues: Array.isArray(vr.issues) ? vr.issues : [],
    };
  }
  const banners = Array.isArray(o.banners) ? o.banners.map((x) => str(x)).filter(Boolean) : [];
  return {
    generated_at: typeof o.generated_at === "string" ? o.generated_at : undefined,
    thresholds:
      o.thresholds != null && typeof o.thresholds === "object" && !Array.isArray(o.thresholds)
        ? (o.thresholds as Record<string, unknown>)
        : undefined,
    heartbeats,
    counts:
      o.counts != null && typeof o.counts === "object" && !Array.isArray(o.counts)
        ? (o.counts as Record<string, unknown>)
        : undefined,
    verdict,
    banners,
  };
}

export function deliveryOpsStabilityPercent(h: DeliveryOperationsHealth | null | undefined): number {
  if (!h?.verdict?.overall) return 55;
  const o = h.verdict.overall;
  if (o === "danger") return 36;
  if (o === "warning") return 71;
  return 93;
}
