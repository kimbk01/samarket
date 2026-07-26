"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { StartupIntroPreview } from "@/components/admin/settings/StartupIntroPreview";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  BUNDLED_STARTUP_CONFIG,
  normalizeStartupConfig,
  type StartupConfig,
} from "@/lib/startup/startup-config";
import {
  STARTUP_AMBIENT_ANIMATIONS,
  STARTUP_BG_IMAGE_FITS,
  STARTUP_BG_TYPES,
  STARTUP_ENTER_ANIMATIONS,
  STARTUP_EXIT_ANIMATIONS,
  STARTUP_LOGO_VERTICAL,
  STARTUP_LOGO_WIDTH_PRESETS,
  STARTUP_SPINNER_STYLES,
} from "@/lib/startup/startup-intro-visual";

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1 block sam-text-body font-medium text-sam-fg">{children}</label>;
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg ${props.className ?? ""}`}
    />
  );
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function StartupConfigAdminPage() {
  const { t, safeT } = useI18n();
  const [draft, setDraft] = useState<StartupConfig>(() => ({
    ...BUNDLED_STARTUP_CONFIG,
  }));
  const [baseline, setBaseline] = useState<StartupConfig>(() => ({
    ...BUNDLED_STARTUP_CONFIG,
  }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "background" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [replayKey, setReplayKey] = useState(0);
  const [playingExit, setPlayingExit] = useState(false);
  const [showAdvancedUrl, setShowAdvancedUrl] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/startup-config", { credentials: "same-origin" });
        const json = (await res.json()) as { ok?: boolean; config?: unknown };
        if (!cancelled && json.ok) {
          const cfg = normalizeStartupConfig(json.config);
          setDraft(cfg);
          setBaseline(cfg);
        }
      } catch {
        /* keep defaults */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(baseline), [draft, baseline]);

  const patch = useCallback(<K extends keyof StartupConfig>(key: K, value: StartupConfig[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  }, []);

  const patchLogo = useCallback((partial: Partial<StartupConfig["logo"]>) => {
    setDraft((prev) => {
      const logo = { ...prev.logo, ...partial };
      const logoUrl =
        logo.source === "uploaded" && logo.url ? logo.url : BUNDLED_STARTUP_CONFIG.logoUrl;
      return { ...prev, logo, logoUrl };
    });
    setMessage(null);
  }, []);

  const patchBg = useCallback((partial: Partial<StartupConfig["background"]>) => {
    setDraft((prev) => {
      const background = { ...prev.background, ...partial };
      return {
        ...prev,
        background,
        backgroundColor: background.color || prev.backgroundColor,
      };
    });
    setMessage(null);
  }, []);

  const patchAnim = useCallback((partial: Partial<StartupConfig["introAnimation"]>) => {
    setDraft((prev) => ({
      ...prev,
      introAnimation: { ...prev.introAnimation, ...partial },
    }));
    setMessage(null);
  }, []);

  const uploadAsset = useCallback(
    async (kind: "logo" | "background", file: File) => {
      setUploading(kind);
      setMessage(null);
      try {
        const fd = new FormData();
        fd.set("kind", kind);
        fd.set("file", file);
        const res = await fetch("/api/admin/startup-config/upload-image", {
          method: "POST",
          credentials: "same-origin",
          body: fd,
        });
        const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
        if (!res.ok || !json.ok || !json.url) {
          setMessage(
            safeT("admin_startup_config_upload_failed", {
              fallbackKo: "업로드에 실패했습니다. 기존 이미지는 유지됩니다.",
              fallbackEn: "Upload failed. The previous image was kept.",
            })
          );
          return;
        }
        if (kind === "logo") {
          patchLogo({ source: "uploaded", url: json.url });
        } else {
          patchBg({ type: "image", imageUrl: json.url });
        }
        setMessage(
          safeT("admin_startup_config_upload_ok", {
            fallbackKo: "이미지를 올렸습니다. 저장을 눌러 설정을 확정하세요.",
            fallbackEn: "Image uploaded. Press Save to confirm the config.",
          })
        );
      } catch {
        setMessage(
          safeT("admin_startup_config_upload_failed", {
            fallbackKo: "업로드에 실패했습니다. 기존 이미지는 유지됩니다.",
            fallbackEn: "Upload failed. The previous image was kept.",
          })
        );
      } finally {
        setUploading(null);
      }
    },
    [patchBg, patchLogo, safeT]
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/startup-config", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: draft }),
      });
      const json = (await res.json()) as { ok?: boolean; config?: unknown; error?: string };
      if (!res.ok || !json.ok) {
        setMessage(
          safeT("admin_startup_config_save_failed", {
            fallbackKo: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
            fallbackEn: "Save failed. Please try again.",
          })
        );
        return;
      }
      const cfg = normalizeStartupConfig(json.config);
      setDraft(cfg);
      setBaseline(cfg);
      setMessage(
        safeT("admin_startup_config_save_ok", {
          fallbackKo: "저장했습니다. 다음 앱 실행부터 적용됩니다.",
          fallbackEn: "Saved. Applies on the next app launch.",
        })
      );
    } catch {
      setMessage(
        safeT("admin_startup_config_save_failed", {
          fallbackKo: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
          fallbackEn: "Save failed. Please try again.",
        })
      );
    } finally {
      setSaving(false);
    }
  }, [draft, safeT]);

  const handleReset = useCallback(() => {
    setDraft({ ...BUNDLED_STARTUP_CONFIG, updatedAt: new Date().toISOString() });
    setMessage(null);
  }, []);

  const replayIntro = useCallback(() => {
    setPlayingExit(false);
    setReplayKey((k) => k + 1);
  }, []);

  const replayExit = useCallback(() => {
    setPlayingExit(true);
    setReplayKey((k) => k + 1);
    window.setTimeout(() => {
      setPlayingExit(false);
      setReplayKey((k) => k + 1);
    }, draft.introAnimation.exitDurationMs + 40);
  }, [draft.introAnimation.exitDurationMs]);

  const logoPreviewSrc =
    draft.logo.source === "uploaded" && draft.logo.url
      ? draft.logo.url
      : draft.logoUrl || "/images/brand/dibay-app-icon-180.png";

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={safeT("admin_startup_config_title", {
          fallbackKo: "앱 시작 설정",
          fallbackEn: "Startup config",
        })}
        description={safeT("admin_startup_config_desc", {
          fallbackKo:
            "Native 시작 Intro(로고·배경·액션)와 초기 탭을 관리합니다. 웹 Intro는 사용하지 않으며, 원격 설정은 다음 실행부터 적용됩니다.",
          fallbackEn:
            "Manage Native startup Intro (logo, background, motion) and the initial tab. Web Intro stays off; remote config applies on the next launch.",
        })}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="space-y-4">
          <AdminCard>
            {loading ? (
              <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
            ) : (
              <div className="space-y-6">
                {/* A. Initial surface */}
                <section className="space-y-2">
                  <h3 className="sam-text-body font-semibold text-sam-fg">
                    {safeT("admin_startup_config_section_surface", {
                      fallbackKo: "시작 화면",
                      fallbackEn: "Initial screen",
                    })}
                  </h3>
                  <SelectField
                    value={draft.initialSurface}
                    onChange={(v) =>
                      patch("initialSurface", v as StartupConfig["initialSurface"])
                    }
                    options={[
                      {
                        value: "community",
                        label: safeT("admin_startup_config_surface_community", {
                          fallbackKo: "커뮤니티",
                          fallbackEn: "Community",
                        }),
                      },
                      {
                        value: "trade",
                        label: safeT("admin_startup_config_surface_trade", {
                          fallbackKo: "거래",
                          fallbackEn: "Trade",
                        }),
                      },
                      {
                        value: "food",
                        label: safeT("admin_startup_config_surface_food", {
                          fallbackKo: "배달/푸드",
                          fallbackEn: "Food / Delivery",
                        }),
                      },
                      {
                        value: "chat",
                        label: safeT("admin_startup_config_surface_chat", {
                          fallbackKo: "채팅",
                          fallbackEn: "Chat",
                        }),
                      },
                      {
                        value: "my",
                        label: safeT("admin_startup_config_surface_my", {
                          fallbackKo: "마이",
                          fallbackEn: "My",
                        }),
                      },
                    ]}
                  />
                  <p className="sam-text-caption text-sam-muted">
                    {safeT("admin_startup_config_initial_surface_hint", {
                      fallbackKo: "기본값은 커뮤니티입니다. 저장 후 다음 앱 실행부터 적용됩니다.",
                      fallbackEn: "Default is Community. Applies on the next app launch after save.",
                    })}
                  </p>
                </section>

                {/* B. Logo */}
                <section className="space-y-3">
                  <h3 className="sam-text-body font-semibold text-sam-fg">
                    {safeT("admin_startup_config_section_logo", {
                      fallbackKo: "로고",
                      fallbackEn: "Logo",
                    })}
                  </h3>
                  <div className="flex flex-wrap items-center gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logoPreviewSrc}
                      alt=""
                      width={72}
                      height={72}
                      className="h-[72px] w-[72px] rounded-ui-rect border border-sam-border object-contain bg-sam-surface"
                    />
                    <div className="flex flex-wrap gap-2">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/jpg"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void uploadAsset("logo", f);
                        }}
                      />
                      <button
                        type="button"
                        disabled={uploading != null}
                        onClick={() => logoInputRef.current?.click()}
                        className="rounded-ui-rect bg-signature px-3 py-2 sam-text-body font-medium text-white disabled:opacity-50"
                      >
                        {uploading === "logo"
                          ? safeT("admin_startup_config_uploading", {
                              fallbackKo: "업로드 중…",
                              fallbackEn: "Uploading…",
                            })
                          : safeT("admin_startup_config_pick_logo", {
                              fallbackKo: "내 PC에서 로고 선택",
                              fallbackEn: "Choose logo from PC",
                            })}
                      </button>
                      <button
                        type="button"
                        disabled={uploading != null}
                        onClick={() => logoInputRef.current?.click()}
                        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body"
                      >
                        {safeT("admin_startup_config_replace_logo", {
                          fallbackKo: "교체",
                          fallbackEn: "Replace",
                        })}
                      </button>
                      <button
                        type="button"
                        onClick={() => patchLogo({ source: "default", url: null })}
                        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body"
                      >
                        {safeT("admin_startup_config_restore_default_logo", {
                          fallbackKo: "기본 DIBAY 로고로 복원",
                          fallbackEn: "Restore default DIBAY logo",
                        })}
                      </button>
                    </div>
                  </div>
                  <p className="sam-text-caption text-sam-muted">
                    {safeT("admin_startup_config_logo_hint", {
                      fallbackKo: "PNG · WEBP · JPG, 최대 2MB. 업로드 실패 시 기존 로고를 유지합니다.",
                      fallbackEn: "PNG · WEBP · JPG, max 2MB. On failure the previous logo is kept.",
                    })}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <FieldLabel>
                        {safeT("admin_startup_config_logo_size", {
                          fallbackKo: "로고 크기",
                          fallbackEn: "Logo size",
                        })}
                      </FieldLabel>
                      <SelectField
                        value={draft.logo.widthPreset}
                        onChange={(v) =>
                          patchLogo({
                            widthPreset: v as StartupConfig["logo"]["widthPreset"],
                          })
                        }
                        options={STARTUP_LOGO_WIDTH_PRESETS.map((v) => ({
                          value: v,
                          label:
                            v === "small"
                              ? safeT("admin_startup_config_size_small", {
                                  fallbackKo: "작게",
                                  fallbackEn: "Small",
                                })
                              : v === "medium"
                                ? safeT("admin_startup_config_size_medium", {
                                    fallbackKo: "보통",
                                    fallbackEn: "Medium",
                                  })
                                : v === "large"
                                  ? safeT("admin_startup_config_size_large", {
                                      fallbackKo: "크게",
                                      fallbackEn: "Large",
                                    })
                                  : safeT("admin_startup_config_size_custom", {
                                      fallbackKo: "직접 지정",
                                      fallbackEn: "Custom",
                                    }),
                        }))}
                      />
                    </div>
                    <div>
                      <FieldLabel>
                        {safeT("admin_startup_config_logo_vertical", {
                          fallbackKo: "세로 위치",
                          fallbackEn: "Vertical position",
                        })}
                      </FieldLabel>
                      <SelectField
                        value={draft.logo.verticalPosition}
                        onChange={(v) =>
                          patchLogo({
                            verticalPosition: v as StartupConfig["logo"]["verticalPosition"],
                          })
                        }
                        options={STARTUP_LOGO_VERTICAL.map((v) => ({
                          value: v,
                          label:
                            v === "upper"
                              ? safeT("admin_startup_config_pos_upper", {
                                  fallbackKo: "위",
                                  fallbackEn: "Upper",
                                })
                              : v === "lower"
                                ? safeT("admin_startup_config_pos_lower", {
                                    fallbackKo: "아래",
                                    fallbackEn: "Lower",
                                  })
                                : safeT("admin_startup_config_pos_center", {
                                    fallbackKo: "가운데",
                                    fallbackEn: "Center",
                                  }),
                        }))}
                      />
                    </div>
                  </div>
                  {draft.logo.widthPreset === "custom" ? (
                    <div>
                      <FieldLabel>
                        {safeT("admin_startup_config_logo_custom_width", {
                          fallbackKo: "커스텀 너비 (px, 40–160)",
                          fallbackEn: "Custom width (px, 40–160)",
                        })}
                      </FieldLabel>
                      <TextInput
                        type="number"
                        min={40}
                        max={160}
                        value={draft.logo.customWidthPx ?? 72}
                        onChange={(e) =>
                          patchLogo({
                            customWidthPx: Number(e.target.value) || 72,
                          })
                        }
                      />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="sam-text-caption text-sam-muted underline"
                    onClick={() => setShowAdvancedUrl((v) => !v)}
                  >
                    {safeT("admin_startup_config_advanced_url", {
                      fallbackKo: "고급: URL 직접 입력",
                      fallbackEn: "Advanced: paste URL",
                    })}
                  </button>
                  {showAdvancedUrl ? (
                    <TextInput
                      value={draft.logo.url ?? ""}
                      onChange={(e) => {
                        const url = e.target.value.trim();
                        if (!url) patchLogo({ source: "default", url: null });
                        else patchLogo({ source: "uploaded", url });
                      }}
                      placeholder="https://…"
                    />
                  ) : null}
                </section>

                {/* C. Animation */}
                <section className="space-y-3">
                  <h3 className="sam-text-body font-semibold text-sam-fg">
                    {safeT("admin_startup_config_section_anim", {
                      fallbackKo: "인트로 액션",
                      fallbackEn: "Intro motion",
                    })}
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <FieldLabel>
                        {safeT("admin_startup_config_enter_anim", {
                          fallbackKo: "등장 액션",
                          fallbackEn: "Enter",
                        })}
                      </FieldLabel>
                      <SelectField
                        value={draft.introAnimation.enter}
                        onChange={(v) =>
                          patchAnim({ enter: v as StartupConfig["introAnimation"]["enter"] })
                        }
                        options={STARTUP_ENTER_ANIMATIONS.map((v) => ({ value: v, label: v }))}
                      />
                    </div>
                    <div>
                      <FieldLabel>
                        {safeT("admin_startup_config_exit_anim", {
                          fallbackKo: "종료 액션",
                          fallbackEn: "Exit",
                        })}
                      </FieldLabel>
                      <SelectField
                        value={draft.introAnimation.exit}
                        onChange={(v) =>
                          patchAnim({ exit: v as StartupConfig["introAnimation"]["exit"] })
                        }
                        options={STARTUP_EXIT_ANIMATIONS.map((v) => ({ value: v, label: v }))}
                      />
                    </div>
                    <div>
                      <FieldLabel>
                        {safeT("admin_startup_config_ambient_anim", {
                          fallbackKo: "반복 효과",
                          fallbackEn: "Ambient",
                        })}
                      </FieldLabel>
                      <SelectField
                        value={draft.introAnimation.ambient}
                        onChange={(v) =>
                          patchAnim({
                            ambient: v as StartupConfig["introAnimation"]["ambient"],
                          })
                        }
                        options={STARTUP_AMBIENT_ANIMATIONS.map((v) => ({ value: v, label: v }))}
                      />
                    </div>
                    <div>
                      <FieldLabel>
                        {safeT("admin_startup_config_enter_ms", {
                          fallbackKo: "등장 시간 (150–1200ms)",
                          fallbackEn: "Enter duration (150–1200ms)",
                        })}
                      </FieldLabel>
                      <TextInput
                        type="number"
                        min={150}
                        max={1200}
                        value={draft.introAnimation.enterDurationMs}
                        onChange={(e) =>
                          patchAnim({ enterDurationMs: Number(e.target.value) || 280 })
                        }
                      />
                    </div>
                    <div>
                      <FieldLabel>
                        {safeT("admin_startup_config_exit_ms", {
                          fallbackKo: "종료 시간 (150–1200ms)",
                          fallbackEn: "Exit duration (150–1200ms)",
                        })}
                      </FieldLabel>
                      <TextInput
                        type="number"
                        min={150}
                        max={1200}
                        value={draft.introAnimation.exitDurationMs}
                        onChange={(e) =>
                          patchAnim({ exitDurationMs: Number(e.target.value) || 220 })
                        }
                      />
                    </div>
                  </div>
                  <p className="sam-text-caption text-sam-muted">
                    {safeT("admin_startup_config_anim_hint", {
                      fallbackKo:
                        "Intro 제거 기준은 shellReady입니다. 종료 시간은 제거 애니메이션 길이일 뿐입니다.",
                      fallbackEn:
                        "Intro removal is gated by shellReady. Exit duration is only the exit animation length.",
                    })}
                  </p>
                </section>

                {/* D. Background */}
                <section className="space-y-3">
                  <h3 className="sam-text-body font-semibold text-sam-fg">
                    {safeT("admin_startup_config_section_bg", {
                      fallbackKo: "배경",
                      fallbackEn: "Background",
                    })}
                  </h3>
                  <SelectField
                    value={draft.background.type}
                    onChange={(v) =>
                      patchBg({ type: v as StartupConfig["background"]["type"] })
                    }
                    options={STARTUP_BG_TYPES.map((v) => ({
                      value: v,
                      label:
                        v === "solid"
                          ? safeT("admin_startup_config_bg_solid", {
                              fallbackKo: "단색",
                              fallbackEn: "Solid color",
                            })
                          : v === "gradient"
                            ? safeT("admin_startup_config_bg_gradient", {
                                fallbackKo: "그라데이션",
                                fallbackEn: "Gradient",
                              })
                            : safeT("admin_startup_config_bg_image", {
                                fallbackKo: "배경 이미지",
                                fallbackEn: "Background image",
                              }),
                    }))}
                  />
                  <div>
                    <FieldLabel>
                      {safeT("admin_startup_config_bg", {
                        fallbackKo: "배경색",
                        fallbackEn: "Background color",
                      })}
                    </FieldLabel>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={draft.background.color.slice(0, 7)}
                        onChange={(e) => patchBg({ color: e.target.value.toUpperCase() })}
                        className="h-10 w-14 cursor-pointer rounded-ui-rect border border-sam-border"
                      />
                      <TextInput
                        value={draft.background.color}
                        onChange={(e) => patchBg({ color: e.target.value })}
                      />
                    </div>
                  </div>
                  {draft.background.type === "gradient" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <FieldLabel>
                          {safeT("admin_startup_config_gradient_from", {
                            fallbackKo: "시작 색",
                            fallbackEn: "From",
                          })}
                        </FieldLabel>
                        <TextInput
                          value={draft.background.gradientFrom ?? ""}
                          onChange={(e) => patchBg({ gradientFrom: e.target.value || null })}
                        />
                      </div>
                      <div>
                        <FieldLabel>
                          {safeT("admin_startup_config_gradient_to", {
                            fallbackKo: "종료 색",
                            fallbackEn: "To",
                          })}
                        </FieldLabel>
                        <TextInput
                          value={draft.background.gradientTo ?? ""}
                          onChange={(e) => patchBg({ gradientTo: e.target.value || null })}
                        />
                      </div>
                      <div>
                        <FieldLabel>
                          {safeT("admin_startup_config_gradient_dir", {
                            fallbackKo: "방향",
                            fallbackEn: "Direction",
                          })}
                        </FieldLabel>
                        <SelectField
                          value={draft.background.gradientDirection}
                          onChange={(v) =>
                            patchBg({
                              gradientDirection:
                                v as StartupConfig["background"]["gradientDirection"],
                            })
                          }
                          options={[
                            { value: "vertical", label: "vertical" },
                            { value: "horizontal", label: "horizontal" },
                            { value: "diagonal", label: "diagonal" },
                          ]}
                        />
                      </div>
                    </div>
                  ) : null}
                  {draft.background.type === "image" ? (
                    <div className="space-y-2">
                      <input
                        ref={bgInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/jpg"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void uploadAsset("background", f);
                        }}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={uploading != null}
                          onClick={() => bgInputRef.current?.click()}
                          className="rounded-ui-rect bg-signature px-3 py-2 sam-text-body font-medium text-white disabled:opacity-50"
                        >
                          {uploading === "background"
                            ? safeT("admin_startup_config_uploading", {
                                fallbackKo: "업로드 중…",
                                fallbackEn: "Uploading…",
                              })
                            : safeT("admin_startup_config_pick_bg", {
                                fallbackKo: "내 PC에서 배경 선택",
                                fallbackEn: "Choose background from PC",
                              })}
                        </button>
                        <button
                          type="button"
                          onClick={() => patchBg({ imageUrl: null, type: "solid" })}
                          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body"
                        >
                          {safeT("admin_startup_config_clear_bg_image", {
                            fallbackKo: "배경 이미지 삭제",
                            fallbackEn: "Remove background image",
                          })}
                        </button>
                      </div>
                      {draft.background.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={draft.background.imageUrl}
                          alt=""
                          className="max-h-32 rounded-ui-rect border border-sam-border object-cover"
                        />
                      ) : null}
                      <SelectField
                        value={draft.background.imageFit}
                        onChange={(v) =>
                          patchBg({
                            imageFit: v as StartupConfig["background"]["imageFit"],
                          })
                        }
                        options={STARTUP_BG_IMAGE_FITS.map((v) => ({ value: v, label: v }))}
                      />
                    </div>
                  ) : null}
                </section>

                {/* E. Caption + spinner */}
                <section className="space-y-3">
                  <h3 className="sam-text-body font-semibold text-sam-fg">
                    {safeT("admin_startup_config_section_caption", {
                      fallbackKo: "문구 · 스피너",
                      fallbackEn: "Caption · Spinner",
                    })}
                  </h3>
                  <label className="flex items-center gap-2 sam-text-body">
                    <input
                      type="checkbox"
                      checked={draft.showWordmark}
                      onChange={(e) => patch("showWordmark", e.target.checked)}
                    />
                    {safeT("admin_startup_config_show_wordmark", {
                      fallbackKo: "메인 문구 표시",
                      fallbackEn: "Show wordmark",
                    })}
                  </label>
                  <TextInput
                    value={draft.wordmark}
                    onChange={(e) => patch("wordmark", e.target.value)}
                    maxLength={48}
                  />
                  <label className="flex items-center gap-2 sam-text-body">
                    <input
                      type="checkbox"
                      checked={draft.caption.enabled}
                      onChange={(e) =>
                        patch("caption", { ...draft.caption, enabled: e.target.checked })
                      }
                    />
                    {safeT("admin_startup_config_caption_enabled", {
                      fallbackKo: "보조 문구 표시",
                      fallbackEn: "Show caption",
                    })}
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <FieldLabel>KO</FieldLabel>
                      <TextInput
                        value={draft.caption.ko}
                        onChange={(e) =>
                          patch("caption", { ...draft.caption, ko: e.target.value })
                        }
                        maxLength={80}
                      />
                    </div>
                    <div>
                      <FieldLabel>EN</FieldLabel>
                      <TextInput
                        value={draft.caption.en}
                        onChange={(e) =>
                          patch("caption", { ...draft.caption, en: e.target.value })
                        }
                        maxLength={80}
                      />
                    </div>
                  </div>
                  <div>
                    <FieldLabel>
                      {safeT("admin_startup_config_caption_color", {
                        fallbackKo: "문구 색상",
                        fallbackEn: "Caption color",
                      })}
                    </FieldLabel>
                    <TextInput
                      value={draft.caption.color}
                      onChange={(e) =>
                        patch("caption", { ...draft.caption, color: e.target.value })
                      }
                    />
                  </div>
                  <label className="flex items-center gap-2 sam-text-body">
                    <input
                      type="checkbox"
                      checked={draft.spinner.enabled}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        patch("spinner", { ...draft.spinner, enabled });
                        patch("showSpinner", enabled);
                      }}
                    />
                    {safeT("admin_startup_config_show_spinner", {
                      fallbackKo: "스피너 표시",
                      fallbackEn: "Show spinner",
                    })}
                  </label>
                  <SelectField
                    value={draft.spinner.style}
                    onChange={(v) =>
                      patch("spinner", {
                        ...draft.spinner,
                        style: v as StartupConfig["spinner"]["style"],
                      })
                    }
                    options={STARTUP_SPINNER_STYLES.map((v) => ({ value: v, label: v }))}
                  />
                </section>

                {message ? <p className="sam-text-body text-sam-muted">{message}</p> : null}

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    disabled={!dirty || saving}
                    onClick={() => void handleSave()}
                    className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white disabled:opacity-50"
                  >
                    {t("common_save")}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleReset}
                    className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body font-medium text-sam-fg"
                  >
                    {safeT("admin_startup_config_reset_defaults", {
                      fallbackKo: "기본값으로",
                      fallbackEn: "Reset to defaults",
                    })}
                  </button>
                  <button
                    type="button"
                    onClick={replayIntro}
                    className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body"
                  >
                    {safeT("admin_startup_config_replay", {
                      fallbackKo: "인트로 다시 보기",
                      fallbackEn: "Replay intro",
                    })}
                  </button>
                  <button
                    type="button"
                    onClick={replayExit}
                    className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-2 sam-text-body"
                  >
                    {safeT("admin_startup_config_replay_exit", {
                      fallbackKo: "종료 액션 미리보기",
                      fallbackEn: "Preview exit",
                    })}
                  </button>
                </div>
              </div>
            )}
          </AdminCard>
        </div>

        <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start">
          <AdminCard>
            <h3 className="mb-3 sam-text-body font-semibold text-sam-fg">
              {safeT("admin_startup_config_preview", {
                fallbackKo: "기기 미리보기",
                fallbackEn: "Device preview",
              })}
            </h3>
            <div className="flex flex-col items-center gap-4 overflow-x-auto pb-2">
              <StartupIntroPreview
                config={draft}
                replayKey={replayKey}
                playingExit={playingExit}
                frame="android"
              />
              <StartupIntroPreview
                config={draft}
                replayKey={replayKey}
                playingExit={playingExit}
                frame="ios"
              />
              <StartupIntroPreview
                config={draft}
                replayKey={replayKey}
                playingExit={playingExit}
                frame="tablet"
              />
            </div>
          </AdminCard>
        </aside>
      </div>

      <style jsx global>{`
        @keyframes dibay-su-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes dibay-su-fade-out {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
          }
        }
        @keyframes dibay-su-scale-in {
          from {
            transform: scale(0.86);
          }
          to {
            transform: scale(1);
          }
        }
        @keyframes dibay-su-scale-out {
          from {
            transform: scale(1);
            opacity: 1;
          }
          to {
            transform: scale(0.9);
            opacity: 0;
          }
        }
        @keyframes dibay-su-fade-scale-in {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes dibay-su-slide-up {
          from {
            opacity: 0;
            transform: translateY(24px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes dibay-su-slide-down {
          from {
            opacity: 0;
            transform: translateY(-24px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes dibay-su-exit-slide-up {
          from {
            opacity: 1;
            transform: translateY(0);
          }
          to {
            opacity: 0;
            transform: translateY(-28px);
          }
        }
        @keyframes dibay-su-pulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.04);
          }
        }
        @keyframes dibay-su-spin {
          to {
            transform: rotate(360deg);
          }
        }
        .dibay-su-enter-fade {
          animation-name: dibay-su-fade-in;
          animation-fill-mode: both;
        }
        .dibay-su-enter-scale {
          animation-name: dibay-su-scale-in;
          animation-fill-mode: both;
        }
        .dibay-su-enter-fade-scale {
          animation-name: dibay-su-fade-scale-in;
          animation-fill-mode: both;
        }
        .dibay-su-enter-slide-up {
          animation-name: dibay-su-slide-up;
          animation-fill-mode: both;
        }
        .dibay-su-enter-slide-down {
          animation-name: dibay-su-slide-down;
          animation-fill-mode: both;
        }
        .dibay-su-exit-fade {
          animation-name: dibay-su-fade-out;
          animation-fill-mode: both;
        }
        .dibay-su-exit-scale,
        .dibay-su-exit-fade-scale {
          animation-name: dibay-su-scale-out;
          animation-fill-mode: both;
        }
        .dibay-su-exit-slide-up {
          animation-name: dibay-su-exit-slide-up;
          animation-fill-mode: both;
        }
        .dibay-su-ambient-pulse,
        .dibay-su-ambient-breathe {
          animation: dibay-su-pulse 1.2s ease-in-out infinite;
        }
        .dibay-su-ambient-spin .dibay-su-preview-spinner,
        .dibay-su-preview-spinner {
          animation: dibay-su-spin 0.9s linear infinite;
        }
      `}</style>
    </div>
  );
}
