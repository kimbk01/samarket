import {
  getCapacitorNativeDiagnostics,
  isCapacitorNativePlatform,
} from "@/lib/platform/capacitor-native";

function safeConsoleInfo(label: string, payload?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  if (payload) {
    console.info(label, payload);
    return;
  }
  console.info(label);
}

/** OAuth 시작 직전 — provider / redirectTo / native 감지 스냅샷 */
export function logOAuthSignInStart(provider: string, redirectTo: string): void {
  const diagnostics = getCapacitorNativeDiagnostics();
  safeConsoleInfo("[oauth] isNative", {
    value: isCapacitorNativePlatform(),
    ...diagnostics,
  });
  safeConsoleInfo("[oauth] redirectTo", { value: redirectTo });
  safeConsoleInfo("[oauth] provider", { value: provider });
}

/** Supabase authorize URL 에서 redirect_to 추출 (디코드) */
export function extractRedirectToFromAuthorizeUrl(authorizeUrl: string): string | null {
  const trimmed = authorizeUrl.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const raw = url.searchParams.get("redirect_to");
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  } catch {
    return null;
  }
}

export function logOAuthAuthorizeUrl(authorizeUrl: string): void {
  const trimmed = authorizeUrl.trim();
  if (!trimmed) return;
  const redirectTo = extractRedirectToFromAuthorizeUrl(trimmed);
  safeConsoleInfo("[oauth] authorizeUrl", { value: trimmed });
  safeConsoleInfo("[oauth] redirect_to", { value: redirectTo });
}

export function logAppUrlOpenMounted(payload: Record<string, unknown>): void {
  safeConsoleInfo("[appUrlOpen] mounted", payload);
}

export function logAppUrlOpenEvent(url: string, bridgedUrl: string | null): void {
  safeConsoleInfo("[appUrlOpen] url", { value: url });
  safeConsoleInfo("[appUrlOpen] bridgedUrl", { value: bridgedUrl });
}
