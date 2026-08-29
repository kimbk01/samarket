/**
 * CUT G — tamper-evident Delivery Ad exposure tokens (HMAC).
 * Preview tokens cannot mint Production events.
 */

import { createHmac, createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  DeliveryAdEventDestinationType,
  DeliveryAdEventProductKind,
  DeliveryAdExposureTokenPayload,
} from "@/lib/stores/advertising/delivery-ad-event-contract";

const DEFAULT_TTL_MS = 30 * 60 * 1000;

function exposureTokenSecret(): string {
  return (
    process.env.DELIVERY_AD_EXPOSURE_TOKEN_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "dibay-dev-delivery-ad-exposure-secret"
  );
}

function signEncoded(encoded: string): string {
  return createHmac("sha256", exposureTokenSecret()).update(encoded).digest("base64url");
}

export function issueDeliveryAdExposureToken(
  input: Omit<DeliveryAdExposureTokenPayload, "v" | "exp"> & { ttlMs?: number }
): { token: string; payload: DeliveryAdExposureTokenPayload } {
  const payload: DeliveryAdExposureTokenPayload = {
    v: 1,
    campaignId: input.campaignId,
    productKind: input.productKind,
    creativeId: input.creativeId,
    inventoryId: input.inventoryId,
    storeId: input.storeId,
    surface: input.surface,
    placementIndex: input.placementIndex,
    renderInstanceId: input.renderInstanceId,
    destinationType: input.destinationType,
    destinationId: input.destinationId,
    preview: input.preview === true,
    exp: Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${encoded}.${signEncoded(encoded)}`;
  return { token, payload };
}

export function verifyDeliveryAdExposureToken(
  token: string
):
  | { ok: true; payload: DeliveryAdExposureTokenPayload }
  | { ok: false; error: "invalid_token" | "expired" | "preview_forbidden" } {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 2) return { ok: false, error: "invalid_token" };
  const [encoded, sig] = parts;
  const expected = signEncoded(encoded);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "invalid_token" };
  }
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as DeliveryAdExposureTokenPayload;
    if (payload?.v !== 1 || !payload.campaignId || !payload.productKind) {
      return { ok: false, error: "invalid_token" };
    }
    if (Date.now() > Number(payload.exp)) return { ok: false, error: "expired" };
    return { ok: true, payload };
  } catch {
    return { ok: false, error: "invalid_token" };
  }
}

/** Privacy-safe session hash — never store raw user id / IP. */
export function hashDeliveryAdViewerSession(seed: string): string {
  return createHash("sha256").update(`delivery-ad-session:${seed}`).digest("hex").slice(0, 48);
}

/** Server-only attribution bridge (authenticated buyer → click matching). Not written as raw user_id. */
export function hashDeliveryAdAttributionBridge(userId: string): string {
  const pepper =
    process.env.DELIVERY_AD_ATTRIBUTION_BRIDGE_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "dibay-dev-delivery-ad-bridge";
  return createHash("sha256").update(`delivery-ad-bridge:${pepper}:${userId}`).digest("hex");
}

export function newDeliveryAdRenderInstanceId(): string {
  return randomUUID();
}

export function newDeliveryAdEventId(): string {
  return randomUUID();
}

export type ExposureTokenIssueInput = {
  campaignId: string;
  productKind: DeliveryAdEventProductKind;
  creativeId?: string | null;
  inventoryId?: string | null;
  storeId: string;
  surface: string;
  placementIndex?: number;
  destinationType: DeliveryAdEventDestinationType;
  destinationId: string;
  preview?: boolean;
  renderInstanceId?: string;
};

export function issueEligibleDeliveryAdExposure(input: ExposureTokenIssueInput) {
  return issueDeliveryAdExposureToken({
    campaignId: input.campaignId,
    productKind: input.productKind,
    creativeId: input.creativeId ?? null,
    inventoryId: input.inventoryId ?? null,
    storeId: input.storeId,
    surface: input.surface,
    placementIndex: input.placementIndex ?? 0,
    renderInstanceId: input.renderInstanceId ?? newDeliveryAdRenderInstanceId(),
    destinationType: input.destinationType,
    destinationId: input.destinationId,
    preview: input.preview === true,
  });
}
