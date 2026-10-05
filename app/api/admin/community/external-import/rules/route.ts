import { NextRequest } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { loadRules, type RuleInput, saveRule, setRuleEnabled } from "@/lib/community-operator-import/rules";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApiUser();
  if (!auth.ok) return auth.response;
  try {
    return jsonOk({ rules: await loadRules(getSupabaseServer()) });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "rules_load_failed", 500, { code: "rules_load_failed" });
  }
}

/** {action:"save", rule} | {action:"toggle", id, enabled} */
export async function POST(req: NextRequest) {
  const auth = await requireAdminApiUser();
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody<{ action?: string; rule?: RuleInput; id?: string; enabled?: boolean }>(req, "JSON 본문이 필요합니다.");
  if (!parsed.ok) return parsed.response;
  const b = parsed.value;
  try {
    const sb = getSupabaseServer();
    if (b.action === "save" && b.rule) return jsonOk({ rule: await saveRule(sb, b.rule, auth.userId) });
    if (b.action === "toggle" && b.id) {
      await setRuleEnabled(sb, b.id, b.enabled !== false);
      return jsonOk({ rules: await loadRules(sb) });
    }
    return jsonError("지원 action: save | toggle", 400, { code: "unsupported_action" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "rule_failed";
    return jsonError(msg, 400, { code: msg });
  }
}
