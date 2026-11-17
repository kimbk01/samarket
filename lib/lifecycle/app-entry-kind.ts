/**
 * AppEntryKind classifier — Lifecycle SSOT §4.3 (single decision authority for kind).
 * Intro eligibility is derived here; launch-intro content gate stays in startup-destination.
 */

import { readLaunchEpoch } from "@/lib/launch-intro/launch-epoch";
import {
  hasNativeRestoreHintProperty,
  readNativeRestoreHint,
  type NativeRestoreHint,
} from "@/lib/lifecycle/native-restore-hint";
import {
  discardRestoreEnvelope,
  readRestoreEnvelope,
  validateRestoreEnvelope,
  type RestoreEnvelope,
} from "@/lib/lifecycle/restore-envelope";
import { pathForInitialAppSurface, resolveColdEntrySurfacePath } from "@/lib/startup/initial-app-surface";
import { readStartupConfigCache } from "@/lib/startup/startup-cache";
import { getSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { hasSupabaseAuthTokenCookie } from "@/lib/home/home-banner-audience-hint";

export type AppEntryKind =
  | "warm_resume"
  | "doc_reset"
  | "os_restore"
  | "user_cold"
  | "ambiguous";

export type AppEntryDecision = {
  kind: AppEntryKind;
  reason: string;
  /** When set, router should replace to this path (restore or safe entry). Null = leave URL. */
  navigateTo: string | null;
  allowIntro: boolean;
  envelope: RestoreEnvelope | null;
  hint: NativeRestoreHint;
  epoch: string | null;
};

const BOOT_EPOCH_KEY = "dibay:lifecycle:boot-epoch";
const DECISION_KEY = "__dibayAppEntryDecision";

/**
 * 앱 진입 v3 ① (Owner 2026-11-17 「첫 진입을 어디로 할지 어드민에서」): 새로 켤 때·안전 진입의 첫 화면 =
 * 어드민 「첫 진입 화면」(기기에 저장된 값 — 기다리는 조회 없음). 비회원 + 회원 전용 화면이면 홈.
 * 예전: 안전 진입은 항상 홈, 새로 켬은 홈을 그린 뒤 이동(깜빡임).
 */
function safeEntryPath(): string {
  return resolveColdEntrySurfacePath({
    adminInitialSurface: readStartupConfigCache().initialSurface,
    isMember: readEntryMemberHint(),
  });
}

/**
 * 빌드 전 감사 B3 (2026-11-17): 첫 판정은 문서당 1번 · 프로필 응답보다 먼저 일어난다 — 메모리 프로필 캐시는 그때 늘 비어 있다.
 * 기기에 남은 로그인 쿠키 유무(홈 배너 R1 과 같은 동기 판정 · 값은 읽지 않음)를 함께 본다. 로그아웃하면 쿠키가 지워진다.
 */
function readEntryMemberHint(): boolean {
  try {
    if (getSupabaseProfileCache()?.id) return true;
  } catch {
    /* 캐시 없음 */
  }
  try {
    return typeof document !== "undefined" && hasSupabaseAuthTokenCookie(document.cookie || "");
  } catch {
    return false;
  }
}

/** 앱 홈 경로(어드민 값과 무관) — 문서 다시 열기 「현재 유지」 판정의 기준(v3 이전 의미) */
const HOME_ENTRY_PATH = pathForInitialAppSurface("home");

/**
 * 아이콘 실행으로 홈 진입점이 열렸고 어드민 첫 화면이 홈이 아니면 그 화면 — 아니면 null(그대로).
 * 새로 켬(`hint_fresh`)·구 앱(`legacy_native_no_hint`) 공통.
 */
function coldEntryNavigateTo(): string | null {
  const coldTarget = safeEntryPath();
  const coldPath = currentDocumentPath();
  return isHomeEntryDocument(coldPath) && !isHomeEntryDocument(coldTarget.split("?")[0] || coldTarget) ? coldTarget : null;
}

/** 지금 문서가 앱 홈(`/`·`/home`) 으로 열렸는가 — 아이콘 실행의 진입점 */
function isHomeEntryDocument(path: string): boolean {
  return path === "/" || path === "/home";
}

function currentDocumentPath(): string {
  try {
    const p = (window.location.pathname || "/").replace(/\/+$/, "");
    return p || "/";
  } catch {
    return "/";
  }
}

/** 이 문서가 같은 출처의 앱 화면에서 넘어온 문서 이동(Next 가 앱 안 이동을 문서 전체 로드로 바꾼 경우)인지 */
function cameFromInAppDocument(path: string): boolean {
  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (!ref || ref.origin !== window.location.origin) return false;
    const refPath = ref.pathname.replace(/\/+$/, "") || "/";
    return refPath !== path;
  } catch {
    return false;
  }
}

