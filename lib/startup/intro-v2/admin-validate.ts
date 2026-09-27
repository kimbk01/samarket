/**
 * Publish/draft validation with scene/layer paths.
 * Never returns a bare "Invalid configuration".
 */

import { validateIntroCampaignWrite, validateIntroPublishPayload } from "@/lib/startup/intro-v2/admin-write-contract";
import { introMediaPublishBlockReason } from "@/lib/startup/intro-v2/admin-media";
import {
  isV1ImportedDraft,
  scenesHaveExplicitAdvance,
  v1DisplayDurationMs,
  type IntroAdminCampaign,
} from "@/lib/startup/intro-v2/admin-editor-model";
import { validateIntroAdvance, validateIntroSceneContract } from "@/lib/startup/intro-v2/scenes";
import { validateIntroCta, isAllowedIntroExternalHost } from "@/lib/startup/intro-v2/cta";
import { validateIntroLayers } from "@/lib/startup/intro-v2/layers";
import { validateIntroTargeting } from "@/lib/startup/intro-v2/targeting";
import type { IntroAdvanceMode, IntroLayer } from "@/lib/startup/intro-v2/types";

export type IntroAdminIssue = {
  code: string;
  path: string;
  messageKo: string;
  messageEn: string;
};

export type IntroAdminValidation = {
  ok: boolean;
  issues: IntroAdminIssue[];
};

function issue(code: string, path: string, messageKo: string, messageEn: string): IntroAdminIssue {
  return { code, path, messageKo, messageEn };
}

function scenePath(index: number, field?: string): string {
  return field ? `scenes[${index}].${field}` : `scenes[${index}]`;
}

export function validateIntroExternalUrlAdmin(url: string): IntroAdminIssue | null {
  const trimmed = url.trim();
  if (!trimmed) {
    return issue("external_url_required", "cta.destination.url", "외부 주소를 입력하세요.", "Enter an external URL.");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return issue("invalid_url", "cta.destination.url", "올바른 주소가 아닙니다.", "That URL is not valid.");
  }
  if (parsed.protocol !== "https:") {
    return issue("https_required", "cta.destination.url", "https 주소만 사용할 수 있습니다.", "Only https URLs are allowed.");
  }
  if (!isAllowedIntroExternalHost(parsed.hostname)) {
    return issue(
      "external_host_not_allowed",
      "cta.destination.url",
      "허용된 도메인만 사용할 수 있습니다 (samarket.vercel.app, dibay.app, www.dibay.app).",
      "Only allowlisted hosts are permitted (samarket.vercel.app, dibay.app, www.dibay.app)."
    );
  }
  return null;
}

export function validateIntroCampaignDraft(campaign: IntroAdminCampaign): IntroAdminValidation {
  const issues: IntroAdminIssue[] = [];
  const write = validateIntroCampaignWrite({
    name: campaign.name,
    status: campaign.status,
    targeting: campaign.targeting,
    frequencyMode: campaign.frequencyMode,
    deepLinkPolicy: campaign.deepLinkPolicy,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
  });
  if (!write.ok) {
    issues.push(mapWriteError(write.error, "campaign"));
  }
  const targeting = validateIntroTargeting(campaign.targeting);
  if (!targeting.ok) {
    issues.push(issue(targeting.error, "targeting", "대상 설정이 올바르지 않습니다.", "Targeting is invalid."));
  }

  campaign.scenes.forEach((scene, index) => {
    if (scene.advanceMode === "timer" && (scene.durationMs == null || scene.durationMs < 1)) {
      issues.push(
        issue(
          "timer_duration_required",
          scenePath(index, "durationMs"),
          `${scene.name || `장면 ${index + 1}`}: 지정 시간은 1ms 이상이어야 합니다. 0은 사용할 수 없습니다.`,
          `${scene.name || `Scene ${index + 1}`}: Timer duration must be at least 1ms. 0 is not allowed.`
        )
      );
    }
    const layers = validateIntroLayers(scene.layers);
    if (!layers.ok) {
      issues.push(
        issue(
          layers.error,
          scenePath(index, "layers"),
          `${scene.name || `장면 ${index + 1}`}: 레이어 구성에 문제가 있습니다 (${layers.error}).`,
          `${scene.name || `Scene ${index + 1}`}: Layer configuration failed (${layers.error}).`
        )
      );
    }
    if (scene.interactionMode === "tap_layer") {
      if (!scene.interactionLayerId) {
        issues.push(
          issue(
            "interaction_layer_required",
            scenePath(index, "interactionLayerId"),
            `${scene.name || `장면 ${index + 1}`}: 레이어 상호작용은 대상 레이어가 필요합니다.`,
            `${scene.name || `Scene ${index + 1}`}: Layer interaction needs a target layer.`
          )
        );
      } else if (!scene.layers.some((l) => l.id === scene.interactionLayerId)) {
        issues.push(
          issue(
            "interaction_layer_missing",
            scenePath(index, "interactionLayerId"),
            `${scene.name || `장면 ${index + 1}`}: 선택한 레이어가 없습니다. 삭제된 레이어를 가리킬 수 없습니다.`,
            `${scene.name || `Scene ${index + 1}`}: The selected layer is missing. Deleted layers cannot be referenced.`
          )
        );
      }
    }
    const cta = validateIntroCta(scene.cta);
    if (!cta.ok) {
      issues.push(
        issue(
          cta.error,
          scenePath(index, "cta"),
          `${scene.name || `장면 ${index + 1}`}: 이동 대상이 올바르지 않습니다 (${cta.error}).`,
          `${scene.name || `Scene ${index + 1}`}: CTA destination is invalid (${cta.error}).`
        )
      );
    }
    if (scene.cta?.enabled && scene.cta.destination.type === "EXTERNAL_URL") {
      const urlIssue = validateIntroExternalUrlAdmin(String(scene.cta.destination.url ?? ""));
      if (urlIssue) issues.push({ ...urlIssue, path: scenePath(index, "cta.destination.url") });
    }
  });

  const orders = campaign.scenes.map((s) => s.sortOrder);
  if (new Set(orders).size !== orders.length) {
    issues.push(issue("scene_order_duplicate", "scenes.sortOrder", "장면 순서가 중복되었습니다.", "Scene order has duplicates."));
  }

  return { ok: issues.length === 0, issues };
}

