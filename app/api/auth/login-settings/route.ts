import { clientSafeInternalErrorMessage, jsonError, jsonOk } from "@/lib/http/api-route";
import { loadAuthLoginSettings } from "@/lib/auth/login-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await loadAuthLoginSettings();
    return jsonOk({ settings });
  } catch {
    return jsonError(clientSafeInternalErrorMessage("auth_login_settings_load_failed"), 503, {
      code: "auth_login_settings_load_failed",
    });
  }
}
