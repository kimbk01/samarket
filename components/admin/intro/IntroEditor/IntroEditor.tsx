"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ScenePropertiesPanel } from "@/components/admin/intro/IntroEditor/ScenePropertiesPanel";
import { SceneStoryboard } from "@/components/admin/intro/IntroEditor/SceneStoryboard";
import { SceneWorkspace } from "@/components/admin/intro/IntroEditor/SceneWorkspace";
import { patchSceneBackgroundColor } from "@/lib/startup/intro/domain/patch-scene-background";
import { createIdleIntroRendererClock } from "@/lib/startup/intro/renderer/clock";
import { introSceneBackgroundCssColor } from "@/lib/startup/intro/renderer/scene-background";
import type { IntroV3CampaignRow } from "@/lib/startup/intro-v3/admin-service";
import type { IntroV3Document } from "@/lib/startup/intro-v3/document";
import { isIntroV3HexColor } from "@/lib/startup/intro-v3/document";

export function IntroEditor({ campaignId }: { campaignId: string }) {
  const { safeT } = useI18n();
  const [campaign, setCampaign] = useState<IntroV3CampaignRow | null>(null);
  const [name, setName] = useState("");
  const [working, setWorking] = useState<IntroV3Document | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/intro-v3/campaigns/${encodeURIComponent(campaignId)}`, {
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; campaign?: IntroV3CampaignRow };
    if (!res.ok || !json.ok || !json.campaign) {
      setError(
        safeT("admin_intro_load_error", {
          fallbackKo: "인트로를 불러오지 못했습니다.",
          fallbackEn: "Could not load intro.",
        })
      );
      return;
    }
    setCampaign(json.campaign);
    setName(json.campaign.name);
    setWorking(json.campaign.document);
    setError(null);
  }, [campaignId, safeT]);

  useEffect(() => {
    void load();
  }, [load]);

  const scene = working?.scenes[0] ?? null;
  const color = introSceneBackgroundCssColor(scene?.background ?? null);

  const onColorChange = (next: string) => {
    if (!working || !scene || !isIntroV3HexColor(next)) return;
    const patched = patchSceneBackgroundColor(working, scene.id, next);
    if (patched) setWorking(patched);
  };

  const onSave = async () => {
    if (!working) return;
    setSaving(true);
    const res = await fetch(`/api/admin/intro-v3/campaigns/${encodeURIComponent(campaignId)}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document: working, name }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; campaign?: IntroV3CampaignRow };
    setSaving(false);
    if (!res.ok || !json.ok || !json.campaign) {
      setError(
        safeT("admin_intro_save_failed", {
          fallbackKo: "저장에 실패했습니다. 편집 내용은 그대로 있습니다.",
          fallbackEn: "Save failed. Your unsaved edits are still here.",
        })
      );
      return;
    }
    setCampaign(json.campaign);
    setName(json.campaign.name);
    setWorking(json.campaign.document);
    setError(null);
  };

  const clock = useMemo(() => createIdleIntroRendererClock(), []);
  const sceneLabel = useMemo(
    () => safeT("admin_intro_scene_one", { fallbackKo: "Scene 1", fallbackEn: "Scene 1" }),
    [safeT]
  );

  if (!campaign || !working || !scene) {
    return (
      <div className="sam-text-body text-sam-muted" data-intro-editor-loading="1">
        {error}
      </div>
    );
  }

  return (
    <div
      className="flex h-[calc(100dvh-8.5rem)] min-h-0 flex-col"
      data-intro-editor="foundation-b"
      data-intro-clock-phase={clock.phase}
    >
      <header
        className="flex shrink-0 flex-wrap items-center gap-2 border-b border-sam-border bg-sam-surface px-3 py-2"
        data-intro-topbar="1"
      >
        <Link href="/admin/intro" className="text-[13px] font-semibold text-sam-fg">
          ← {safeT("admin_intro_title", { fallbackKo: "인트로", fallbackEn: "Intro" })}
        </Link>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-h-9 min-w-[12rem] flex-1 rounded-ui-rect border border-sam-border bg-sam-app px-2 text-[14px] font-semibold text-sam-fg"
          data-intro-campaign-name="1"
        />
        <span
          className="rounded-full bg-sam-app px-2 py-0.5 text-[12px] font-semibold text-sam-muted"
          data-intro-status="draft"
        >
          {safeT("admin_intro_status_draft", { fallbackKo: "초안", fallbackEn: "Draft" })}
        </span>
        <AdminActionButton variant="primary" onClick={() => void onSave()} disabled={saving} data-intro-save="1">
          {safeT("admin_intro_save", { fallbackKo: "저장", fallbackEn: "Save" })}
        </AdminActionButton>
        <AdminActionButton variant="secondary" disabled data-intro-preview="disabled">
          {safeT("admin_intro_preview", { fallbackKo: "미리보기", fallbackEn: "Preview" })}
        </AdminActionButton>
        <AdminActionButton variant="secondary" disabled data-intro-publish="disabled">
          {safeT("admin_intro_publish", { fallbackKo: "게시", fallbackEn: "Publish" })}
        </AdminActionButton>
      </header>
      {error ? <p className="px-3 py-1 text-[13px] text-red-800">{error}</p> : null}
      <div className="flex min-h-0 flex-1">
        <SceneStoryboard sceneId={scene.id} sceneLabel={sceneLabel} />
        <SceneWorkspace background={scene.background} />
        <ScenePropertiesPanel color={color} onColorChange={onColorChange} />
      </div>
    </div>
  );
}