export function validateIntroCampaignForPublish(campaign: IntroAdminCampaign): IntroAdminValidation {
  const draft = validateIntroCampaignDraft(campaign);
  const issues = [...draft.issues];

  if (
    (campaign.requiresAdminConfirmation || isV1ImportedDraft(campaign)) &&
    !scenesHaveExplicitAdvance(campaign.scenes)
  ) {
    const duration = v1DisplayDurationMs(campaign.source);
    issues.push(
      issue(
        "requires_admin_confirmation",
        "requiresAdminConfirmation",
        duration === 0
          ? "V1에서 가져온 초안입니다. displayDurationMs=0이라 진행 방식이 확정되지 않았습니다. 장면 진행 방법을 직접 선택한 뒤에만 게시할 수 있습니다. 자동으로 타이머로 바꾸지 않습니다."
          : "관리자 확인이 필요한 초안입니다. 장면 진행 방법을 확정한 뒤에만 게시할 수 있습니다.",
        duration === 0
          ? "This V1-imported draft has displayDurationMs=0, so advance semantics are unconfirmed. Set scene advance explicitly before publish. It will not be auto-converted to TIMER."
          : "This draft requires admin confirmation. Confirm scene advance before publish."
      )
    );
  }

  if (campaign.scenes.length < 1) {
    issues.push(issue("scenes_required", "scenes", "게시에 장면이 1개 이상 필요합니다.", "Publish requires at least one scene."));
  }

  campaign.scenes.forEach((scene, index) => {
    const sceneOk = validateIntroSceneContract(
      {
        advanceMode: scene.advanceMode,
        durationMs: scene.durationMs,
        maxHoldMs: scene.maxHoldMs,
        transition: scene.transition,
        skipPolicy: scene.skipPolicy,
        interactionMode: scene.interactionMode,
        interactionLayerId: scene.interactionLayerId,
        layers: scene.layers,
        cta: scene.cta,
        backgroundColor: scene.backgroundColor,
        backgroundAssetId: scene.backgroundAssetId,
      },
      { allowIncompleteAdvance: false }
    );
    if (!sceneOk.ok) {
      if (!issues.some((i) => i.code === sceneOk.error && i.path.startsWith(`scenes[${index}]`))) {
        issues.push(
          issue(
            sceneOk.error,
            scenePath(index),
            `${scene.name || `장면 ${index + 1}`}: ${sceneOk.error}`,
            `${scene.name || `Scene ${index + 1}`}: ${sceneOk.error}`
          )
        );
      }
    }
    if (scene.advanceMode !== "timer" && (scene.maxHoldMs == null || scene.maxHoldMs < 1)) {
      issues.push(
        issue(
          "max_hold_ms_required",
          scenePath(index, "maxHoldMs"),
          `${scene.name || `장면 ${index + 1}`}: 최대 유지 시간을 1ms 이상으로 설정하세요.`,
          `${scene.name || `Scene ${index + 1}`}: Set a max hold time of at least 1ms.`
        )
      );
    }
  });

  const assetIds = new Set(campaign.assets.map((a) => a.id));
  campaign.scenes.forEach((scene, index) => {
    if (scene.backgroundAssetId && !assetIds.has(scene.backgroundAssetId)) {
      issues.push(
        issue(
          "broken_background_asset",
          scenePath(index, "backgroundAssetId"),
          `${scene.name || `장면 ${index + 1}`}: 배경 미디어를 찾을 수 없습니다.`,
          `${scene.name || `Scene ${index + 1}`}: Background media is missing.`
        )
      );
    }
    scene.layers.forEach((layer, li) => {
      if (layer.assetId && !assetIds.has(layer.assetId)) {
        issues.push(
          issue(
            "broken_layer_asset",
            `${scenePath(index, "layers")}[${li}].assetId`,
            `${scene.name || `장면 ${index + 1}`}/${layer.id}: 연결된 미디어를 찾을 수 없습니다.`,
            `${scene.name || `Scene ${index + 1}`}/${layer.id}: Linked media is missing.`
          )
        );
      }
    });
  });

  for (const asset of campaign.assets) {
    const block = introMediaPublishBlockReason(asset);
    if (block) {
      issues.push(
        issue(
          block,
          `assets.${asset.id}`,
          block === "media_pipeline_not_ready"
            ? "GIF/MP4는 아직 게시할 수 없습니다. PNG, JPG, WebP만 게시 가능합니다."
            : "미디어가 게시 가능한 상태가 아닙니다.",
          block === "media_pipeline_not_ready"
            ? "GIF/MP4 cannot be published yet. Only PNG, JPG, and WebP are ready."
            : "Media is not ready to publish."
        )
      );
    }
  }

  const payload = validateIntroPublishPayload({
    name: campaign.name,
    status: campaign.status === "draft" ? "active" : campaign.status,
    targeting: campaign.targeting,
    frequencyMode: campaign.frequencyMode,
    deepLinkPolicy: campaign.deepLinkPolicy,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    requiresAdminConfirmation:
      campaign.requiresAdminConfirmation && !scenesHaveExplicitAdvance(campaign.scenes),
    scenes: campaign.scenes.map((scene) => ({
      advanceMode: scene.advanceMode,
      durationMs: scene.durationMs,
      maxHoldMs: scene.maxHoldMs,
      transition: scene.transition,
      skipPolicy: scene.skipPolicy,
      interactionMode: scene.interactionMode,
      interactionLayerId: scene.interactionLayerId,
      layers: scene.layers,
      cta: scene.cta,
      backgroundColor: scene.backgroundColor,
      backgroundAssetId: scene.backgroundAssetId,
    })),
    assets: campaign.assets.map((a) => ({
      kind: a.kind,
      storagePath: a.storagePath,
      publicUrl: a.publicUrl,
      mime: a.mime,
      bytes: a.bytes,
      sha256: a.sha256,
      width: a.width,
      height: a.height,
      durationMs: a.durationMs,
      loop: a.loop,
      decodeStatus: a.decodeStatus,
    })),
  });
  if (!payload.ok && !issues.some((i) => i.code === payload.error)) {
    issues.push(mapWriteError(payload.error, "publish"));
  }

  return { ok: issues.length === 0, issues };
}

