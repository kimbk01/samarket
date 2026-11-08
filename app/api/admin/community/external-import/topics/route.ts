import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { listOperatorImportTopicOptions } from "@/lib/community-operator-import/topics";
import { jsonError, jsonOk } from "@/lib/http/api-route";
import { adminServerText } from "@/lib/i18n/admin-server-language";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireCommunityAdmin("content");
  if (!auth.ok) return auth.response;
  try {
    const topics = await listOperatorImportTopicOptions();
    return jsonOk({ topics, defaultTopicId: null });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : await adminServerText("admin_api_import_topics_load_failed"), 500, {
      code: "topics_load_failed",
    });
  }
}
