import { clientSafeInternalErrorMessage, jsonError, jsonOk } from "@/lib/http/api-route";
import { loadAuthLoginSettings } from "@/lib/auth/login-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await loadAuthLoginSettings();
    return jsonOk({ settings });
  } catch {
    return jsonError(clientSafeInternalErrorMessage("로그인 방식을 불러오지 못했습니다."), 503);
  }
}
