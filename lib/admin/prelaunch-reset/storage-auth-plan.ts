/**
 * CUT I-P0-11 — explicit Storage object + Auth user planning for Pre-launch Reset.
 * Only entity-referenced objects / clear ownership users. No bucket wipe / no guess prefixes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  POST_IMAGES_BUCKET,
  STORE_PRODUCT_IMAGES_BUCKET,
  type CanonicalImageBucket,
} from "@/lib/media/canonical-image-contract";
import { canonicalStoragePathsForOriginal } from "@/lib/media/canonical-image-upload.server";
import { parseSupabasePublicObjectUrl } from "@/lib/media/canonical-image-path";
import { DELIVERY_AD_CREATIVE_TABLE } from "@/lib/stores/advertising/delivery-ad-creative";
import { isManualLocalEmailCandidate } from "@/lib/admin/prelaunch-reset/protection";
import type { PrelaunchResetPreset } from "@/lib/admin/prelaunch-reset/types";
import type { PrelaunchPresetSpec } from "@/lib/admin/prelaunch-reset/presets";

/** Delivery ad banner creatives — path stored on delivery_ad_creatives.asset_path. */
export const DELIVERY_AD_CREATIVE_STORAGE_BUCKET = "admin-notification-campaign-images" as const;

export type PrelaunchResetStorageObject = {
  bucket: string;
  path: string;
  sourceKind: "member" | "store" | "content" | "delivery_ad";
  sourceId: string;
  reference: string;
};

export type PrelaunchResetAuthTarget = {
  userId: string;
  email: string | null;
  linkedEntity: string;
  action: "DELETE" | "PRESERVE" | "BLOCKED";
  reason: string;
};

