/**
 * W — Admin Campaign HTTP Writer validation (pure + parse).
 * Does not touch Discovery ranking / Composition / Composer.
 */

import {
  isStoreDiscoveryCampaignType,
  isValidStoreDiscoveryCampaignWindow,
  type StoreDiscoveryCampaignType,
} from "@/lib/stores/store-discovery-campaign-authority";

export const STORE_DISCOVERY_CAMPAIGN_FORBIDDEN_WRITE_KEYS = [
  "store_id",
  "created_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at",
  "ranking",
  "ranking_weight",
  "weight",
  "position",
  "composition",
  "composition_order",
  "composition_max",
  "featured",
  "is_featured",
  "ad",
  "coupon",
] as const;

export type StoreDiscoveryCampaignCreateInput = {
  storeId: string;
  campaignType: StoreDiscoveryCampaignType;
  title: string;
  bodyCopy: string | null;
  startAt: string;
  endAt: string;
  isActive: boolean;
};

export type StoreDiscoveryCampaignUpdateInput = {
  id: string;
  campaignType?: StoreDiscoveryCampaignType;
  title?: string;
  bodyCopy?: string | null;
  startAt?: string;
  endAt?: string;
  isActive?: boolean;
};

export type StoreDiscoveryCampaignValidationError =
  | "forbidden_fields"
  | "missing_store_id"
  | "missing_id"
  | "invalid_campaign_type"
  | "empty_title"
  | "invalid_start_at"
  | "invalid_end_at"
  | "invalid_window"
  | "store_id_not_allowed_on_update";

function trimString(value: unknown): string {
  return String(value ?? "").trim();
}

function parseIsoInstant(value: unknown): string | null {
  const t = trimString(value);
  if (!t) return null;
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function detectForbiddenStoreDiscoveryCampaignWriteFields(
  body: Record<string, unknown>
): string[] {
  const forbidden = new Set<string>(STORE_DISCOVERY_CAMPAIGN_FORBIDDEN_WRITE_KEYS);
  return Object.keys(body).filter((k) => forbidden.has(k));
}

const CREATE_ALLOWED = new Set([
  "storeId",
  "campaignType",
  "title",
  "bodyCopy",
  "startAt",
  "endAt",
  "isActive",
]);

const UPDATE_ALLOWED = new Set([
  "id",
  "campaignType",
  "title",
  "bodyCopy",
  "startAt",
  "endAt",
  "isActive",
]);

export function detectUnexpectedStoreDiscoveryCampaignWriteFields(
  body: Record<string, unknown>,
  mode: "create" | "update"
): string[] {
  const allowed = mode === "create" ? CREATE_ALLOWED : UPDATE_ALLOWED;
  return Object.keys(body).filter((k) => !allowed.has(k));
}

export function parseStoreDiscoveryCampaignCreateBody(
  raw: unknown
):
  | { ok: true; value: StoreDiscoveryCampaignCreateInput }
  | { ok: false; error: StoreDiscoveryCampaignValidationError; forbidden?: string[] } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "missing_store_id" };
  }
  const body = raw as Record<string, unknown>;
  const forbidden = [
    ...detectForbiddenStoreDiscoveryCampaignWriteFields(body),
    ...detectUnexpectedStoreDiscoveryCampaignWriteFields(body, "create"),
  ];
  if (forbidden.length > 0) {
    return { ok: false, error: "forbidden_fields", forbidden };
  }

  const storeId = trimString(body.storeId);
  if (!storeId) return { ok: false, error: "missing_store_id" };

  const campaignTypeRaw = body.campaignType;
  if (!isStoreDiscoveryCampaignType(campaignTypeRaw)) {
    return { ok: false, error: "invalid_campaign_type" };
  }

  const title = trimString(body.title);
  if (!title) return { ok: false, error: "empty_title" };

  const startAt = parseIsoInstant(body.startAt);
  const endAt = parseIsoInstant(body.endAt);
  if (!startAt) return { ok: false, error: "invalid_start_at" };
  if (!endAt) return { ok: false, error: "invalid_end_at" };
  if (!isValidStoreDiscoveryCampaignWindow({ startAt, endAt })) {
    return { ok: false, error: "invalid_window" };
  }

  const bodyCopyRaw = body.bodyCopy;
  const bodyCopy =
    bodyCopyRaw == null
      ? null
      : trimString(bodyCopyRaw)
        ? trimString(bodyCopyRaw)
        : null;

  const isActive = body.isActive === undefined ? true : body.isActive === true;

  return {
    ok: true,
    value: {
      storeId,
      campaignType: campaignTypeRaw,
      title,
      bodyCopy,
      startAt,
      endAt,
      isActive,
    },
  };
}

