/**
 * BULK REPLACE RULES (community_import_rules): operator-defined find/replace applied to the title
 * and text blocks at publish/preview time, scoped global → source → board, in sort order.
 * Rules never invent text; they only substitute what the operator wrote.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OperatorContentBlock } from "./types";

export const RULES_TABLE = "community_import_rules";

export type ImportRule = {
  id: string;
  scope: "global" | "source" | "board";
  sourceSite: string | null;
  sourceBoard: string | null;
  findText: string;
  replaceText: string;
  isRegex: boolean;
  sortOrder: number;
  enabled: boolean;
  note: string | null;
};

export function mapRule(r: Record<string, unknown>): ImportRule {
  const scope = String(r.scope || "global");
  return {
    id: String(r.id || ""),
    scope: scope === "source" || scope === "board" ? scope : "global",
    sourceSite: (r.source_site as string | null) || null,
    sourceBoard: (r.source_board as string | null) || null,
    findText: String(r.find_text || ""),
    replaceText: String(r.replace_text ?? ""),
    isRegex: Boolean(r.is_regex),
    sortOrder: Number(r.sort_order) || 0,
    enabled: r.enabled !== false,
    note: (r.note as string | null) || null,
  };
}

const SCOPE_RANK = { global: 0, source: 1, board: 2 } as const;

/** Rules that apply to one article, in application order (global first, board last). */
export function rulesFor(rules: ImportRule[], sourceSite: string, sourceBoard: string): ImportRule[] {
  return rules
    .filter((r) => r.enabled && r.findText)
    .filter((r) => {
      if (r.scope === "global") return true;
      if (r.scope === "source") return r.sourceSite === sourceSite;
      return r.sourceSite === sourceSite && r.sourceBoard === sourceBoard;
    })
    .sort((a, b) => SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope] || a.sortOrder - b.sortOrder);
}

/** Validates a regex rule; returns an error message or null. */
export function validateRulePattern(findText: string, isRegex: boolean): string | null {
  if (!findText || findText.length > 500) return "find_text_length";
  if (!isRegex) return null;
  if (findText.length > 200) return "regex_too_long";
  // Reject nested quantifiers, the usual catastrophic-backtracking shape.
  if (/\([^)]*[+*][^)]*\)[+*{]/.test(findText)) return "regex_nested_quantifier";
  try {
    new RegExp(findText, "g");
  } catch {
    return "regex_invalid";
  }
  return null;
}

export function applyRulesToText(text: string, rules: ImportRule[]): string {
  let out = text;
  for (const r of rules) {
    if (r.isRegex) {
      if (validateRulePattern(r.findText, true)) continue;
      out = out.replace(new RegExp(r.findText, "g"), r.replaceText);
    } else {
      out = out.split(r.findText).join(r.replaceText);
    }
  }
  return out;
}

export function applyRulesToBlocks(blocks: OperatorContentBlock[], rules: ImportRule[]): OperatorContentBlock[] {
  if (!rules.length) return blocks;
  return blocks
    .map((b): OperatorContentBlock => {
      if (b.type === "paragraph" || b.type === "heading" || b.type === "quote") {
        return { ...b, text: applyRulesToText(b.text, rules) };
      }
      if (b.type === "list") return { ...b, items: b.items.map((it) => applyRulesToText(it, rules)) };
      if (b.type === "link") return { ...b, text: b.text ? applyRulesToText(b.text, rules) : b.text };
      if (b.type === "image") {
        return { ...b, caption: b.caption ? applyRulesToText(b.caption, rules) : b.caption };
      }
      return b;
    })
    .filter((b) => !((b.type === "paragraph" || b.type === "heading" || b.type === "quote") && !b.text.trim()));
}

export async function loadRules(sb: SupabaseClient): Promise<ImportRule[]> {
  const { data, error } = await sb.from(RULES_TABLE).select("*").order("sort_order").order("created_at");
  if (error) throw new Error(`rules_load_failed: ${error.message}`);
  return (data || []).map((r) => mapRule(r as Record<string, unknown>));
}

export type RuleInput = {
  id?: string;
  scope: ImportRule["scope"];
  sourceSite?: string | null;
  sourceBoard?: string | null;
  findText: string;
  replaceText: string;
  isRegex?: boolean;
  sortOrder?: number;
  enabled?: boolean;
  note?: string | null;
};

export async function saveRule(sb: SupabaseClient, input: RuleInput, adminUserId: string): Promise<ImportRule> {
  const err = validateRulePattern(String(input.findText || ""), Boolean(input.isRegex));
  if (err) throw new Error(err);
  const scope = input.scope === "source" || input.scope === "board" ? input.scope : "global";
  if (scope !== "global" && !input.sourceSite) throw new Error("source_required_for_scope");
  if (scope === "board" && !input.sourceBoard) throw new Error("board_required_for_scope");
  const row: Record<string, unknown> = {
    scope,
    source_site: scope === "global" ? null : input.sourceSite,
    source_board: scope === "board" ? input.sourceBoard : null,
    find_text: input.findText,
    replace_text: String(input.replaceText ?? "").slice(0, 2000),
    is_regex: Boolean(input.isRegex),
    sort_order: Number(input.sortOrder) || 0,
    enabled: input.enabled !== false,
    note: input.note ? String(input.note).slice(0, 300) : null,
    updated_at: new Date().toISOString(),
  };
  const q = input.id
    ? sb.from(RULES_TABLE).update(row).eq("id", input.id).select("*").single()
    : sb.from(RULES_TABLE).insert({ ...row, created_by: adminUserId }).select("*").single();
  const { data, error } = await q;
  if (error || !data) throw new Error(error?.message || "rule_save_failed");
  return mapRule(data as Record<string, unknown>);
}

/** Rules are operator configuration (not content); turning one off is the normal path, removal is explicit. */
export async function setRuleEnabled(sb: SupabaseClient, id: string, enabled: boolean): Promise<void> {
  const { error } = await sb.from(RULES_TABLE).update({ enabled, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}