function uniqObjects(items: PrelaunchResetStorageObject[]): PrelaunchResetStorageObject[] {
  const seen = new Set<string>();
  const out: PrelaunchResetStorageObject[] = [];
  for (const item of items) {
    const key = `${item.bucket}::${item.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.sort((a, b) => `${a.bucket}/${a.path}`.localeCompare(`${b.bucket}/${b.path}`));
}

function pushFromUrlOrPath(
  out: PrelaunchResetStorageObject[],
  raw: string | null | undefined,
  meta: Omit<PrelaunchResetStorageObject, "bucket" | "path">,
  fallbackBucket?: string
): void {
  const v = String(raw ?? "").trim();
  if (!v) return;

  const parsed = parseSupabasePublicObjectUrl(v);
  if (parsed) {
    const paths = canonicalStoragePathsForOriginal(
      parsed.path,
      parsed.bucket as CanonicalImageBucket
    );
    for (const path of paths) {
      out.push({ ...meta, bucket: parsed.bucket, path });
    }
    return;
  }

  // Relative path under known buckets (post-images / store-product-images)
  if (!/^https?:\/\//i.test(v) && fallbackBucket) {
    const path = v.replace(/^\//, "");
    if (!path.includes("..") && path.length > 0) {
      if (
        fallbackBucket === POST_IMAGES_BUCKET ||
        fallbackBucket === STORE_PRODUCT_IMAGES_BUCKET
      ) {
        const paths = canonicalStoragePathsForOriginal(
          path,
          fallbackBucket as CanonicalImageBucket
        );
        for (const p of paths) {
          out.push({ ...meta, bucket: fallbackBucket, path: p });
        }
      } else {
        out.push({ ...meta, bucket: fallbackBucket, path });
      }
    }
    return;
  }

  // Delivery creative public URL (not covered by parseSupabasePublicObjectUrl)
  const marker = `/object/public/${DELIVERY_AD_CREATIVE_STORAGE_BUCKET}/`;
  const idx = v.indexOf(marker);
  if (idx >= 0) {
    const path = v.slice(idx + marker.length).split("?")[0] ?? "";
    if (path && !path.includes("..")) {
      out.push({ ...meta, bucket: DELIVERY_AD_CREATIVE_STORAGE_BUCKET, path });
    }
  }
}

function collectImageFields(value: unknown, into: string[]): void {
  if (value == null) return;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return;
    if (t.startsWith("[")) {
      try {
        collectImageFields(JSON.parse(t), into);
      } catch {
        into.push(t);
      }
      return;
    }
    into.push(t);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectImageFields(item, into);
    return;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const k of ["url", "image_url", "src", "storage_path", "path", "avatar_url"]) {
      if (typeof o[k] === "string") into.push(String(o[k]));
    }
  }
}

export async function planPrelaunchResetStorageObjects(
  sb: SupabaseClient,
  input: {
    safeMemberIds: string[];
    storeIds: string[];
    contentIds: string[];
    deliveryAdCampaignIds: string[];
  }
): Promise<{ objects: PrelaunchResetStorageObject[]; warnings: string[] }> {
  const out: PrelaunchResetStorageObject[] = [];
  const warnings: string[] = [];

  const addPostRows = async (
    ids: string[],
    idColumn: "id" | "user_id",
    sourceKind: "content" | "member"
  ) => {
    if (!ids.length) return;
    const { data, error } = await sb
      .from("posts")
      .select("id,user_id,images,thumbnail_url")
      .in(idColumn, ids)
      .limit(500);
    if (error) {
      warnings.push(`posts_storage:${error.message}`);
      return;
    }
    for (const row of data ?? []) {
      const sourceId = String(
        sourceKind === "content" ? row.id : row.user_id ?? ids[0]
      );
      const refs: string[] = [];
      collectImageFields(row.images, refs);
      collectImageFields(row.thumbnail_url, refs);
      for (const ref of refs) {
        pushFromUrlOrPath(
          out,
          ref,
          {
            sourceKind,
            sourceId,
            reference: `posts.${sourceKind === "content" ? "id" : "user_id"}`,
          },
          POST_IMAGES_BUCKET
        );
      }
    }
  };

  await addPostRows(input.contentIds, "id", "content");
  await addPostRows(input.safeMemberIds, "user_id", "member");

  if (input.safeMemberIds.length) {
    const { data: profiles, error } = await sb
      .from("profiles")
      .select("id,avatar_url")
      .in("id", input.safeMemberIds)
      .limit(200);
    if (error) warnings.push(`profiles_storage:${error.message}`);
    for (const row of profiles ?? []) {
      pushFromUrlOrPath(
        out,
        row.avatar_url as string | null,
        {
          sourceKind: "member",
          sourceId: String(row.id),
          reference: "profiles.avatar_url",
        },
        POST_IMAGES_BUCKET
      );
    }

    const { data: cposts, error: cErr } = await sb
      .from("community_posts")
      .select("id,user_id,images")
      .in("user_id", input.safeMemberIds)
      .limit(500);
    if (cErr) warnings.push(`community_posts_storage:${cErr.message}`);
    for (const row of cposts ?? []) {
      const refs: string[] = [];
      collectImageFields(row.images, refs);
      for (const ref of refs) {
        pushFromUrlOrPath(
          out,
          ref,
          {
            sourceKind: "member",
            sourceId: String(row.user_id),
            reference: "community_posts.images",
          },
          POST_IMAGES_BUCKET
        );
      }
    }
  }

  if (input.storeIds.length) {
    const { data: stores, error } = await sb
      .from("stores")
      .select("id,profile_image_url,gallery_images_json")
      .in("id", input.storeIds)
      .limit(200);
    if (error) warnings.push(`stores_storage:${error.message}`);
    for (const row of stores ?? []) {
      pushFromUrlOrPath(
        out,
        row.profile_image_url as string | null,
        {
          sourceKind: "store",
          sourceId: String(row.id),
          reference: "stores.profile_image_url",
        },
        STORE_PRODUCT_IMAGES_BUCKET
      );
      const galleryRefs: string[] = [];
      collectImageFields(row.gallery_images_json, galleryRefs);
      for (const ref of galleryRefs) {
        pushFromUrlOrPath(
          out,
          ref,
          {
            sourceKind: "store",
            sourceId: String(row.id),
            reference: "stores.gallery_images_json",
          },
          STORE_PRODUCT_IMAGES_BUCKET
        );
      }
    }

    const { data: products, error: pErr } = await sb
      .from("store_products")
      .select("id,store_id,thumbnail_url,images_json")
      .in("store_id", input.storeIds)
      .limit(500);
    if (pErr) warnings.push(`store_products_storage:${pErr.message}`);
    for (const row of products ?? []) {
      const refs: string[] = [];
      collectImageFields(row.thumbnail_url, refs);
      collectImageFields(row.images_json, refs);
      for (const ref of refs) {
        pushFromUrlOrPath(
          out,
          ref,
          {
            sourceKind: "store",
            sourceId: String(row.store_id),
            reference: "store_products",
          },
          STORE_PRODUCT_IMAGES_BUCKET
        );
      }
    }
  }

  if (input.deliveryAdCampaignIds.length) {
    const { data: creatives, error } = await sb
      .from(DELIVERY_AD_CREATIVE_TABLE)
      .select("id,campaign_id,asset_path")
      .in("campaign_id", input.deliveryAdCampaignIds)
      .limit(200);
    if (error) warnings.push(`delivery_ad_creatives_storage:${error.message}`);
    for (const row of creatives ?? []) {
      const path = String(row.asset_path ?? "").trim();
      if (!path || path.includes("..")) continue;
      if (/^https?:\/\//i.test(path)) {
        pushFromUrlOrPath(out, path, {
          sourceKind: "delivery_ad",
          sourceId: String(row.campaign_id),
          reference: "delivery_ad_creatives.asset_path",
        });
      } else {
        out.push({
          bucket: DELIVERY_AD_CREATIVE_STORAGE_BUCKET,
          path,
          sourceKind: "delivery_ad",
          sourceId: String(row.campaign_id),
          reference: "delivery_ad_creatives.asset_path",
        });
      }
    }

    const { data: camps, error: cErr } = await sb
      .from("delivery_ad_campaigns")
      .select("id,image_url")
      .in("id", input.deliveryAdCampaignIds)
      .limit(200);
    if (cErr) warnings.push(`delivery_ad_campaigns_storage:${cErr.message}`);
    for (const row of camps ?? []) {
      const raw = String(row.image_url ?? "").trim();
      if (!raw) continue;
      if (/^https?:\/\//i.test(raw)) {
        pushFromUrlOrPath(out, raw, {
          sourceKind: "delivery_ad",
          sourceId: String(row.id),
          reference: "delivery_ad_campaigns.image_url",
        });
      } else if (!raw.includes("..")) {
        out.push({
          bucket: DELIVERY_AD_CREATIVE_STORAGE_BUCKET,
          path: raw,
          sourceKind: "delivery_ad",
          sourceId: String(row.id),
          reference: "delivery_ad_campaigns.image_url",
        });
      }
    }
  }

  return { objects: uniqObjects(out), warnings };
}

export async function planPrelaunchResetAuthTargets(
  sb: SupabaseClient,
  input: {
    safeMemberIds: string[];
    protectedIds: Set<string>;
    preset: PrelaunchResetPreset;
    presetSpec: PrelaunchPresetSpec;
  }
): Promise<PrelaunchResetAuthTarget[]> {
  const targets: PrelaunchResetAuthTarget[] = [];
  if (input.safeMemberIds.length === 0) return targets;

  const authAllowed = input.presetSpec.executeAuthPhase === "EXPLICIT_SAFE_MEMBER";

  for (const userId of input.safeMemberIds) {
    if (input.protectedIds.has(userId)) {
      targets.push({
        userId,
        email: null,
        linkedEntity: `member:${userId}`,
        action: "BLOCKED",
        reason: "protected_admin_or_current_user",
      });
      continue;
    }

    if (!authAllowed) {
      targets.push({
        userId,
        email: null,
        linkedEntity: `member:${userId}`,
        action: "PRESERVE",
        reason: "auth_phase_forbidden_by_preset",
      });
      continue;
    }

    // Resolve email via auth admin API when available; fallback profiles
    let email: string | null = null;
    try {
      const { data, error } = await sb.auth.admin.getUserById(userId);
      if (!error && data?.user) {
        email = data.user.email ?? null;
      }
    } catch {
      email = null;
    }
    if (!email) {
      const { data: profile } = await sb
        .from("profiles")
        .select("email")
        .eq("id", userId)
        .maybeSingle();
      email = (profile as { email?: string | null } | null)?.email ?? null;
    }

    if (!email) {
      targets.push({
        userId,
        email: null,
        linkedEntity: `member:${userId}`,
        action: "BLOCKED",
        reason: "ambiguous_ownership_no_email",
      });
      continue;
    }

    if (!isManualLocalEmailCandidate(email)) {
      targets.push({
        userId,
        email,
        linkedEntity: `member:${userId}`,
        action: "BLOCKED",
        reason: "not_safe_manual_local_test_identity",
      });
      continue;
    }

    targets.push({
      userId,
      email,
      linkedEntity: `member:${userId}`,
      action: "DELETE",
      reason: "explicit_safe_manual_local_member",
    });
  }

  return targets.sort((a, b) => a.userId.localeCompare(b.userId));
}