function mapWriteError(code: string, path: string): IntroAdminIssue {
  const messages: Record<string, { ko: string; en: string }> = {
    campaign_name_required: { ko: "캠페인 이름을 입력하세요.", en: "Enter a campaign name." },
    campaign_status_invalid: { ko: "상태가 올바르지 않습니다.", en: "Status is invalid." },
    schedule_invalid: { ko: "종료 시각이 시작 시각보다 빠를 수 없습니다.", en: "End time cannot be before start time." },
    starts_at_invalid: { ko: "시작 시각이 올바르지 않습니다.", en: "Start time is invalid." },
    ends_at_invalid: { ko: "종료 시각이 올바르지 않습니다.", en: "End time is invalid." },
    frequency_mode_invalid: { ko: "빈도 설정이 올바르지 않습니다.", en: "Frequency setting is invalid." },
    deep_link_policy_invalid: { ko: "딥링크 정책이 올바르지 않습니다.", en: "Deep-link policy is invalid." },
    requires_admin_confirmation: {
      ko: "관리자 확인이 끝나지 않은 초안은 게시할 수 없습니다.",
      en: "A draft that still requires confirmation cannot be published.",
    },
    scenes_required: { ko: "장면이 1개 이상 필요합니다.", en: "At least one scene is required." },
  };
  const msg = messages[code] ?? { ko: `확인이 필요합니다: ${code}`, en: `Needs attention: ${code}` };
  return issue(code, path, msg.ko, msg.en);
}

export function assertNoDeletedLayerReference(layers: readonly IntroLayer[], layerId: string | null): boolean {
  if (!layerId) return true;
  return layers.some((l) => l.id === layerId);
}

export function validateIntroAdvanceAdmin(
  advanceMode: IntroAdvanceMode,
  durationMs: number | null,
  maxHoldMs: number | null
) {
  return validateIntroAdvance({ advanceMode, durationMs, maxHoldMs });
}
