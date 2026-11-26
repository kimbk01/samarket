/**
 * iOS App Store 업데이트 안내 — 순수 정책 (Owner 「구현 승인」 2026-11-26).
 * 설계: docs/audit/ios-app-update-prompt-design-2026-11-26.md §2 S2.
 *
 * iOS 는 앱이 스스로 업데이트를 받을 수 없다 → 앱을 열 때 새 버전을 확인하고 안내를 띄운 뒤
 * 「업데이트」로 App Store DIBAY 화면을 연다. 확인은 기기가 Apple 공개 조회를 직접 부른다(운영 Supabase 0건).
 * 확인 시점·「나중에」 규칙은 Android(`android-play-in-app-update-orchestrator.ts`)와 같다.
 */
import { compareVersionNames } from "@/lib/app-releases/app-release-version";

/** iOS 번들 ID — `ios/App/App.xcodeproj` PRODUCT_BUNDLE_IDENTIFIER (서버 `APP_STORE_BUNDLE_ID` 와 같다). */
export const IOS_APP_STORE_BUNDLE_ID = "com.dibay.ph" as const;

/** 앱을 처음 연 뒤 첫 확인까지 (Android 와 같은 8초). */
export const IOS_UPDATE_COLD_START_DELAY_MS = 8_000;
/** 앞으로 다시 올 때 확인 간격 (Android `COOLDOWN_MS`). */
export const IOS_UPDATE_CHECK_COOLDOWN_MS = 30 * 60 * 1000;
/** 한 번 실행에서 자동 안내 최대 횟수 (Android `MAX_AUTO_PROMPTS_PER_SESSION`). */
export const IOS_UPDATE_MAX_AUTO_PROMPTS_PER_RUN = 2;
/** 「나중에」 → 같은 버전 자동 안내 멈춤 (Android `DEFERRAL_SUPPRESS_MS`). */
export const IOS_UPDATE_DEFER_MS = 24 * 60 * 60 * 1000;
/** Apple 조회 시간 초과. 넘으면 안내하지 않는다. */
export const IOS_UPDATE_LOOKUP_TIMEOUT_MS = 5_000;

export const IOS_UPDATE_DEFERRAL_STORAGE_KEY = "dibay.ios.app_store_update.deferred";

/**
 * Apple 조회 주소. 응답은 Apple CDN 에 최대 24시간 캐시된다 → 매번 다른 `_` 값으로 캐시를 거치지 않는다
 * (2026-11-26 실측: 원래 주소 1.2.7 · `&_=` 주소 1.2.8).
 */
export function buildIosAppStoreLookupUrl(now: number): string {
  return `https://itunes.apple.com/lookup?bundleId=${IOS_APP_STORE_BUNDLE_ID}&country=ph&_=${now}`;
}

/** Apple 조회 응답 → 최신 버전 이름. 모르면 null. */
export function parseIosAppStoreLookupVersion(json: unknown): string | null {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const version = (results[0] as { version?: unknown } | null)?.version;
  if (typeof version !== "string") return null;
  const v = version.trim();
  return /^\d+(\.\d+){0,3}$/.test(v) ? v : null;
}

export type IosUpdateDeferral = { version: string; at: number };

/** 깨진 값·다른 형식 → null (미룬 적 없음으로 본다). */
export function parseIosUpdateDeferral(raw: string | null | undefined): IosUpdateDeferral | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { version?: unknown; at?: unknown };
    if (typeof v.version !== "string" || !v.version) return null;
    if (typeof v.at !== "number" || !Number.isFinite(v.at)) return null;
    return { version: v.version, at: v.at };
  } catch {
    return null;
  }
}

export type IosUpdatePromptDecision =
  | { show: true; latestVersion: string }
  | { show: false; reason: "unknown" | "latest" | "deferred" | "prompt_limit" };

/**
 * 안내를 띄울지. 설치·최신 버전을 모르면 띄우지 않는다(「최신」으로 꾸미지 않음 — 다음 실행에 다시 확인).
 * 「나중에」 한 버전은 24시간 멈춘다. 그보다 새 버전이 나오면 바로 안내한다.
 */
export function decideIosUpdatePrompt(args: {
  installedVersion: string | null | undefined;
  latestVersion: string | null | undefined;
  deferral: IosUpdateDeferral | null;
  now: number;
  promptsThisRun: number;
}): IosUpdatePromptDecision {
  const installed = (args.installedVersion ?? "").trim();
  const latest = (args.latestVersion ?? "").trim();
  if (!installed || !latest) return { show: false, reason: "unknown" };
  if (compareVersionNames(installed, latest) >= 0) return { show: false, reason: "latest" };
  const d = args.deferral;
  if (d && compareVersionNames(latest, d.version) <= 0 && args.now - d.at < IOS_UPDATE_DEFER_MS) {
    return { show: false, reason: "deferred" };
  }
  if (args.promptsThisRun >= IOS_UPDATE_MAX_AUTO_PROMPTS_PER_RUN) return { show: false, reason: "prompt_limit" };
  return { show: true, latestVersion: latest };
}

/** 마지막 확인 뒤 30분이 지났는가 (처음이면 true). */
export function isIosUpdateCheckDue(lastCheckAt: number | null, now: number): boolean {
  return lastCheckAt == null || now - lastCheckAt >= IOS_UPDATE_CHECK_COOLDOWN_MS;
}
