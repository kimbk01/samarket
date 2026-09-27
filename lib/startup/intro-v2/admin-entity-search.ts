/**
 * Typed CTA entity search — operators pick a row, not a raw ID.
 */

export type IntroEntityKind = "STORE" | "PRODUCT" | "LISTING" | "POST" | "CHAT_ROOM" | "EVENT";

export type IntroEntityHit = {
  id: string;
  label: string;
  subtitle?: string;
};

type QueryClient = {
  from: (table: string) => any;
};

function rows(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

export async function searchIntroEntities(
  sb: QueryClient,
  kind: IntroEntityKind,
  query: string
): Promise<IntroEntityHit[]> {
  const q = query.trim();
  if (q.length < 1) return [];

  if (kind === "STORE") {
    const { data } = await sb
      .from("stores")
      .select("id, store_name, slug")
      .or(`store_name.ilike.%${q}%,slug.ilike.%${q}%,id.eq.${q}`)
      .limit(20);
    return rows(data).map((r) => ({
      id: String(r.id),
      label: String(r.store_name ?? r.slug ?? r.id),
      subtitle: r.slug ? String(r.slug) : undefined,
    }));
  }

  if (kind === "PRODUCT") {
    const { data } = await sb
      .from("store_products")
      .select("id, name, store_id")
      .ilike("name", `%${q}%`)
      .limit(20);
    return rows(data).map((r) => ({
      id: String(r.id),
      label: String(r.name ?? r.id),
      subtitle: r.store_id ? String(r.store_id) : undefined,
    }));
  }

  if (kind === "LISTING" || kind === "POST") {
    const { data } = await sb
      .from("posts")
      .select("id, title, type")
      .ilike("title", `%${q}%`)
      .limit(20);
    return rows(data).map((r) => ({
      id: String(r.id),
      label: String(r.title ?? r.id),
      subtitle: r.type ? String(r.type) : undefined,
    }));
  }

  if (kind === "EVENT") {
    const { data } = await sb
      .from("platform_events")
      .select("id, title, status")
      .ilike("title", `%${q}%`)
      .limit(20);
    return rows(data).map((r) => ({
      id: String(r.id),
      label: String(r.title ?? r.id),
      subtitle: r.status ? String(r.status) : undefined,
    }));
  }

  const { data } = await sb
    .from("community_messenger_rooms")
    .select("id, title")
    .ilike("title", `%${q}%`)
    .limit(20);
  return rows(data).map((r) => ({
    id: String(r.id),
    label: String(r.title ?? r.id),
  }));
}
