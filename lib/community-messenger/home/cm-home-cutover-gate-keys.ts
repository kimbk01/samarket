/**
 * DIBAY Messenger — Production Canonical Cutover Runtime Gate (SCAFFOLD).
 *
 * 이 파일은 Gate 의 **순수 계약**만 담는다 (DB·React·네트워크 없음, 서버·클라 공용):
 *  - `admin_settings` row key / schemaVersion
 *  - 상태·dispatch·read 타입과 매핑
 *  - fail-closed 기본값 (`LEGACY`)
 *  - raw config normalize (malformed/unknown → LEGACY)
 *  - cohort stable hash
 *
 * 기본 계약: DB row 없음·malformed·loader 오류·미인증 userId·금지 조합 → 전부 `LEGACY`.
 * 이번 Phase 는 Production Canonical 활성화가 아니다 (DB row 미생성 시 현재 제품과 동일).
 *
 * 설계 문서: docs/dibay-messenger-home-inbox-phase3-canonical-projection-cutover-design.md §8
 */

export const CM_HOME_CUTOVER_GATE_ADMIN_SETTINGS_KEY = "community_messenger_home_cutover_gate";
export const CM_HOME_CUTOVER_GATE_SCHEMA_VERSION = 1 as const;

/** 응답 envelope 필드명 (bootstrap/home-sync 공통) */
export const CM_HOME_CUTOVER_GATE_RUNTIME_META_KEY = "cmHomeCutoverGate";

/** Multi-tab Kill 전파 전용 채널·이벤트 (제품 messenger bus 와 분리) */
export const CM_HOME_CUTOVER_GATE_BROADCAST_CHANNEL = "samarket:cm-home-cutover-gate";
export const CM_HOME_CUTOVER_GATE_BROADCAST_EVENT = "cm.home.cutover_gate";
/** 동일 탭 React 재평가 트리거 (gate/seed 변경 시) */
export const CM_HOME_CUTOVER_GATE_CHANGED_EVENT = "samarket:cm-home-cutover-gate-changed";

export type CmHomeCutoverState = "LEGACY" | "SHADOW_ONLY" | "CANONICAL" | "DUAL";
export type CmHomeCutoverDispatchMode = "legacy" | "shadow";
export type CmHomeCutoverReadSource = "legacy" | "canonical" | "dual";
export type CmHomeCutoverPillarScope = "all" | "trade" | "delivery" | "inbox";

/** DB 에 저장하는 raw config (admin_settings.value_json.payload) */
export type CmHomeCutoverGateConfigV1 = {
  schemaVersion: number;
  /** 적용 순서 권위 — 단조 증가 */
  gateVersion: number;
  state: CmHomeCutoverState;
  kill: boolean;
  cohort: { percent: number; allowlist: string[] };
  pillarScope: CmHomeCutoverPillarScope;
  /** audit 전용 — 적용 순서에 사용 금지 */
  updatedAt: string;
};

/** 서버 resolver → 응답 envelope 로 내려가는 사용자별 effective gate */
export type CmHomeCutoverEffectiveGate = {
  schemaVersion: number;
  gateVersion: number;
  effectiveState: CmHomeCutoverState;
  dispatch: CmHomeCutoverDispatchMode;
  read: CmHomeCutoverReadSource;
  kill: boolean;
  pillarScope: CmHomeCutoverPillarScope;
};

/** fail-closed 기본 — 어떤 오류/누락에서도 이 값으로 되돌린다. */
export function createLegacyCmHomeCutoverGateConfig(): CmHomeCutoverGateConfigV1 {
  return {
    schemaVersion: CM_HOME_CUTOVER_GATE_SCHEMA_VERSION,
    gateVersion: 0,
    state: "LEGACY",
    kill: false,
    cohort: { percent: 0, allowlist: [] },
    pillarScope: "all",
    updatedAt: new Date(0).toISOString(),
  };
}

/** LEGACY effective (kill 여부만 다름). */
export function legacyEffectiveGate(gateVersion = 0, kill = false): CmHomeCutoverEffectiveGate {
  return {
    schemaVersion: CM_HOME_CUTOVER_GATE_SCHEMA_VERSION,
    gateVersion: Number.isFinite(gateVersion) && gateVersion >= 0 ? Math.floor(gateVersion) : 0,
    effectiveState: "LEGACY",
    dispatch: "legacy",
    read: "legacy",
    kill,
    pillarScope: "all",
  };
}

/** 허용 상태 → dispatch/read. 금지 조합은 존재할 수 없다(state enum 단일). */
export function cmHomeCutoverStateToDispatchRead(state: CmHomeCutoverState): {
  dispatch: CmHomeCutoverDispatchMode;
  read: CmHomeCutoverReadSource;
} {
  switch (state) {
    case "SHADOW_ONLY":
      return { dispatch: "shadow", read: "legacy" };
    case "CANONICAL":
      return { dispatch: "shadow", read: "canonical" };
    case "DUAL":
      return { dispatch: "shadow", read: "dual" };
    case "LEGACY":
    default:
      return { dispatch: "legacy", read: "legacy" };
  }
}

function normalizeState(raw: unknown): CmHomeCutoverState | null {
  const v = String(raw ?? "").trim().toUpperCase();
  if (v === "LEGACY" || v === "SHADOW_ONLY" || v === "CANONICAL" || v === "DUAL") return v;
  return null;
}

export function normalizeCmHomeCutoverPillarScope(raw: unknown): CmHomeCutoverPillarScope {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "trade" || v === "delivery" || v === "inbox" || v === "all") return v;
  return "all";
}

function normalizePercent(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  const n = Math.floor(raw);
  if (n <= 0) return 0;
  if (n >= 100) return 100;
  return n;
}

export function normalizeCmHomeCutoverAllowlist(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * raw(DB) → 정규 config. 아래 경우 전부 fail-closed(`LEGACY`):
 *  - null/비객체 · schemaVersion 불일치 · gateVersion 음수/비수 · 알 수 없는 state.
 * 금지 조합은 state enum 이 단일이라 발생하지 않는다.
 */
export function normalizeCmHomeCutoverGateConfig(raw: unknown): CmHomeCutoverGateConfigV1 {
  if (!raw || typeof raw !== "object") return createLegacyCmHomeCutoverGateConfig();
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== CM_HOME_CUTOVER_GATE_SCHEMA_VERSION) return createLegacyCmHomeCutoverGateConfig();
  const gateVersionRaw = o.gateVersion;
  if (typeof gateVersionRaw !== "number" || !Number.isFinite(gateVersionRaw) || gateVersionRaw < 0) {
    return createLegacyCmHomeCutoverGateConfig();
  }
  const state = normalizeState(o.state);
  if (state == null) return createLegacyCmHomeCutoverGateConfig();
  const cohortRaw = (o.cohort ?? {}) as Record<string, unknown>;
  return {
    schemaVersion: CM_HOME_CUTOVER_GATE_SCHEMA_VERSION,
    gateVersion: Math.floor(gateVersionRaw),
    state,
    kill: o.kill === true,
    cohort: {
      percent: normalizePercent(cohortRaw.percent),
      allowlist: normalizeCmHomeCutoverAllowlist(cohortRaw.allowlist),
    },
    pillarScope: normalizeCmHomeCutoverPillarScope(o.pillarScope),
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : new Date(0).toISOString(),
  };
}

/**
 * cohort 안정 해시 (FNV-1a 32bit). 동일 userId → 동일 bucket(멀티 디바이스·재접속 일관).
 * bucket = hash % 100.
 */
export function cmHomeCutoverStableBucket(userId: string): number {
  const s = String(userId ?? "").trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 100;
}
