import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

/** 네이티브 accept PATCH 후 WebView 진입 — active 세션까지 짧게 폴링 */
export async function waitForActiveCallSessionAfterNativeAccept(input: {
  refreshSession: (silent?: boolean) => Promise<CommunityMessengerCallSession | null>;
  readSession: () => CommunityMessengerCallSession | null;
  maxAttempts?: number;
  delayMs?: number;
}): Promise<CommunityMessengerCallSession | null> {
  const maxAttempts = input.maxAttempts ?? 10;
  const delayMs = input.delayMs ?? 200;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await input.refreshSession(true);
    const session = input.readSession();
    if (session?.status === "active") return session;
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, delayMs);
    });
  }
  return input.readSession()?.status === "active" ? input.readSession() : null;
}
