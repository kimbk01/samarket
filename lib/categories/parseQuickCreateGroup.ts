import type { QuickCreateGroup } from "./types";

export function parseQuickCreateGroup(v: string | null | undefined): QuickCreateGroup | null {
  if (v === "content" || v === "trade") return v;
  return null;
}
