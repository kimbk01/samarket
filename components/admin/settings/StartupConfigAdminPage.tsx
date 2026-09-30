"use client";

/**
 * Admin cold-start tab — initialSurface only.
 * Authored Product Intro is removed. Boot branding is OS/native, not this page.
 */

import { useCallback, useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StartupPresentationRuntime } from "@/components/startup-presentation/StartupPresentationRuntime";
import {
  BUNDLED_STARTUP_CONFIG,
  normalizeStartupConfig,
  type StartupConfig,
} from "@/lib/startup/startup-config";
import {
  type GenerationManifestR15,
  type StartupPresentationAssetManifestItemR15,
  type StartupPresentationDocumentR15,
  createBootstrapStartupPresentationDocument,
  normalizeStartupPresentationDocument,
} from "@/lib/startup-presentation/document";
import { projectStartupPresentationPaintR15 } from "@/lib/startup-presentation/engine";

function buildPreviewManifest(
  document: StartupPresentationDocumentR15,
  asset: StartupPresentationAssetManifestItemR15 | null
): GenerationManifestR15 {
  return {
    schemaVersion: 1,
    generationId: "admin-preview",
    documentHash: "preview",
    document,
    assetManifest: asset ? [asset] : [],
    createdAt: new Date(0).toISOString(),
    publishedAt: new Date(0).toISOString(),
    integrity: { algorithm: "sha256", manifestHash: "preview" },
  };
}

