import { logOAuthLaunchSurfaceConfirmed, logOAuthLaunchSurfaceMissing } from "@/lib/auth/oauth-flow-log";

/** Custom Tab / 외부 OAuth surface 오픈 확인 대기 */
export const OAUTH_LAUNCH_SURFACE_ACK_MS = 2_500;

type LaunchAckCleanup = () => void;

function listenForLaunchSurfaceAck(onAck: () => void): LaunchAckCleanup {
  if (typeof document !== "undefined") {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onAck();
    };
    const onPageHide = () => onAck();
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pagehide", onPageHide);
    };
  }
  return () => undefined;
}

async function listenForCapacitorBackground(onAck: () => void): Promise<LaunchAckCleanup> {
  try {
    const { App } = await import("@capacitor/app");
    const listener = await App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) onAck();
    });
    return () => {
      void listener.remove();
    };
  } catch {
    return () => undefined;
  }
}

/**
 * Native Custom Tab 등 OAuth surface 가 실제로 열렸는지 확인한다.
 * WebView visibility hidden / pagehide / Capacitor app background.
 */
export async function waitForOAuthLaunchSurfaceAck(
  timeoutMs = OAUTH_LAUNCH_SURFACE_ACK_MS,
): Promise<boolean> {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    logOAuthLaunchSurfaceConfirmed("already_hidden");
    return true;
  }

  return new Promise((resolve) => {
    let settled = false;
    let removeDomListener: LaunchAckCleanup = () => undefined;
    let removeAppListener: LaunchAckCleanup = () => undefined;

    const finish = (ok: boolean, source: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      removeDomListener();
      removeAppListener();
      if (ok) {
        logOAuthLaunchSurfaceConfirmed(source);
      } else {
        logOAuthLaunchSurfaceMissing(timeoutMs);
      }
      resolve(ok);
    };

    const onAck = (source: string) => () => finish(true, source);

    removeDomListener = listenForLaunchSurfaceAck(onAck("visibility_or_pagehide"));
    void listenForCapacitorBackground(onAck("app_state_background")).then((cleanup) => {
      removeAppListener = cleanup;
    });

    const timeoutId = setTimeout(() => finish(false, "timeout"), timeoutMs);
  });
}