/**
 * Lifecycle SSOT §8 — Push·Deep Link·화면 이동으로 정해진 목적지가 DOC_RESET 복원 경로보다 우선.
 * DOC_RESET 문서가 진입점(`/`·Safe Entry)이 아닌 실제 앱 화면 주소로 열렸거나, 앱 화면에서 넘어온 문서 이동이면
 * 그 주소가 사용자가 가려던 곳이다 → 복원하지 않는다.
 * (재감사 2026-11-01 F-1: 새 배포 직후 공지 푸시 탭 → `/notifications/{id}` 문서 로드 → 직전 메신저 방으로 복원돼
 *  목적지가 사라졌다.)
 * 통화 경로는 통화 변경 규정 대상이라 이 판정에서 빼고 기존 동작(복원)을 유지한다.
 */
function docResetKeepsCurrentDocument(path: string): boolean {
  if (path.startsWith("/community-messenger/calls")) return false;
  // 빌드 전 감사 W3: 기준 = 앱 홈(어드민 첫 화면 값으로 바뀌지 않게 — v3 이전 의미)
  if (path !== "/" && path !== HOME_ENTRY_PATH) return true;
  return cameFromInAppDocument(path);
}

function markBootEpoch(epoch: string | null): { docReset: boolean } {
  if (typeof window === "undefined" || !epoch) return { docReset: false };
  try {
    const prev = window.sessionStorage.getItem(BOOT_EPOCH_KEY);
    const docReset = prev === epoch;
    window.sessionStorage.setItem(BOOT_EPOCH_KEY, epoch);
    return { docReset };
  } catch {
    return { docReset: false };
  }
}

