import { logAppUrlOpenBrowserClose } from "@/lib/auth/oauth-flow-log";

/** Custom Tab 닫기 — 실패해도 OAuth 복귀 흐름은 계속 진행 */
export async function closeOAuthBrowserAfterReturn(): Promise<void> {
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
    logAppUrlOpenBrowserClose(true);
  } catch {
    logAppUrlOpenBrowserClose(false);
  }
}
