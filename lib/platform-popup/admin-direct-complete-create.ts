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
import { checkPopupCreativeSourceSize } from "@/lib/platform-popup/creative-size-spec";

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

  /**
   * 광고 감사 PP-01 (2026-11-26): 상세 화면 업로드(`creative/route.ts`)와 같은 원본 크기 검사를 캠페인을 만들기 **전에** 한다.
   * 예전 「바로 노출」 경로는 검사 없이 300×200 도 1440×1000 으로 늘려 흐린 팝업을 바로 노출했고, 화소 상한도 없었다.
   * 실패하면 초안 행을 남기지 않는다(incomplete:false). 기준 = `creative-size-spec.ts` (카드형 · 마스터 SSOT §3).
   */
  const source = Buffer.from(await input.file.arrayBuffer());
  let width = 0;
  let height = 0;
  try {
    const metadata = await sharp(source, { failOn: "none", limitInputPixels: false }).rotate().metadata();
    width = metadata.width ?? 0;
    height = metadata.height ?? 0;
  } catch {
    return { ok: false, incomplete: false, error: "invalid_dimensions", httpStatus: 400 };
  }
  if (width <= 0 || height <= 0) {
    return { ok: false, incomplete: false, error: "invalid_dimensions", httpStatus: 400 };
  }
  const size = checkPopupCreativeSourceSize({ creativeMode: "card", width, height });
  if (!size.ok) {
    return { ok: false, incomplete: false, error: size.error, httpStatus: 400 };
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
