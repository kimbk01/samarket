/**
 * Admin 공통 상태 라벨 레지스트리 (설계 v4 §7 「상태 표시」).
 * 도메인(namespace)별로 상태 코드 → {한국어·영어 라벨, 색 톤} 을 등록하고 조회한다.
 *
 * 톤 5종: neutral(회색 대기·초안) · info(파랑 진행) · success(초록 완료·정상) · warning(주황 주의·보류) · danger(빨강 실패·제재·위험).
 * 미등록 코드 = 「알 수 없는 상태」(neutral) — 원시 코드는 화면 1차 정보로 쓰지 않는다. 빈 코드 = 「—」.
 * 도메인 namespace 에 없는 코드는 기본적으로 `common` 에서 찾는다 (`fallbackToCommon: false` 로 끔).
 * 이번 단계는 `common` 만 등록 — 도메인은 이후 단계에서 `registerAdminStatusLabels` 로 추가한다.
 * 기존 도메인 레지스트리(chat/community/delivery-status-labels)는 그대로 둔다.
 * Client-safe.
 */

import type { AdminTone } from "@/components/admin/ui/AdminToneBadge";

export type AdminStatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export type AdminStatusLabelDef = { ko: string; en: string; tone: AdminStatusTone };

export type AdminStatusLabelResult = AdminStatusLabelDef & {
  /** 원시 코드 (기술 정보·data 속성용) */
  code: string;
  known: boolean;
  /** 실제로 찾은 namespace (미등록이면 null) */
  namespace: string | null;
};

export const ADMIN_STATUS_COMMON_NAMESPACE = "common";

/** 설계 톤 → 기존 `AdminToneBadge` 톤. info(진행) = progress(파랑). */
export const ADMIN_STATUS_TONE_TO_BADGE: Record<AdminStatusTone, AdminTone> = {
  neutral: "neutral",
  info: "progress",
  success: "success",
  warning: "warning",
  danger: "danger",
};

const registry = new Map<string, Map<string, AdminStatusLabelDef>>();

function normCode(code: string | null | undefined): string {
  return String(code ?? "").trim().toLowerCase();
}

function sameDef(a: AdminStatusLabelDef, b: AdminStatusLabelDef): boolean {
  return a.ko === b.ko && a.en === b.en && a.tone === b.tone;
}

/**
 * namespace 에 상태 라벨을 등록한다. 코드는 소문자로 저장한다.
 * 같은 코드를 다른 내용으로 다시 등록하면 오류 (도메인 간 라벨 충돌 방지). 같은 내용 재등록은 무시.
 */
export function registerAdminStatusLabels(
  namespace: string,
  defs: Readonly<Record<string, AdminStatusLabelDef>>
): void {
  const ns = namespace.trim();
  if (!ns) throw new Error("admin_status_label_namespace_required");
  let map = registry.get(ns);
  if (!map) {
    map = new Map();
    registry.set(ns, map);
  }
  for (const [rawCode, def] of Object.entries(defs)) {
    const code = normCode(rawCode);
    if (!code) throw new Error(`admin_status_label_code_required:${ns}`);
    const prev = map.get(code);
    if (prev && !sameDef(prev, def)) throw new Error(`admin_status_label_conflict:${ns}:${code}`);
    map.set(code, { ko: def.ko, en: def.en, tone: def.tone });
  }
}

export function lookupAdminStatusLabel(
  namespace: string,
  code: string | null | undefined,
  opts: { fallbackToCommon?: boolean } = {}
): AdminStatusLabelResult {
  const raw = String(code ?? "").trim();
  const key = normCode(raw);
  if (!key) return { ko: "—", en: "—", tone: "neutral", code: raw, known: false, namespace: null };
  const ns = namespace.trim() || ADMIN_STATUS_COMMON_NAMESPACE;
  const order =
    opts.fallbackToCommon === false || ns === ADMIN_STATUS_COMMON_NAMESPACE
      ? [ns]
      : [ns, ADMIN_STATUS_COMMON_NAMESPACE];
  for (const n of order) {
    const hit = registry.get(n)?.get(key);
    if (hit) return { ...hit, code: raw, known: true, namespace: n };
  }
  return { ko: "알 수 없는 상태", en: "Unknown status", tone: "neutral", code: raw, known: false, namespace: null };
}

/** 화면 언어에 맞는 라벨 문자열. */
export function adminStatusLabelText(namespace: string, code: string | null | undefined, ko: boolean): string {
  const r = lookupAdminStatusLabel(namespace, code);
  return ko ? r.ko : r.en;
}

/** 필터 옵션 생성용 — namespace 에 등록된 코드 (등록 순서). */
export function listAdminStatusCodes(namespace: string): string[] {
  return Array.from(registry.get(namespace.trim())?.keys() ?? []);
}

/** 공통 상태 — 도메인 전반에서 같은 뜻으로 쓰는 코드만. */
registerAdminStatusLabels(ADMIN_STATUS_COMMON_NAMESPACE, {
  pending: { ko: "대기", en: "Pending", tone: "neutral" },
  in_progress: { ko: "진행 중", en: "In progress", tone: "info" },
  completed: { ko: "완료", en: "Completed", tone: "success" },
  failed: { ko: "실패", en: "Failed", tone: "danger" },
  cancelled: { ko: "취소됨", en: "Cancelled", tone: "neutral" },
  rejected: { ko: "반려", en: "Rejected", tone: "neutral" },
  approved: { ko: "승인", en: "Approved", tone: "success" },
  on_hold: { ko: "보류", en: "On hold", tone: "warning" },
  active: { ko: "정상", en: "Active", tone: "success" },
  inactive: { ko: "비활성", en: "Inactive", tone: "neutral" },
});
