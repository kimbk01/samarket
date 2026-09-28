"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { IntroV3MediaLibrary } from "@/components/admin/intro-v3/IntroV3MediaLibrary";
import { IntroV3SceneSurface } from "@/components/admin/intro-v3/IntroV3SceneSurface";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { IntroV3CampaignRow } from "@/lib/startup/intro-v3/admin-service";
import type { IntroV3LibrarySelection } from "@/lib/startup/intro-v3/media-types";

export function AdminIntroV3DraftPage({ campaignId }: { campaignId: string }) {
  const { safeT } = useI18n();
  const router = useRouter();
  const [campaign, setCampaign] = useState<IntroV3CampaignRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selection, setSelection] = useState<IntroV3LibrarySelection | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/intro-v3/campaigns/${encodeURIComponent(campaignId)}`, {
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      campaign?: IntroV3CampaignRow;
    };
    if (!res.ok || !json.ok || !json.campaign) {
      setError(
        safeT("admin_intro_load_error", {
          fallbackKo: "인트로 목록을 불러오지 못했습니다.",
          fallbackEn: "Could not load intros.",
        })
      );
      setCampaign(null);
      return;
    }
    setCampaign(json.campaign);
    setError(null);
  }, [campaignId, safeT]);

  useEffect(() => {
    void load();
  }, [load]);

  const scene = campaign?.document.scenes[0] ?? null;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        backHref="/admin/intro-v3"
        titleKey="admin_intro_v3_title"
        descriptionKey="admin_intro_v3_no_layer_note"
      />
      {error ? <p className="sam-text-body text-red-700">{error}</p> : null}
      {scene ? (
        <AdminCard title={campaign?.name}>
          <IntroV3SceneSurface background={scene.background} />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex min-h-9 items-center rounded-ui-rect bg-[var(--admin-action-primary-bg,#111827)] px-3 py-1.5 text-[13px] font-semibold text-white"
              onClick={() => setLibraryOpen(true)}
            >
              {safeT("admin_intro_v3_add_image", { fallbackKo: "+ 이미지", fallbackEn: "+ Image" })}
            </button>
            <span className="sam-text-helper text-sam-muted" data-intro-v3-layer-count={scene.layers.length}>
              layers: {scene.layers.length}
            </span>
          </div>
          <div className="mt-4 rounded-ui-rect border border-sam-border-soft p-3" data-intro-v3-selection>
            {selection ? (
              <div className="sam-text-body text-sam-fg">
                <p>
                  {safeT("admin_intro_v3_selected", { fallbackKo: "선택한 파일", fallbackEn: "Selected file" })}
                </p>
                <p className="mt-1 font-medium">{selection.source.filename}</p>
                <p className="sam-text-helper text-sam-muted">
                  {selection.derivative.width}x{selection.derivative.height} ·{" "}
                  {selection.source.mime.replace("image/", "").toUpperCase()} · {selection.derivative.bytes ?? 0}B
                </p>
                <p className="sam-text-helper text-sam-muted">
                  source {selection.mediaRef.sourceId} · derivative {selection.mediaRef.derivativeId}
                </p>
              </div>
            ) : (
              <p className="sam-text-helper text-sam-muted">
                {safeT("admin_intro_v3_no_selection", {
                  fallbackKo: "아직 선택한 파일이 없습니다.",
                  fallbackEn: "No file selected yet.",
                })}
              </p>
            )}
          </div>
        </AdminCard>
      ) : null}
      <IntroV3MediaLibrary
        open={libraryOpen}
        intent="ADD_IMAGE"
        onClose={() => setLibraryOpen(false)}
        onSelect={(next) => {
          setSelection(next);
          void router.refresh();
        }}
      />
    </div>
  );
}
