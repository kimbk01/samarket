import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { listOperatorImportTopicOptions } from "@/lib/community-operator-import/topics";
import { jsonError, jsonOk } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireCommunityAdmin("content");
  if (!auth.ok) return auth.response;
  try {
    const topics = await listOperatorImportTopicOptions();
    return jsonOk({ topics, defaultTopicId: null });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "주제 목록을 불러오지 못했습니다.", 500, {
      code: "topics_load_failed",
    });
  }
}
