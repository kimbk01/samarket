import {
  isStorePaidAdPlacement,
  type StorePaidAdPlacement,
} from "@/lib/stores/store-paid-ad-campaign-authority";
import { isValidStoreDiscoveryCampaignWindow } from "@/lib/stores/store-discovery-campaign-authority";

export type StorePaidAdCampaignCreateInput = {
  storeId: string;
  placement: StorePaidAdPlacement;
  title: string;
  headline: string;
  bodyCopy: string | null;
  imageUrl: string | null;
  startAt: string;
  endAt: string;
  isActive: boolean;
};

export type StorePaidAdCampaignUpdateInput = {
  id: string;
  placement?: StorePaidAdPlacement;
  title?: string;
  headline?: string;
  bodyCopy?: string | null;
  imageUrl?: string | null;
  startAt?: string;
  endAt?: string;
  isActive?: boolean;
};

type ParseOk<T> = { ok: true; value: T };
type ParseFail = { ok: false; error: string; forbidden?: string[] };

function readString(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  return typeof v === "string" ? v.trim() : "";
}

export function parseStorePaidAdCampaignCreateBody(
  raw: unknown
): ParseOk<StorePaidAdCampaignCreateInput> | ParseFail {
  if (!raw || typeof raw !== "object") return { ok: false, error: "invalid_json" };
  const body = raw as Record<string, unknown>;
  const forbidden = Object.keys(body).filter(
    (k) => !["storeId", "store_id", "placement", "title", "headline", "bodyCopy", "body_copy", "imageUrl", "image_url", "startAt", "start_at", "endAt", "end_at", "isActive", "is_active"].includes(k)
  );
  if (forbidden.length) return { ok: false, error: "forbidden_fields", forbidden };

  const storeId = readString(body, "storeId") || readString(body, "store_id");
  const placementRaw = readString(body, "placement");
  const placement = isStorePaidAdPlacement(placementRaw) ? placementRaw : null;
  const title = readString(body, "title");
  const headline = readString(body, "headline");
  const bodyCopyRaw = body.bodyCopy ?? body.body_copy;
  const bodyCopy =
    bodyCopyRaw == null ? null : String(bodyCopyRaw).trim() ? String(bodyCopyRaw).trim() : null;
  const imageUrlRaw = body.imageUrl ?? body.image_url;
  const imageUrl =
    imageUrlRaw == null ? null : String(imageUrlRaw).trim() ? String(imageUrlRaw).trim() : null;
  const startAt = readString(body, "startAt") || readString(body, "start_at");
  const endAt = readString(body, "endAt") || readString(body, "end_at");
  const isActive = body.isActive !== false && body.is_active !== false;

  if (!storeId) return { ok: false, error: "missing_store_id" };
  if (!placement) return { ok: false, error: "invalid_placement" };
  if (!title) return { ok: false, error: "empty_title" };
  if (!headline) return { ok: false, error: "empty_headline" };
  if (!startAt) return { ok: false, error: "invalid_start_at" };
  if (!endAt) return { ok: false, error: "invalid_end_at" };
  if (!isValidStoreDiscoveryCampaignWindow({ startAt, endAt })) {
    return { ok: false, error: "invalid_window" };
  }

  return {
    ok: true,
    value: { storeId, placement, title, headline, bodyCopy, imageUrl, startAt, endAt, isActive },
  };
}

export function parseStorePaidAdCampaignUpdateBody(
  raw: unknown
): ParseOk<StorePaidAdCampaignUpdateInput> | ParseFail {
  if (!raw || typeof raw !== "object") return { ok: false, error: "invalid_json" };
  const body = raw as Record<string, unknown>;
  const forbidden = Object.keys(body).filter(
    (k) =>
      !["id", "placement", "title", "headline", "bodyCopy", "body_copy", "imageUrl", "image_url", "startAt", "start_at", "endAt", "end_at", "isActive", "is_active"].includes(k)
  );
  if (forbidden.length) return { ok: false, error: "forbidden_fields", forbidden };

  const id = readString(body, "id");
  if (!id) return { ok: false, error: "missing_id" };

  const out: StorePaidAdCampaignUpdateInput = { id };
  if ("placement" in body) {
    const p = readString(body, "placement");
    if (!isStorePaidAdPlacement(p)) return { ok: false, error: "invalid_placement" };
    out.placement = p;
  }
  if ("title" in body) {
    const title = readString(body, "title");
    if (!title) return { ok: false, error: "empty_title" };
    out.title = title;
  }
  if ("headline" in body) {
    const headline = readString(body, "headline");
    if (!headline) return { ok: false, error: "empty_headline" };
    out.headline = headline;
  }
  if ("bodyCopy" in body || "body_copy" in body) {
    const rawCopy = body.bodyCopy ?? body.body_copy;
    out.bodyCopy = rawCopy == null ? null : String(rawCopy).trim() ? String(rawCopy).trim() : null;
  }
  if ("imageUrl" in body || "image_url" in body) {
    const rawUrl = body.imageUrl ?? body.image_url;
    out.imageUrl = rawUrl == null ? null : String(rawUrl).trim() ? String(rawUrl).trim() : null;
  }
  if ("startAt" in body || "start_at" in body) {
    const startAt = readString(body, "startAt") || readString(body, "start_at");
    if (!startAt) return { ok: false, error: "invalid_start_at" };
    out.startAt = startAt;
  }
  if ("endAt" in body || "end_at" in body) {
    const endAt = readString(body, "endAt") || readString(body, "end_at");
    if (!endAt) return { ok: false, error: "invalid_end_at" };
    out.endAt = endAt;
  }
  if ("isActive" in body || "is_active" in body) {
    out.isActive = body.isActive !== false && body.is_active !== false;
  }
  return { ok: true, value: out };
}

export function resolveStorePaidAdCampaignUpdateWindow(
  current: { startAt: string; endAt: string },
  patch: StorePaidAdCampaignUpdateInput
): { startAt: string; endAt: string } | null {
  const startAt = patch.startAt ?? current.startAt;
  const endAt = patch.endAt ?? current.endAt;
  if (!isValidStoreDiscoveryCampaignWindow({ startAt, endAt })) return null;
  return { startAt, endAt };
}
