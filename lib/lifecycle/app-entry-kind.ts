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
import { pathForInitialAppSurface, DEFAULT_INITIAL_APP_SURFACE } from "@/lib/startup/initial-app-surface";

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

/** Safe Entry = default community surface (`/philife`). Admin Initial Surface applies on USER_COLD only. */
function safeEntryPath(): string {
  return pathForInitialAppSurface(DEFAULT_INITIAL_APP_SURFACE);
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
  if (path !== "/" && path !== safeEntryPath()) return true;
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
      navigateTo: null,
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
    return {
      kind: "user_cold",
      reason: "hint_fresh",
      navigateTo: null, // Initial Surface after Intro (or immediately if Intro OFF)
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
