import { helloCebuAdapter } from "./hellocebuph";
import { philgoAdapter } from "./philgo";
import { philsamoAdapter } from "./philsamo";
import type { SiteAdapter } from "../types";

const ADAPTERS: Record<string, SiteAdapter> = {
  philsamo: philsamoAdapter,
  hellocebuph: helloCebuAdapter,
  philgo: philgoAdapter,
};

export function getSiteAdapter(adapterKey: string): SiteAdapter {
  const a = ADAPTERS[adapterKey];
  if (!a) throw new Error(`unknown_adapter:${adapterKey}`);
  return a;
}

export function listRegisteredAdapters(): SiteAdapter[] {
  return Object.values(ADAPTERS);
}
