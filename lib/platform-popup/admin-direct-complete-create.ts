import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateCampaignImageFile } from "@/lib/admin/notification-campaigns/validate-campaign-image";
import {
  createPlatformPopupAdminCampaign,
  replacePlatformPopupReadyCreative,
  updatePlatformPopupAdminCampaign,
} from "@/lib/platform-popup/admin-campaign-writer";
import { adminApprovePlatformPopupCampaign } from "@/lib/platform-popup/admin-transitions";
import { processPlatformPopupCreativeToCanonical } from "@/lib/platform-popup/creative-pipeline";
import { POPUP_CREATIVE_SOURCE_MAX_BYTES } from "@/lib/platform-popup/creative-pixel-ssot";

const BUCKET = "platform-popup-creatives";

export type AdminDirectPopupCompleteCreateInput = {
  adminUserId: string;
  name: string;
  surfaces: string[];
  startAt: string;
  endAt: string;
  ctaTarget: string;
  file: File;
  publishMode: "live" | "scheduled";
  altText?: string | null;
  priority?: number;
};

export type AdminDirectPopupCompleteCreateResult =
  | { ok: true; id: string; status: "active" | "scheduled" }
  | {
      ok: false;
      incomplete: boolean;
      id?: string;
      error: string;
      httpStatus?: number;
    };

export async function createAdminDirectPopupComplete(
  sb: SupabaseClient,
  input: AdminDirectPopupCompleteCreateInput
): Promise<AdminDirectPopupCompleteCreateResult> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, incomplete: false, error: "name_required", httpStatus: 400 };
  }

  const validated = validateCampaignImageFile(input.file, {
    maxBytes: POPUP_CREATIVE_SOURCE_MAX_BYTES,
  });
  if (!validated.ok) {
    return { ok: false, incomplete: false, error: validated.error, httpStatus: 400 };
  }

  const created = await createPlatformPopupAdminCampaign(sb, {
    adminUserId: input.adminUserId,
    name,
    surfaces: input.surfaces,
    priority: input.priority ?? 100,
  });
  if (!created.ok) {
    return {
      ok: false,
      incomplete: false,
      error: created.error,
      httpStatus: created.httpStatus,
    };
  }
  const id = created.id;
  const restoreDraft = async () => {
    await sb
      .from("platform_popup_campaigns")
      .update({
        status: "draft",
        approval_status: "not_submitted",
        approved_by: null,
        approved_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
  };

  try {
    const updated = await updatePlatformPopupAdminCampaign(sb, {
      campaignId: id,
      adminUserId: input.adminUserId,
      patch: {
        startAt: input.startAt,
        endAt: input.endAt,
        ctaType: "internal_page",
        ctaTarget: input.ctaTarget,
        surfaces: input.surfaces,
      },
      materialTouched: ["schedule", "cta", "surfaces"],
    });
    if (!updated.ok) {
      return {
        ok: false,
        incomplete: true,
        id,
        error: updated.error,
        httpStatus: updated.httpStatus,
      };
    }

    const source = Buffer.from(await input.file.arrayBuffer());
    const metadata = await sharp(source, {
      failOn: "none",
      limitInputPixels: false,
    })
      .rotate()
      .metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width <= 0 || height <= 0) {
      return { ok: false, incomplete: true, id, error: "invalid_dimensions", httpStatus: 400 };
    }

    const processed = await processPlatformPopupCreativeToCanonical({
      buffer: source,
      width,
      height,
      applyCenterCrop: true,
    });
    if (!processed.ok) {
      return {
        ok: false,
        incomplete: true,
        id,
        error: processed.error,
        httpStatus: 400,
      };
    }

    const path = `campaigns/${id}/${input.adminUserId}/${randomUUID()}.webp`;
    const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, processed.buffer, {
      contentType: "image/webp",
      upsert: false,
    });
    if (uploadError) {
      return {
        ok: false,
        incomplete: true,
        id,
        error: uploadError.message || "upload_failed",
        httpStatus: 500,
      };
    }

    const {
      data: { publicUrl },
    } = sb.storage.from(BUCKET).getPublicUrl(path);
    const creative = await replacePlatformPopupReadyCreative(sb, {
      campaignId: id,
      adminUserId: input.adminUserId,
      assetPath: path,
      assetUrl: publicUrl,
      altText: input.altText,
    });
    if (!creative.ok) {
      await sb.storage.from(BUCKET).remove([path]);
      return {
        ok: false,
        incomplete: true,
        id,
        error: creative.error,
        httpStatus: creative.httpStatus,
      };
    }

    const approved = await adminApprovePlatformPopupCampaign(sb, {
      campaignId: id,
      adminUserId: input.adminUserId,
      activate: input.publishMode === "live",
      schedule: input.publishMode === "scheduled",
    });
    if (!approved.ok) {
      await restoreDraft();
      return {
        ok: false,
        incomplete: true,
        id,
        error: approved.error,
        httpStatus: approved.httpStatus,
      };
    }

    return {
      ok: true,
      id,
      status: input.publishMode === "live" ? "active" : "scheduled",
    };
  } catch (cause) {
    await restoreDraft();
    return {
      ok: false,
      incomplete: true,
      id,
      error: cause instanceof Error ? cause.message : "complete_create_failed",
      httpStatus: 500,
    };
  }
}