export function parseStoreDiscoveryCampaignUpdateBody(
  raw: unknown
):
  | { ok: true; value: StoreDiscoveryCampaignUpdateInput }
  | { ok: false; error: StoreDiscoveryCampaignValidationError; forbidden?: string[] } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "missing_id" };
  }
  const body = raw as Record<string, unknown>;

  if (body.storeId != null && trimString(body.storeId)) {
    return { ok: false, error: "store_id_not_allowed_on_update" };
  }

  const forbidden = [
    ...detectForbiddenStoreDiscoveryCampaignWriteFields(body),
    ...detectUnexpectedStoreDiscoveryCampaignWriteFields(body, "update"),
  ];
  if (forbidden.length > 0) {
    return { ok: false, error: "forbidden_fields", forbidden };
  }

  const id = trimString(body.id);
  if (!id) return { ok: false, error: "missing_id" };

  const patch: StoreDiscoveryCampaignUpdateInput = { id };

  if (body.campaignType !== undefined) {
    if (!isStoreDiscoveryCampaignType(body.campaignType)) {
      return { ok: false, error: "invalid_campaign_type" };
    }
    patch.campaignType = body.campaignType;
  }

  if (body.title !== undefined) {
    const title = trimString(body.title);
    if (!title) return { ok: false, error: "empty_title" };
    patch.title = title;
  }

  if (body.bodyCopy !== undefined) {
    const bodyCopy =
      body.bodyCopy == null
        ? null
        : trimString(body.bodyCopy)
          ? trimString(body.bodyCopy)
          : null;
    patch.bodyCopy = bodyCopy;
  }

  if (body.startAt !== undefined) {
    const startAt = parseIsoInstant(body.startAt);
    if (!startAt) return { ok: false, error: "invalid_start_at" };
    patch.startAt = startAt;
  }

  if (body.endAt !== undefined) {
    const endAt = parseIsoInstant(body.endAt);
    if (!endAt) return { ok: false, error: "invalid_end_at" };
    patch.endAt = endAt;
  }

  if (body.isActive !== undefined) {
    patch.isActive = body.isActive === true;
  }

  const hasPatch =
    patch.campaignType !== undefined ||
    patch.title !== undefined ||
    patch.bodyCopy !== undefined ||
    patch.startAt !== undefined ||
    patch.endAt !== undefined ||
    patch.isActive !== undefined;
  if (!hasPatch) {
    return { ok: false, error: "forbidden_fields", forbidden: ["no_mutable_fields"] };
  }

  return { ok: true, value: patch };
}

/** Merge patch with existing row and validate resulting window when times change. */
export function resolveStoreDiscoveryCampaignUpdateWindow(
  existing: { startAt: string; endAt: string },
  patch: StoreDiscoveryCampaignUpdateInput
): { startAt: string; endAt: string } | null {
  const startAt = patch.startAt ?? existing.startAt;
  const endAt = patch.endAt ?? existing.endAt;
  if (!isValidStoreDiscoveryCampaignWindow({ startAt, endAt })) return null;
  return { startAt, endAt };
}
