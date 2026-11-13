/**
 * DIBAY 통합 공유 — 기기 공유(Platform Share Adapter · S1) 결과 계약.
 * 설계: docs/audit/dibay-unified-share-audit-design-2026-11-14.md §I-1.
 *
 * | 결과        | 화면                          | 클립보드 |
 * | cancelled   | 아무 것도 안 함               | 변경 없음 |
 * | handed_off  | 아무 것도 안 함(전달 확정 문구 금지) | 변경 없음 |
 * | unavailable | 호출부가 칸을 미리 숨김        | 변경 없음 |
 * | failed      | 오류 안내, 시트 유지           | 변경 없음 |
 *
 * - 한 번 누름 = 한 경로: 앱(Capacitor)을 시도하면 Web Share 로 넘어가지 않는다(이중 시트 방지).
 * - 실패·취소 시 링크를 몰래 복사하지 않는다. 복사는 「링크 복사」를 직접 눌렀을 때만(`share-clipboard.ts`).
 * - 「handed_off」 = 사용자가 공유할 앱을 골랐다(Android) / 공유 확장이 끝났다(iOS)는 뜻일 뿐, 상대 전달 확정이 아니다.
 */
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

/** 링크 공유는 url, 메시지 글 공유는 text — 둘 중 하나는 있어야 한다 */
export type PlatformSharePayload = {
  title: string;
  text?: string;
  url?: string;
};

export type PlatformShareResult = "handed_off" | "cancelled" | "unavailable" | "failed";

/** 공유 시트 결과(분석·로그용) */
export type ShareSheetEvent =
  | { channel: "native"; result: PlatformShareResult }
  | { channel: "copy"; result: "copied" | "failed" };

/** `@capacitor/share` 취소 = Android·iOS 모두 reject("Share canceled") */
export function isCapacitorShareCancel(err: unknown): boolean {
  const msg =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : typeof err === "string"
        ? err
        : "";
  return /share canceled|share cancelled/i.test(msg);
}

export function isWebShareAbort(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return "name" in err && String((err as { name?: unknown }).name) === "AbortError";
}

function hasWebShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/** 「다른 앱으로 공유」 칸을 보여도 되는가 — 앱이거나 Web Share 지원 브라우저 */
export function canUsePlatformShare(): boolean {
  if (typeof window === "undefined") return false;
  return isCapacitorNativePlatform() || hasWebShare();
}

export type PlatformShareDeps = {
  isNativeApp: () => boolean;
  nativeShare: (p: { title: string; text?: string; url?: string; dialogTitle?: string }) => Promise<unknown>;
  webShare: ((p: { title?: string; text?: string; url?: string }) => Promise<void>) | null;
};

async function defaultNativeShare(p: { title: string; text?: string; url?: string; dialogTitle?: string }) {
  const { Share } = await import("@capacitor/share");
  return Share.share(p);
}

function defaultDeps(): PlatformShareDeps {
  return {
    isNativeApp: isCapacitorNativePlatform,
    nativeShare: defaultNativeShare,
    webShare: hasWebShare() ? (p) => navigator.share(p) : null,
  };
}

export async function shareViaPlatform(
  payload: PlatformSharePayload,
  deps: PlatformShareDeps = defaultDeps()
): Promise<PlatformShareResult> {
  const url = payload.url?.trim() || undefined;
  const text = payload.text?.trim() || undefined;
  if (!url && !text) return "failed";
  const title = payload.title.trim() || url || "DIBAY";

  if (deps.isNativeApp()) {
    try {
      await deps.nativeShare({ title, text, url, dialogTitle: title });
      return "handed_off";
    } catch (err) {
      return isCapacitorShareCancel(err) ? "cancelled" : "failed";
    }
  }

  if (!deps.webShare) return "unavailable";
  try {
    await deps.webShare({ title, text, url });
    return "handed_off";
  } catch (err) {
    return isWebShareAbort(err) ? "cancelled" : "failed";
  }
}