export function StartupConfigAdminPage() {
  const { safeT, t } = useI18n();
  const [draft, setDraft] = useState<StartupConfig>(() => ({
    ...BUNDLED_STARTUP_CONFIG,
  }));
  const [loading, setLoading] = useState(true);
  const [savingTab, setSavingTab] = useState(false);
  const [tabMessage, setTabMessage] = useState<string | null>(null);
  const [presentationDraft, setPresentationDraft] = useState<StartupPresentationDocumentR15>(() =>
    createBootstrapStartupPresentationDocument()
  );
  const [currentGeneration, setCurrentGeneration] = useState<GenerationManifestR15 | null>(null);
  const [draftAsset, setDraftAsset] = useState<StartupPresentationAssetManifestItemR15 | null>(null);
  const [presentationBusy, setPresentationBusy] = useState<"save" | "apply" | "upload" | null>(null);
  const [presentationMessage, setPresentationMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [tabRes, presentationRes] = await Promise.all([
          fetch("/api/admin/startup-config", { credentials: "same-origin" }),
          fetch("/api/admin/startup-presentation", { credentials: "same-origin" }),
        ]);
        const tabJson = (await tabRes.json()) as { ok?: boolean; config?: unknown };
        const presentationJson = (await presentationRes.json()) as {
          ok?: boolean;
          draft?: unknown;
          currentGeneration?: GenerationManifestR15 | null;
        };
        if (!cancelled && tabJson?.ok) {
          setDraft(normalizeStartupConfig(tabJson.config));
        }
        if (!cancelled && presentationJson?.ok) {
          const nextDraft = normalizeStartupPresentationDocument(presentationJson.draft);
          setPresentationDraft(nextDraft);
          setCurrentGeneration(presentationJson.currentGeneration ?? null);
          const assetId = nextDraft.systemStart.logo.assetId;
          const currentAsset =
            assetId && presentationJson.currentGeneration
              ? presentationJson.currentGeneration.assetManifest.find((asset) => asset.assetId === assetId) ?? null
              : null;
          setDraftAsset(currentAsset);
        }
      } catch {
        /* keep bundled */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveInitialTab = useCallback(async () => {
    setSavingTab(true);
    setTabMessage(null);
    try {
      const res = await fetch("/api/admin/startup-config", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: draft }),
      });
      const json = (await res.json()) as { ok?: boolean; config?: unknown; error?: string };
      if (!res.ok || !json.ok) {
        setTabMessage(json.error ?? "save_failed");
        return;
      }
      setDraft(normalizeStartupConfig(json.config));
      setTabMessage(
        safeT("admin_startup_config_save_ok", {
          fallbackKo: "저장되었습니다.",
          fallbackEn: "Saved.",
        })
      );
    } catch {
      setTabMessage("save_failed");
    } finally {
      setSavingTab(false);
    }
  }, [draft, safeT]);

  const savePresentationDraft = useCallback(async () => {
    if (
      !window.confirm(
        safeT("admin_r15_startup_save_confirm", {
          fallbackKo: "현재 System Start 설정을 저장하시겠습니까?",
          fallbackEn: "Save the current System Start settings?",
        })
      )
    ) {
      return;
    }
    setPresentationBusy("save");
    setPresentationMessage(null);
    try {
      const res = await fetch("/api/admin/startup-presentation", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: presentationDraft }),
      });
      const json = (await res.json()) as { ok?: boolean; draft?: unknown; error?: string };
      if (!res.ok || !json.ok) {
        setPresentationMessage(
          json.error ??
            safeT("admin_r15_startup_save_failed", {
              fallbackKo: "저장에 실패했습니다.",
              fallbackEn: "Save failed.",
            })
        );
        return;
      }
      setPresentationDraft(normalizeStartupPresentationDocument(json.draft));
      setPresentationMessage(
        safeT("admin_r15_startup_save_ok", {
          fallbackKo: "Draft가 저장되었습니다.",
          fallbackEn: "Draft saved.",
        })
      );
    } catch {
      setPresentationMessage(
        safeT("admin_r15_startup_save_failed", {
          fallbackKo: "저장에 실패했습니다.",
          fallbackEn: "Save failed.",
        })
      );
    } finally {
      setPresentationBusy(null);
    }
  }, [presentationDraft, safeT]);

  const serviceApplyPresentation = useCallback(async () => {
    if (
      !window.confirm(
        safeT("admin_r15_startup_apply_confirm", {
          fallbackKo:
            "현재 System Start 구성을 실제 서비스에 적용하시겠습니까?\n\n적용된 구성은 검증된 generation으로 배포되며 대상 앱의 다음 eligible startup에 반영됩니다.",
          fallbackEn:
            "Apply the current System Start configuration to live service?\n\nThe applied configuration will be distributed as a verified generation and reflected on the next eligible startup.",
        })
      )
    ) {
      return;
    }
    setPresentationBusy("apply");
    setPresentationMessage(null);
    try {
      const res = await fetch("/api/admin/startup-presentation", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "service_apply", document: presentationDraft }),
      });
      const json = (await res.json()) as { ok?: boolean; manifest?: GenerationManifestR15; error?: string };
      if (!res.ok || !json.ok || !json.manifest) {
        setPresentationMessage(
          json.error ??
            safeT("admin_r15_startup_apply_failed", {
              fallbackKo: "서비스 적용에 실패했습니다.",
              fallbackEn: "Service apply failed.",
            })
        );
        return;
      }
      setCurrentGeneration(json.manifest);
      setPresentationMessage(
        `${safeT("admin_r15_startup_apply_ok", {
          fallbackKo: "Service Apply 완료",
          fallbackEn: "Service Apply complete",
        })}: ${json.manifest.generationId}`
      );
    } catch {
      setPresentationMessage(
        safeT("admin_r15_startup_apply_failed", {
          fallbackKo: "서비스 적용에 실패했습니다.",
          fallbackEn: "Service apply failed.",
        })
      );
    } finally {
      setPresentationBusy(null);
    }
  }, [presentationDraft, safeT]);

  const uploadLogo = useCallback(async (file: File | null) => {
    if (!file) return;
    setPresentationBusy("upload");
    setPresentationMessage(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/admin/startup-presentation/upload-image", {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      const json = (await res.json()) as {
        ok?: boolean;
        asset?: StartupPresentationAssetManifestItemR15;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.asset) {
        setPresentationMessage(
          json.error ??
            safeT("admin_r15_startup_upload_failed", {
              fallbackKo: "이미지 업로드에 실패했습니다.",
              fallbackEn: "Image upload failed.",
            })
        );
        return;
      }
      setDraftAsset(json.asset);
      setPresentationDraft((prev) =>
        normalizeStartupPresentationDocument({
          ...prev,
          systemStart: {
            ...prev.systemStart,
            logo: { ...prev.systemStart.logo, assetId: json.asset?.assetId ?? null },
          },
        })
      );
      setPresentationMessage(
        safeT("admin_r15_startup_upload_ok", {
          fallbackKo: "로고 이미지가 업로드되었습니다.",
          fallbackEn: "Logo image uploaded.",
        })
      );
    } catch {
      setPresentationMessage(
        safeT("admin_r15_startup_upload_failed", {
          fallbackKo: "이미지 업로드에 실패했습니다.",
          fallbackEn: "Image upload failed.",
        })
      );
    } finally {
      setPresentationBusy(null);
    }
  }, [safeT]);

  const previewPaint = projectStartupPresentationPaintR15(
    buildPreviewManifest(presentationDraft, draftAsset)
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={safeT("admin_startup_config_title", {
          fallbackKo: "앱 시작 탭",
          fallbackEn: "App launch tab",
        })}
        description={safeT("admin_startup_config_desc", {
          fallbackKo: "앱을 열었을 때 기본으로 들어갈 하단 탭을 설정합니다.",
          fallbackEn: "Choose the default bottom tab when the app opens.",
        })}
      />

      <AdminCard>
        <h2 className="mb-1 sam-text-title font-semibold text-sam-fg">
          {safeT("admin_startup_config_section_surface", {
            fallbackKo: "앱 시작 탭",
            fallbackEn: "Launch tab",
          })}
        </h2>
        <p className="mb-4 sam-text-body text-sam-muted">
          {safeT("admin_startup_config_initial_surface_hint", {
            fallbackKo: "앱을 열었을 때 기본으로 열릴 하단 탭입니다.",
            fallbackEn: "Default bottom tab when the app opens.",
          })}
        </p>
        {loading ? (
          <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block sam-text-body font-medium text-sam-fg">
                {safeT("admin_startup_config_initial_surface", {
                  fallbackKo: "시작 탭",
                  fallbackEn: "Launch tab",
                })}
              </label>
              <select
                className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
                value={draft.initialSurface}
                onChange={(e) =>
                  setDraft((prev) =>
                    normalizeStartupConfig({
                      ...prev,
                      initialSurface: e.target.value as StartupConfig["initialSurface"],
                    })
                  )
                }
              >
                <option value="community">
                  {safeT("admin_startup_config_surface_community", {
                    fallbackKo: "커뮤니티",
                    fallbackEn: "Community",
                  })}
                </option>
                <option value="trade">
                  {safeT("admin_startup_config_surface_trade", {
                    fallbackKo: "거래",
                    fallbackEn: "Trade",
                  })}
                </option>
                <option value="food">
                  {safeT("admin_startup_config_surface_food", {
                    fallbackKo: "배달/푸드",
                    fallbackEn: "Food / Delivery",
                  })}
                </option>
                <option value="chat">
                  {safeT("admin_startup_config_surface_chat", {
                    fallbackKo: "채팅",
                    fallbackEn: "Chat",
                  })}
                </option>
                <option value="my">
                  {safeT("admin_startup_config_surface_my", {
                    fallbackKo: "내 정보",
                    fallbackEn: "My",
                  })}
                </option>
              </select>
            </div>
            <button
              type="button"
              className="sam-btn sam-btn-secondary"
              disabled={savingTab}
              onClick={() => void saveInitialTab()}
            >
              {savingTab
                ? safeT("common_loading", { fallbackKo: "저장 중…", fallbackEn: "Saving…" })
                : safeT("admin_first_entry_save_tab", {
                    fallbackKo: "시작 탭 저장",
                    fallbackEn: "Save launch tab",
                  })}
            </button>
            {tabMessage ? (
              <span className="sam-text-caption text-sam-muted">{tabMessage}</span>
            ) : null}
          </div>
        )}
      </AdminCard>

      <AdminCard>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="mb-1 sam-text-title font-semibold text-sam-fg">
              {safeT("admin_r15_startup_system_start", {
                fallbackKo: "System Start",
                fallbackEn: "System Start",
              })}
            </h2>
            <p className="sam-text-body text-sam-muted">
              {safeT("admin_r15_startup_system_start_hint", {
                fallbackKo: "Phase 1은 배경색, 로고 이미지, 위치/크기, 최소 표시 시간만 지원합니다.",
                fallbackEn:
                  "Phase 1 supports only background color, logo image, geometry, and minimum visible time.",
              })}
            </p>
          </div>
          <div className="sam-text-caption text-sam-muted">
            {safeT("admin_r15_startup_current_generation", {
              fallbackKo: "현재 generation",
              fallbackEn: "Current generation",
            })}
            : {currentGeneration?.generationId ?? "none"}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block sam-text-body font-medium text-sam-fg">
                {safeT("admin_r15_startup_background_color", {
                  fallbackKo: "배경색",
                  fallbackEn: "Background Color",
                })}
              </span>
              <input
                type="color"
                className="h-10 w-24 rounded-ui-rect border border-sam-border bg-sam-surface p-1"
                value={presentationDraft.systemStart.backgroundColor}
                onChange={(e) =>
                  setPresentationDraft((prev) =>
                    normalizeStartupPresentationDocument({
                      ...prev,
                      systemStart: { ...prev.systemStart, backgroundColor: e.target.value },
                    })
                  )
                }
              />
            </label>

            <label className="block">
              <span className="mb-1 block sam-text-body font-medium text-sam-fg">
                {safeT("admin_r15_startup_logo_image", {
                  fallbackKo: "로고/이미지",
                  fallbackEn: "Logo/Image",
                })}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
                disabled={presentationBusy === "upload"}
                onChange={(e) => void uploadLogo(e.currentTarget.files?.[0] ?? null)}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              {(["x", "y", "width", "height"] as const).map((field) => (
                <label key={field} className="block">
                  <span className="mb-1 block sam-text-body font-medium text-sam-fg">
                    {safeT("admin_r15_startup_logo_geometry", {
                      fallbackKo: "로고 좌표",
                      fallbackEn: "Logo geometry",
                    })}{" "}
                    {field.toUpperCase()}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
                    value={presentationDraft.systemStart.logo[field]}
                    onChange={(e) =>
                      setPresentationDraft((prev) =>
                        normalizeStartupPresentationDocument({
                          ...prev,
                          systemStart: {
                            ...prev.systemStart,
                            logo: {
                              ...prev.systemStart.logo,
                              [field]: Number(e.target.value),
                            },
                          },
                        })
                      )
                    }
                  />
                </label>
              ))}
            </div>

            <label className="block">
              <span className="mb-1 block sam-text-body font-medium text-sam-fg">
                {safeT("admin_r15_startup_minimum_visible", {
                  fallbackKo: "최소 표시 시간(ms)",
                  fallbackEn: "Minimum Visible Time (ms)",
                })}
              </span>
              <input
                type="number"
                min={250}
                max={5000}
                step={50}
                className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
                value={presentationDraft.systemStart.minimumVisibleMs}
                onChange={(e) =>
                  setPresentationDraft((prev) =>
                    normalizeStartupPresentationDocument({
                      ...prev,
                      systemStart: {
                        ...prev.systemStart,
                        minimumVisibleMs: Number(e.target.value),
                      },
                    })
                  )
                }
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="sam-btn sam-btn-secondary"
                disabled={presentationBusy != null}
                onClick={() => void savePresentationDraft()}
              >
                {safeT("admin_r15_startup_save", {
                  fallbackKo: "SAVE",
                  fallbackEn: "SAVE",
                })}
              </button>
              <button
                type="button"
                className="sam-btn sam-btn-primary"
                disabled={presentationBusy != null}
                onClick={() => void serviceApplyPresentation()}
              >
                {safeT("admin_r15_startup_service_apply", {
                  fallbackKo: "SERVICE APPLY",
                  fallbackEn: "SERVICE APPLY",
                })}
              </button>
              {presentationMessage ? (
                <span className="sam-text-caption text-sam-muted">{presentationMessage}</span>
              ) : null}
            </div>
          </div>

          <div>
            <div className="mb-2 sam-text-body font-medium text-sam-fg">
              {safeT("admin_r15_startup_preview_same_renderer", {
                fallbackKo: "PREVIEW = APP RENDERER",
                fallbackEn: "PREVIEW = APP RENDERER",
              })}
            </div>
            <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
              <div className="h-[520px] max-h-[70vh]">
                <StartupPresentationRuntime paint={previewPaint} />
              </div>
            </div>
            <div className="mt-2 sam-text-caption text-sam-muted">
              {safeT("admin_r15_startup_preview_contract", {
                fallbackKo: "Fit: CONTAIN / normalized geometry 0..1",
                fallbackEn: "Fit: CONTAIN / normalized geometry 0..1",
              })}
            </div>
          </div>
        </div>
      </AdminCard>
    </div>
  );
}
