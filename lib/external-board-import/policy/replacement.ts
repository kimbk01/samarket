import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExternalBoardDocument, ExternalBoardNode } from "@/lib/external-board-import/types";

export type ReplacementRule = {
  id: string;
  source_id: string;
  from_text: string;
  to_text: string;
  apply_title: boolean;
  apply_body: boolean;
  priority: number;
  enabled: boolean;
};

export async function listReplacementRules(
  sb: SupabaseClient,
  sourceId: string
): Promise<ReplacementRule[]> {
  const { data, error } = await sb
    .from("external_board_replacement_rules")
    .select("*")
    .eq("source_id", sourceId)
    .eq("enabled", true)
    .order("priority", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String((r as { id: string }).id),
    source_id: String((r as { source_id: string }).source_id),
    from_text: String((r as { from_text: string }).from_text),
    to_text: String((r as { to_text?: string }).to_text ?? ""),
    apply_title: Boolean((r as { apply_title?: boolean }).apply_title),
    apply_body: Boolean((r as { apply_body?: boolean }).apply_body),
    priority: Number((r as { priority?: number }).priority ?? 100),
    enabled: Boolean((r as { enabled?: boolean }).enabled),
  }));
}

function applyExact(text: string, from: string, to: string): string {
  if (!from) return text;
  return text.split(from).join(to);
}

function applyToNode(node: ExternalBoardNode, rules: ReplacementRule[]): ExternalBoardNode {
  const bodyRules = rules.filter((r) => r.apply_body && r.from_text);
  const mapText = (t: string) => bodyRules.reduce((acc, r) => applyExact(acc, r.from_text, r.to_text), t);
  switch (node.type) {
    case "paragraph":
    case "quote":
      return { ...node, text: mapText(node.text) };
    case "list":
      return { ...node, items: node.items.map(mapText) };
    case "link":
      return { ...node, text: mapText(node.text) };
    case "image":
      return { ...node, alt: node.alt != null ? mapText(node.alt) : node.alt };
    default:
      return node;
  }
}

export function applyReplacementPolicy(
  doc: ExternalBoardDocument,
  rules: ReplacementRule[]
): ExternalBoardDocument {
  const enabled = [...rules].filter((r) => r.enabled && r.from_text).sort((a, b) => a.priority - b.priority);
  const titleRules = enabled.filter((r) => r.apply_title);
  const title = titleRules.reduce((acc, r) => applyExact(acc, r.from_text, r.to_text), doc.title);
  return {
    ...doc,
    title,
    nodes: doc.nodes.map((n) => applyToNode(n, enabled)),
  };
}

export async function createReplacementRule(
  sb: SupabaseClient,
  input: {
    sourceId: string;
    fromText: string;
    toText?: string;
    applyTitle?: boolean;
    applyBody?: boolean;
    priority?: number;
  }
): Promise<ReplacementRule> {
  const { data, error } = await sb
    .from("external_board_replacement_rules")
    .insert({
      source_id: input.sourceId,
      from_text: input.fromText,
      to_text: input.toText ?? "",
      apply_title: input.applyTitle ?? true,
      apply_body: input.applyBody ?? true,
      priority: input.priority ?? 100,
      enabled: true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    source_id: String(r.source_id),
    from_text: String(r.from_text),
    to_text: String(r.to_text ?? ""),
    apply_title: Boolean(r.apply_title),
    apply_body: Boolean(r.apply_body),
    priority: Number(r.priority ?? 100),
    enabled: Boolean(r.enabled),
  };
}
