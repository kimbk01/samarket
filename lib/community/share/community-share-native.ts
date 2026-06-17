import { copyTextToClipboard, isShareAbortError } from "./community-share-copy";
import type { CommunityPostShareNativePayload } from "./community-share-payload";

export type NativeShareOutcome = "shared" | "cancelled" | "copied" | "failed";

async function tryCapacitorShare(payload: CommunityPostShareNativePayload): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return false;
    const { Share } = await import("@capacitor/share");
    await Share.share({
      title: payload.title,
      text: payload.text,
      url: payload.url,
      dialogTitle: payload.title,
    });
    return true;
  } catch {
    return false;
  }
}

async function tryNavigatorShare(payload: CommunityPostShareNativePayload): Promise<"ok" | "cancel" | "fail"> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return "fail";
  try {
    await navigator.share({
      title: payload.title,
      text: payload.text,
      url: payload.url,
    });
    return "ok";
  } catch (err) {
    if (isShareAbortError(err)) return "cancel";
    return "fail";
  }
}

export async function shareCommunityPostViaNative(
  payload: CommunityPostShareNativePayload
): Promise<NativeShareOutcome> {
  const capOk = await tryCapacitorShare(payload);
  if (capOk) return "shared";

  const nav = await tryNavigatorShare(payload);
  if (nav === "ok") return "shared";
  if (nav === "cancel") return "cancelled";

  const copy = await copyTextToClipboard(payload.url);
  return copy === "failed" ? "failed" : "copied";
}
