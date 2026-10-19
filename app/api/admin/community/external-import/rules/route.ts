import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { loadRules, type RuleInput, saveRule, setRuleEnabled } from "@/lib/community-operator-import/rules";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireCommunityAdmin("content");
  if (!auth.ok) return auth.response;
  try {
    return jsonOk({ rules: await loadRules(getSupabaseServer()) });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "rules_load_failed", 500, { code: "rules_load_failed" });
  }
}

/** {action:"save", rule} | {action:"toggle", id, enabled} */
export async function POST(req: NextRequest) {
  const auth = await requireCommunityAdmin("content");
  if (!auth.ok) return auth.response;
  const parsed = await parseJsonBody<{ action?: string; rule?: RuleInput; id?: string; enabled?: boolean }>(req, "JSON 본문이 필요합니다.");
  if (!parsed.ok) return parsed.response;
  const b = parsed.value;
  try {
    const sb = getSupabaseServer();
    if (b.action === "save" && b.rule) {
      const prevRules = b.rule.id ? await loadRules(sb) : [];
      const prev = b.rule.id ? (prevRules.find((r) => r.id === b.rule?.id) ?? null) : null;
      const rule = await saveRule(sb, b.rule, auth.userId);
      const audit = await appendCommunityAdminAudit(sb, req, {
        actorId: auth.userId,
        targetType: "community_import_rule",
        targetId: rule.id,
        action: prev ? "community_import.rule_update" : "community_import.rule_create",
        before: (prev ?? null) as unknown as Record<string, unknown> | null,
        after: rule as unknown as Record<string, unknown>,
      });
      return jsonOk({ rule, ...(audit.ok ? {} : { audit_warning: "audit_failed" }) });
    }
    if (b.action === "toggle" && b.id) {
      const prev = (await loadRules(sb)).find((r) => r.id === b.id) ?? null;
      const enabled = b.enabled !== false;
      await setRuleEnabled(sb, b.id, enabled);
      const audit = await appendCommunityAdminAudit(sb, req, {
        actorId: auth.userId,
        targetType: "community_import_rule",
        targetId: b.id,
        action: "community_import.rule_toggle",
        before: { enabled: prev ? prev.enabled : null },
        after: { enabled },
      });
      return jsonOk({ rules: await loadRules(sb), ...(audit.ok ? {} : { audit_warning: "audit_failed" }) });
    }
    return jsonError("지원 action: save | toggle", 400, { code: "unsupported_action" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "rule_failed";
    return jsonError(msg, 400, { code: msg });
  }
}
