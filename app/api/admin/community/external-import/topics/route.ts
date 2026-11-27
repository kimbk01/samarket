import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { listOperatorImportTopicOptions } from "@/lib/community-operator-import/topics";
import { jsonError, jsonOk } from "@/lib/http/api-route";
import { importRouteErrorDetail } from "@/lib/community-operator-import/route-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireCommunityAdmin("content");
  if (!auth.ok) return auth.response;
  try {
    const topics = await listOperatorImportTopicOptions();
    return jsonOk({ topics, defaultTopicId: null });
  } catch (e) {
    const detail = importRouteErrorDetail(e, "topics_load_failed");
    return jsonError("topics_load_failed", 500, {
      code: "topics_load_failed",
      ...(detail ? { detail } : {}),
    });
  }
}