function decide(): AppEntryDecision {
  const epoch = readLaunchEpoch();
  const hintPresent = hasNativeRestoreHintProperty();
  const hint = readNativeRestoreHint();
  const envelope = readRestoreEnvelope();
  const validated = validateRestoreEnvelope(envelope);

  // No native epoch → web/desktop: not Capacitor lifecycle path
  if (!epoch) {
    return {
      kind: "ambiguous",
      reason: "no_epoch",
      navigateTo: null,
      allowIntro: false,
      envelope: null,
      hint,
      epoch: null,
    };
  }

  /*
   * Legacy Cap Native: injects LAUNCH_EPOCH only (no __DIBAY_NATIVE_RESTORE_HINT__).
   * Preserve pre-Lifecycle Intro/Initial Surface — do not Safe-Entry on missing hint.
   * New Native always injects an explicit restore|fresh|unknown string.
   */
  if (!hintPresent) {
    discardRestoreEnvelope();
    return {
      kind: "user_cold",
      reason: "legacy_native_no_hint",
      // 빌드 전 감사 W1: 구 앱도 어드민 첫 화면으로(v3 전 `InitialSurfaceBootstrap` 이 하던 이동 — SSOT 기존 설치 앱 보호)
      navigateTo: coldEntryNavigateTo(),
      allowIntro: true,
      envelope: null,
      hint: "unknown",
      epoch,
    };
  }

  const { docReset } = markBootEpoch(epoch);

  // DOC_RESET: same process, document reloaded
  if (docReset) {
    const currentPath = currentDocumentPath();
    // 계정 불일치·형식·시계 오류 등 보호 사유가 있는 복원 기록은 기존대로 Safe Entry (계정 전환 뒤 이전 계정 화면 유지 금지).
    const envelopeBenign = validated.ok || validated.reason === "missing" || validated.reason === "expired";
    if (envelopeBenign && docResetKeepsCurrentDocument(currentPath)) {
      return {
        kind: "doc_reset",
        reason: "same_epoch_reload_keep_current",
        navigateTo: null,
        allowIntro: false,
        envelope: validated.ok ? validated.envelope : null,
        hint,
        epoch,
      };
    }
    if (validated.ok) {
      return {
        kind: "doc_reset",
        reason: "same_epoch_reload_restore",
        navigateTo: validated.envelope.path,
        allowIntro: false,
        envelope: validated.envelope,
        hint,
        epoch,
      };
    }
    return {
      kind: "doc_reset",
      reason: `same_epoch_reload_safe_${validated.reason}`,
      navigateTo: safeEntryPath(),
      allowIntro: false,
      envelope: null,
      hint,
      epoch,
    };
  }

  // OS_RESTORE: RESTORE hint AND valid envelope (both required)
  if (hint === "restore" && validated.ok) {
    return {
      kind: "os_restore",
      reason: "hint_restore_envelope_ok",
      navigateTo: validated.envelope.path,
      allowIntro: false,
      envelope: validated.envelope,
      hint,
      epoch,
    };
  }

  // USER_COLD: FRESH only
  if (hint === "fresh") {
    discardRestoreEnvelope();
    // 앱 진입 v3 ①: 아이콘으로 홈 진입점이 열렸고 어드민 첫 화면이 홈이 아니면 그 화면으로 — 생명주기 이동으로 처리해
    // 시작 화면(또는 인트로)이 덮은 채 이동한다(홈을 먼저 그리지 않음). 딥링크 등 다른 주소로 열렸으면 그대로.
    return {
      kind: "user_cold",
      reason: "hint_fresh",
      navigateTo: coldEntryNavigateTo(),
      allowIntro: true,
      envelope: null,
      hint,
      epoch,
    };
  }

  // RESTORE + invalid envelope → Safe Entry
  if (hint === "restore" && !validated.ok) {
    discardRestoreEnvelope();
    return {
      kind: "ambiguous",
      reason: `restore_envelope_${validated.reason}`,
      navigateTo: safeEntryPath(),
      allowIntro: false,
      envelope: null,
      hint,
      epoch,
    };
  }

  // UNKNOWN (any envelope) → AMBIGUOUS Safe Entry — UNKNOWN is not cold evidence
  discardRestoreEnvelope();
  return {
    kind: "ambiguous",
    reason: hint === "unknown" ? "hint_unknown" : `ambiguous_${hint}`,
    navigateTo: safeEntryPath(),
    allowIntro: false,
    envelope: null,
    hint,
    epoch,
  };
}

/** Sync, once per document. */
export function getAppEntryDecision(): AppEntryDecision {
  if (typeof window === "undefined") {
    return {
      kind: "ambiguous",
      reason: "server",
      navigateTo: null,
      allowIntro: false,
      envelope: null,
      hint: "unknown",
      epoch: null,
    };
  }
  const w = window as unknown as { [DECISION_KEY]?: AppEntryDecision };
  if (!w[DECISION_KEY]) {
    w[DECISION_KEY] = decide();
    try {
      const d = w[DECISION_KEY];
      console.info(
        `[dibay-lifecycle] kind=${d.kind} reason=${d.reason} hint=${d.hint} allowIntro=${d.allowIntro} nav=${d.navigateTo ?? "none"} epoch=${d.epoch ?? "none"}`
      );
    } catch {
      /* ignore */
    }
  }
  return w[DECISION_KEY]!;
}

/** Intro product may run only on USER_COLD when allowIntro. */
export function appEntryAllowsIntro(): boolean {
  const d = getAppEntryDecision();
  return d.kind === "user_cold" && d.allowIntro;
}

export function getSafeEntryPath(): string {
  return safeEntryPath();
}

/** Test helper */
export function resetAppEntryDecisionForTests(): void {
  if (typeof window === "undefined") return;
  delete (window as unknown as { [DECISION_KEY]?: AppEntryDecision })[DECISION_KEY];
  try {
    window.sessionStorage.removeItem(BOOT_EPOCH_KEY);
  } catch {
    /* ignore */
  }
}
