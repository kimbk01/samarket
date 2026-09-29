"use client";

/**
 * System Start Screen editor — Owner-facing Admin surface.
 *
 * Persists via /api/admin/startup-config (NOT IntroDocument / Pack).
 * Apply path: 앱 업데이트 후 반영 (no Publish / Service Apply).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import {
  BUNDLED_STARTUP_CONFIG,
  normalizeStartupConfig,
  startupConfigEquals,
  type StartupConfig,
} from "@/lib/startup/startup-config";
import { summarizeSystemStartDiff } from "@/lib/startup/system-start-build-input";

type SaveUi = "idle" | "confirm" | "saving" | "saved" | "error";

export function SystemStartEditor({ ko }: { ko: boolean }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState<StartupConfig>(() => ({
    ...BUNDLED_STARTUP_CONFIG,
  }));
  const [draft, setDraft] = useState<StartupConfig>(() => ({
    ...BUNDLED_STARTUP_CONFIG,
  }));
  const [saveUi, setSaveUi] = useState<SaveUi>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"logo" | "background" | null>(
    null,
  );
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/startup-config", {
          credentials: "same-origin",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          config?: unknown;
          error?: string;
        };
        if (!res.ok || !json.ok) {
          if (!cancelled) {
            setLoadError(json.error ?? "load_failed");
            setLoading(false);
          }
          return;
        }
        const cfg = normalizeStartupConfig(json.config);
        if (!cancelled) {
          setSaved(cfg);
          setDraft(cfg);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setLoadError("load_failed");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(
    () => !startupConfigEquals(saved, draft),
    [saved, draft],
  );

  const previewBg = draft.background.color || draft.backgroundColor;
  const previewLogo =
    draft.logo.source === "uploaded" && draft.logo.url
      ? draft.logo.url
      : draft.logoUrl || "/images/brand/dibay-app-icon-180.png";

  const logoWidthPx =
    draft.logo.widthPreset === "small"
      ? 56
      : draft.logo.widthPreset === "large"
        ? 96
        : draft.logo.widthPreset === "custom" && draft.logo.customWidthPx
          ? Math.min(160, Math.max(40, draft.logo.customWidthPx))
          : 72;

  const diff = useMemo(
    () => summarizeSystemStartDiff(saved, draft),
    [saved, draft],
  );

  const patchDraft = useCallback((patch: Partial<StartupConfig>) => {
    setDraft((prev) => normalizeStartupConfig({ ...prev, ...patch }));
    setSaveUi("idle");
    setSaveMessage(null);
  }, []);

  const uploadImage = useCallback(
    async (kind: "logo" | "background", file: File) => {
      setUploading(kind);
      setSaveMessage(null);
      try {
        const form = new FormData();
        form.set("kind", kind);
        form.set("file", file);
        const res = await fetch("/api/admin/startup-config/upload-image", {
          method: "POST",
          credentials: "same-origin",
          body: form,
        });
        const json = (await res.json()) as {
          ok?: boolean;
          url?: string;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.url) {
          setSaveMessage(json.error ?? "upload_failed");
          setSaveUi("error");
          return;
        }
        if (kind === "logo") {
          patchDraft({
            logo: {
              ...draft.logo,
              source: "uploaded",
              url: json.url,
            },
            logoUrl: json.url,
          });
        } else {
          patchDraft({
            background: {
              ...draft.background,
              type: "image",
              imageUrl: json.url,
            },
          });
        }
      } catch {
        setSaveMessage("upload_failed");
        setSaveUi("error");
      } finally {
        setUploading(null);
      }
    },
    [draft.background, draft.logo, patchDraft],
  );

  const onSaveConfirmed = useCallback(async () => {
    setSaveUi("saving");
    setSaveMessage(null);
    try {
      const next = normalizeStartupConfig({
        ...draft,
        updatedAt: new Date().toISOString(),
      });
      const res = await fetch("/api/admin/startup-config", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: next }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        config?: unknown;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setSaveUi("error");
        setSaveMessage(json.error ?? "save_failed");
        return;
      }
      const cfg = normalizeStartupConfig(json.config);
      setSaved(cfg);
      setDraft(cfg);
      setSaveUi("saved");
      setSaveMessage(
        ko
          ? "설정 저장됨 · 앱 빌드 필요 · 앱 업데이트 후 반영"
          : "Saved · app rebuild required · applies after app update",
      );
    } catch {
      setSaveUi("error");
      setSaveMessage("save_failed");
    }
  }, [draft, ko]);

  if (loading) {
    return (
      <div className="p-6 text-sm text-sam-muted" data-system-start-loading="1">
        {ko ? "불러오는 중…" : "Loading…"}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6 text-sm text-red-600" data-system-start-load-error="1">
        {ko ? `불러오기 실패: ${loadError}` : `Load failed: ${loadError}`}
      </div>
    );
  }

  return (
    <div
      className="grid flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_320px]"
      data-system-start-editor="1"
    >
      <section className="flex flex-col items-center gap-3">
        <h2 className="w-full text-sm font-semibold text-sam-fg">
          {ko ? "시스템 시작 화면" : "System start screen"}
        </h2>
        <div
          className="relative overflow-hidden rounded-[28px] border border-sam-border shadow-sm"
          style={{
            width: 240,
            height: 426,
            background:
              draft.background.type === "image" && draft.background.imageUrl
                ? `center / cover no-repeat url(${draft.background.imageUrl}), ${previewBg}`
                : previewBg,
          }}
          data-system-start-preview="1"
        >
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewLogo}
              alt=""
              width={logoWidthPx}
              height={logoWidthPx}
              className="object-contain"
              data-system-start-preview-logo="1"
            />
          </div>
        </div>
        <p className="text-[11px] text-sam-muted" data-system-start-apply-hint="1">
          {ko
            ? "적용 방식: 앱 업데이트 후 반영 · 게시/서비스 적용 없음"
            : "Apply: after app update · no Publish / Service Apply"}
        </p>
      </section>

      <aside className="space-y-4" data-system-start-inspector="1">
        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-bg p-3">
          <h3 className="text-xs font-semibold uppercase text-sam-muted">
            {ko ? "배경" : "Background"}
          </h3>
          <label className="block text-[11px] text-sam-muted">
            {ko ? "색상" : "Color"}
            <input
              type="color"
              className="mt-1 h-9 w-full cursor-pointer rounded border border-sam-border bg-sam-surface"
              value={normalizeColorInput(previewBg)}
              onChange={(e) => {
                const color = e.target.value;
                patchDraft({
                  backgroundColor: color,
                  background: {
                    ...draft.background,
                    type:
                      draft.background.type === "image" &&
                      draft.background.imageUrl
                        ? "image"
                        : "solid",
                    color,
                  },
                });
              }}
              data-system-start-bg-color="1"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <AdminActionButton
              variant="secondary"
              className="!min-h-8 !text-xs"
              disabled={uploading === "background"}
              onClick={() => bgInputRef.current?.click()}
              data-system-start-bg-pick="1"
            >
              {uploading === "background"
                ? ko
                  ? "업로드 중…"
                  : "Uploading…"
                : draft.background.imageUrl
                  ? ko
                    ? "배경 이미지 변경"
                    : "Change background image"
                  : ko
                    ? "배경 이미지 선택"
                    : "Select background image"}
            </AdminActionButton>
            {draft.background.imageUrl ? (
              <AdminActionButton
                variant="secondary"
                className="!min-h-8 !text-xs"
                onClick={() =>
                  patchDraft({
                    background: {
                      ...draft.background,
                      type: "solid",
                      imageUrl: null,
                    },
                  })
                }
                data-system-start-bg-clear="1"
              >
                {ko ? "이미지 제거" : "Remove image"}
              </AdminActionButton>
            ) : null}
          </div>
          <input
            ref={bgInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void uploadImage("background", f);
            }}
          />
        </section>

        <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-bg p-3">
          <h3 className="text-xs font-semibold uppercase text-sam-muted">
            {ko ? "로고 / 이미지" : "Logo / image"}
          </h3>
          {previewLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewLogo}
              alt=""
              className="h-16 w-16 rounded border border-sam-border object-contain bg-white"
              data-system-start-logo-thumb="1"
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <AdminActionButton
              variant="secondary"
              className="!min-h-8 !text-xs"
              disabled={uploading === "logo"}
              onClick={() => logoInputRef.current?.click()}
              data-system-start-logo-pick="1"
            >
              {uploading === "logo"
                ? ko
                  ? "업로드 중…"
                  : "Uploading…"
                : draft.logo.source === "uploaded"
                  ? ko
                    ? "로고 변경"
                    : "Change logo"
                  : ko
                    ? "이미지 선택"
                    : "Select image"}
            </AdminActionButton>
            {draft.logo.source === "uploaded" ? (
              <AdminActionButton
                variant="secondary"
                className="!min-h-8 !text-xs"
                onClick={() =>
                  patchDraft({
                    logo: {
                      ...draft.logo,
                      source: "default",
                      url: null,
                    },
                    logoUrl: BUNDLED_STARTUP_CONFIG.logoUrl,
                  })
                }
                data-system-start-logo-clear="1"
              >
                {ko ? "이미지 제거" : "Remove image"}
              </AdminActionButton>
            ) : null}
          </div>
          <label className="block text-[11px] text-sam-muted">
            {ko ? "크기" : "Size"}
            <select
              className="mt-1 w-full rounded border border-sam-border bg-sam-surface px-2 py-1.5 text-sm text-sam-fg"
              value={draft.logo.widthPreset}
              onChange={(e) =>
                patchDraft({
                  logo: {
                    ...draft.logo,
                    widthPreset: e.target
                      .value as StartupConfig["logo"]["widthPreset"],
                  },
                })
              }
              data-system-start-logo-size="1"
            >
              <option value="small">{ko ? "작게" : "Small"}</option>
              <option value="medium">{ko ? "보통" : "Medium"}</option>
              <option value="large">{ko ? "크게" : "Large"}</option>
            </select>
          </label>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void uploadImage("logo", f);
            }}
          />
        </section>

        <section
          className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-bg p-3 text-[11px]"
          data-system-start-status="1"
        >
          <p className="font-semibold text-sam-fg">
            {dirty
              ? ko
                ? "저장되지 않음"
                : "Unsaved"
              : ko
                ? "설정 저장됨"
                : "Settings saved"}
          </p>
          <p className="text-sam-muted">
            {ko ? "앱 빌드 필요" : "App rebuild required"}
          </p>
          <p className="text-sam-muted">
            {ko ? "앱 업데이트 후 반영" : "Applies after app update"}
          </p>
          <p className="text-amber-800 dark:text-amber-200">
            {ko
              ? "현재 앱 적용: 설치 픽셀 미검증 · 적용 완료로 표시하지 않음"
              : "Installed app: pixels not proven — do not claim applied"}
          </p>
          <p className="text-sam-muted">
            {ko
              ? "빌드 연동: 설정 저장 가능 · 네이티브 리소스 생성 스크립트 있음 · 스토어 배포 자동화 없음"
              : "Build chain: save OK · resource script exists · no store deploy automation"}
          </p>
        </section>

        <AdminActionButton
          variant="primary"
          disabled={!dirty || saveUi === "saving"}
          onClick={() => setSaveUi("confirm")}
          data-system-start-save="1"
        >
          {saveUi === "saving"
            ? ko
              ? "저장 중…"
              : "Saving…"
            : ko
              ? "설정 저장"
              : "Save settings"}
        </AdminActionButton>
        {saveMessage ? (
          <p
            className={`text-[11px] ${
              saveUi === "error" ? "text-red-600" : "text-emerald-700"
            }`}
            data-system-start-save-message="1"
          >
            {saveMessage}
          </p>
        ) : null}
      </aside>

      {saveUi === "confirm" ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          data-system-start-save-confirm="1"
        >
          <div className="w-full max-w-md rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-lg">
            <p className="font-semibold text-sam-fg">
              {ko
                ? "시스템 시작 화면 설정을 저장하시겠습니까?"
                : "Save system start settings?"}
            </p>
            <ul className="mt-3 space-y-1 text-xs text-sam-muted">
              <li>
                {ko ? "변경:" : "Changes:"}
              </li>
              <li>
                {ko ? "배경" : "Background"} {diff.background}
              </li>
              <li>
                {ko ? "로고" : "Logo"} {diff.logo}
              </li>
              <li className="pt-2">
                {ko
                  ? "반영: 새 앱 빌드 및 업데이트 후 적용됩니다."
                  : "Applies after a new app build and update."}
              </li>
              <li>
                {ko
                  ? "현재 설치된 앱에는 즉시 반영되지 않습니다."
                  : "Does not apply instantly to the installed app."}
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <AdminActionButton
                variant="primary"
                onClick={() => void onSaveConfirmed()}
                data-system-start-save-confirm-yes="1"
              >
                {ko ? "설정 저장" : "Save settings"}
              </AdminActionButton>
              <AdminActionButton
                variant="secondary"
                onClick={() => setSaveUi("idle")}
                data-system-start-save-confirm-no="1"
              >
                {ko ? "취소" : "Cancel"}
              </AdminActionButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function normalizeColorInput(hex: string): string {
  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9A-Fa-f]{8}$/.test(hex)) return hex.slice(0, 7);
  return "#FFFCFC";
}
