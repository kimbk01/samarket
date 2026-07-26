"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  DEFAULT_COLD_BOOT_INTRO_CONFIG,
  normalizeColdBootIntroConfig,
  type ColdBootIntroConfig,
} from "@/lib/app-boot/cold-boot-intro-config";

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

export function ColdBootIntroAdminPage() {
  const { t, safeT } = useI18n();
  const [draft, setDraft] = useState<ColdBootIntroConfig>(() => ({
    ...DEFAULT_COLD_BOOT_INTRO_CONFIG,
  }));
  const [baseline, setBaseline] = useState<ColdBootIntroConfig>(() => ({
    ...DEFAULT_COLD_BOOT_INTRO_CONFIG,
  }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/cold-boot-intro", { credentials: "same-origin" });
        const json = (await res.json()) as { ok?: boolean; config?: unknown };
        if (!cancelled && json.ok) {
          const cfg = normalizeColdBootIntroConfig(json.config);
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

  const patch = useCallback(<K extends keyof ColdBootIntroConfig>(key: K, value: ColdBootIntroConfig[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/cold-boot-intro", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: draft }),
      });
      const json = (await res.json()) as { ok?: boolean; config?: unknown; error?: string };
      if (!res.ok || !json.ok) {
        setMessage(
          safeT("admin_cold_boot_intro_save_failed", {
            fallbackKo: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
            fallbackEn: "Save failed. Please try again.",
          })
        );
        return;
      }
      const cfg = normalizeColdBootIntroConfig(json.config);
      setDraft(cfg);
      setBaseline(cfg);
      setMessage(
        safeT("admin_cold_boot_intro_save_ok", {
          fallbackKo: "저장했습니다. 다음 앱 실행부터 적용됩니다.",
          fallbackEn: "Saved. Applies on the next app launch.",
        })
      );
    } catch {
      setMessage(
        safeT("admin_cold_boot_intro_save_failed", {
          fallbackKo: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
          fallbackEn: "Save failed. Please try again.",
        })
      );
    } finally {
      setSaving(false);
    }
  }, [draft, safeT]);

  const handleReset = useCallback(() => {
    setDraft({ ...DEFAULT_COLD_BOOT_INTRO_CONFIG, updatedAt: new Date().toISOString() });
    setMessage(null);
  }, []);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={safeT("admin_cold_boot_intro_title", {
          fallbackKo: "앱 시작 인트로",
          fallbackEn: "Cold boot intro",
        })}
        description={safeT("admin_cold_boot_intro_desc", {
          fallbackKo:
            "앱 아이콘 탭부터 첫 화면까지 보이는 DIBAY 브랜드 인트로입니다. 원격 설정은 다음 실행부터 적용되며, 네트워크를 기다리지 않습니다.",
          fallbackEn:
            "Brand intro from app icon tap to first screen. Remote config applies on the next launch and never blocks cold start.",
        })}
      />

      <AdminCard>
        {loading ? (
          <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
        ) : (
          <div className="space-y-4">
            <label className="flex items-center gap-2 sam-text-body text-sam-fg">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => patch("enabled", e.target.checked)}
              />
              {safeT("admin_cold_boot_intro_enabled", {
                fallbackKo: "인트로 사용",
                fallbackEn: "Enable intro",
              })}
            </label>

            <div>
              <FieldLabel>
                {safeT("admin_cold_boot_intro_logo_url", {
                  fallbackKo: "로고 URL",
                  fallbackEn: "Logo URL",
                })}
              </FieldLabel>
              <TextInput
                value={draft.logoUrl}
                onChange={(e) => patch("logoUrl", e.target.value)}
                placeholder="/images/brand/dibay-app-icon-180.png"
              />
            </div>

            <div>
              <FieldLabel>
                {safeT("admin_cold_boot_intro_wordmark", {
                  fallbackKo: "메인 문구",
                  fallbackEn: "Wordmark",
                })}
              </FieldLabel>
              <TextInput
                value={draft.wordmark}
                onChange={(e) => patch("wordmark", e.target.value)}
                maxLength={48}
              />
            </div>

            <div>
              <FieldLabel>
                {safeT("admin_cold_boot_intro_subtitle", {
                  fallbackKo: "서브 문구 (선택, 짧게)",
                  fallbackEn: "Subtitle (optional, short)",
                })}
              </FieldLabel>
              <TextInput
                value={draft.subtitle}
                onChange={(e) => patch("subtitle", e.target.value)}
                maxLength={80}
                placeholder="Merry Christmas"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel>
                  {safeT("admin_cold_boot_intro_bg", {
                    fallbackKo: "배경색 (라이트)",
                    fallbackEn: "Background (light)",
                  })}
                </FieldLabel>
                <TextInput
                  value={draft.backgroundColor}
                  onChange={(e) => patch("backgroundColor", e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>
                  {safeT("admin_cold_boot_intro_bg_dark", {
                    fallbackKo: "배경색 (다크)",
                    fallbackEn: "Background (dark)",
                  })}
                </FieldLabel>
                <TextInput
                  value={draft.backgroundColorDark}
                  onChange={(e) => patch("backgroundColorDark", e.target.value)}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 sam-text-body text-sam-fg">
              <input
                type="checkbox"
                checked={draft.showWordmark}
                onChange={(e) => patch("showWordmark", e.target.checked)}
              />
              {safeT("admin_cold_boot_intro_show_wordmark", {
                fallbackKo: "메인 문구 표시",
                fallbackEn: "Show wordmark",
              })}
            </label>

            <label className="flex items-center gap-2 sam-text-body text-sam-fg">
              <input
                type="checkbox"
                checked={draft.showSpinner}
                onChange={(e) => patch("showSpinner", e.target.checked)}
              />
              {safeT("admin_cold_boot_intro_show_spinner", {
                fallbackKo: "스피너 표시",
                fallbackEn: "Show spinner",
              })}
            </label>

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
                {safeT("admin_cold_boot_intro_reset_defaults", {
                  fallbackKo: "기본값으로",
                  fallbackEn: "Reset to defaults",
                })}
              </button>
            </div>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
