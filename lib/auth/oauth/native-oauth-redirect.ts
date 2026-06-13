/** App deep link — AndroidManifest intent-filter + OAuthReturnListener */
export const NATIVE_OAUTH_CALLBACK_URL = "dibay://auth/callback";

export const WEB_OAUTH_CALLBACK_ORIGIN = "https://samarket.vercel.app";

/**
 * Supabase OAuth redirectTo for native (Custom Tab).
 * Chrome Custom Tabs reliably load https; JS on this page hands off to dibay://.
 */
export const NATIVE_OAUTH_CAPACITOR_RETURN_PATH = "/auth/oauth/capacitor-return";

export function isNativeOAuthSupabaseRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.origin === WEB_OAUTH_CALLBACK_ORIGIN
      && parsed.pathname === NATIVE_OAUTH_CAPACITOR_RETURN_PATH
    );
  } catch {
    return false;
  }
}

export function buildNativeOAuthAppCallbackUrl(search: string, hash: string): string {
  return `${NATIVE_OAUTH_CALLBACK_URL}${search}${hash}`;
}
