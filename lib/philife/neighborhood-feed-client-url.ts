import { philifeNeighborhoodFeedUrl } from "@domain/philife/api";

export const NEIGHBORHOOD_FEED_PAGE_SIZE = 20;

export function buildPhilifeNeighborhoodFeedClientUrl(input: {
  locationKey: string;
  /** `neighborhoodLocationMetaFromRegion` 결과 또는 null */
  meta: { city: string; district: string; name: string; label: string } | null;
  /** meta.name 대체용 라벨 (Region 라벨 등) */
  locationLabelFallback: string;
  regionLabel?: string | null;
  category?: string;
  neighborOnly?: boolean;
  offset?: number;
  limit?: number;
}): string {
  const p = new URLSearchParams();
  p.set("locationKey", input.locationKey);
  const m = input.meta;
  p.set("city", m?.city ?? "");
  p.set("district", m?.district ?? "");
  p.set("name", m?.name ?? (input.locationLabelFallback || input.regionLabel?.trim() || ""));
  p.set("limit", String(input.limit ?? NEIGHBORHOOD_FEED_PAGE_SIZE));
  p.set("offset", String(input.offset ?? 0));
  if (input.category) p.set("category", input.category);
  if (input.neighborOnly) p.set("neighborOnly", "1");
  return philifeNeighborhoodFeedUrl(p.toString());
}
