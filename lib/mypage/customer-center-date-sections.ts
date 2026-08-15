/**
 * Group Customer Center board list rows by local calendar day.
 */

export type CustomerCenterDateSection<T extends { createdAt: string }> = {
  sectionKey: string;
  sectionLabel: string;
  items: T[];
};

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function groupCustomerCenterItemsByDate<T extends { createdAt: string }>(
  items: T[],
  language: "ko" | "en"
): CustomerCenterDateSection<T>[] {
  if (items.length === 0) return [];
  const locale = language === "ko" ? "ko-KR" : "en-US";
  const buckets = new Map<string, T[]>();
  const order: string[] = [];

  for (const item of items) {
    const day = startOfLocalDay(new Date(item.createdAt));
    const key = Number.isFinite(day) ? `d:${day}` : "d:0";
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(item);
  }

  order.sort((a, b) => Number(b.slice(2)) - Number(a.slice(2)));

  return order.map((key) => {
    const ms = Number(key.slice(2));
    const sectionLabel = Number.isFinite(ms)
      ? new Date(ms).toLocaleDateString(locale, {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "";
    return { sectionKey: key, sectionLabel, items: buckets.get(key) ?? [] };
  });
}
