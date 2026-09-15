"use client";

/**
 * Admin FIRST ENTRY operational editor — single operator surface.
 * Config SSOT: startup_product_intro_v1. Application visual owner: Native V2 only.
 * Does not expose Technical Boot / shellReady / LKG terminology.
 */

import type { InputHTMLAttributes, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  BUNDLED_PRODUCT_INTRO_CONFIG,
  PRODUCT_INTRO_ANIM_IN,
  PRODUCT_INTRO_ANIM_OUT,
  PRODUCT_INTRO_SIZE_PRESETS,
  cssClassForProductIntroEnter,
  isProductIntroDisplayEligible,
  normalizeProductIntroConfig,
  productIntroEnterMotionMs,
  productIntroExitMotionMs,
  productIntroConfigEquals,
  type ProductIntroAnimIn,
  type ProductIntroAnimOut,
  type ProductIntroConfig,
  type ProductIntroSizePreset,
} from "@/lib/startup/product-intro";
import {
  prefetchProductIntroMedia,
  writeProductIntroCache,
} from "@/lib/startup/product-intro-cache";
import { syncProductIntroToNative } from "@/lib/startup/product-intro-native-sync";
import {
  PRODUCT_INTRO_CANONICAL_ASPECT,
  PRODUCT_INTRO_MAX_SOURCE_BYTES,
  PRODUCT_INTRO_RECOMMENDED_EXPORT_HEIGHT_PX,
  PRODUCT_INTRO_RECOMMENDED_EXPORT_WIDTH_PX,
  PRODUCT_INTRO_SAFE_ZONE_INSET_PCT,
  PRODUCT_INTRO_SUPPORTED_FORMATS,
  PRODUCT_INTRO_VIEWPORT_PRESETS,
  computeContainedCreativeRect,
  type ProductIntroViewportKind,
} from "@/lib/startup/product-intro-geometry";
import { validateCampaignImageFile } from "@/lib/admin/notification-campaigns/validate-campaign-image";
import { INITIAL_APP_SURFACES, type InitialAppSurface } from "@/lib/startup/initial-app-surface";

function formatBytesShort(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}

type ClickMode = "none" | "navigate";
type DestKind =
  | "community"
  | "trade"
  | "food"
  | "chat"
  | "my"
  | "store"
  | "product"
  | "community_post"
  | "market_listing"
  | "delivery_category"
  | "chat_room";

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

function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string | null {
  const t = local.trim();
  if (!t) return null;
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function clickModeFrom(config: ProductIntroConfig): ClickMode {
  return config.action.type === "none" ? "none" : "navigate";
}

function destKindFrom(config: ProductIntroConfig): DestKind {
  const t = config.action.type;
  if (t === "internal_surface") {
    const s = config.action.target as InitialAppSurface;
    if ((INITIAL_APP_SURFACES as readonly string[]).includes(s)) return s;
    return "community";
  }
  if (t === "store") return "store";
  if (t === "product") return "product";
  if (t === "community_post") return "community_post";
  if (t === "market_listing") return "market_listing";
  if (t === "delivery_category") return "delivery_category";
  if (t === "chat_room") return "chat_room";
  return "community";
}

function actionFromOperator(mode: ClickMode, kind: DestKind, target: string): ProductIntroConfig["action"] {
  if (mode === "none") return { type: "none", target: "" };
  if (
    kind === "community" ||
    kind === "trade" ||
    kind === "food" ||
    kind === "chat" ||
    kind === "my"
  ) {
    return { type: "internal_surface", target: kind };
  }
  if (kind === "store") return { type: "store", target: target.trim() };
  if (kind === "product") return { type: "product", target: target.trim() };
  if (kind === "community_post") return { type: "community_post", target: target.trim() };
  if (kind === "market_listing") return { type: "market_listing", target: target.trim() };
  if (kind === "delivery_category") return { type: "delivery_category", target: target.trim() };
  return { type: "chat_room", target: target.trim() };
}

function needsTargetId(kind: DestKind): boolean {
  return (
    kind === "store" ||
    kind === "product" ||
    kind === "community_post" ||
    kind === "market_listing" ||
    kind === "delivery_category" ||
    kind === "chat_room"
  );
}

function FirstEntryPreview({
  config,
  replayKey,
  viewport,
}: {
  config: ProductIntroConfig;
  replayKey: number;
  viewport: ProductIntroViewportKind;
}) {
  const media = config.media.mobileUrl;
  const preset = PRODUCT_INTRO_VIEWPORT_PRESETS[viewport];
  const scale = Math.min(220 / preset.width, 420 / preset.height);
  const frameW = Math.round(preset.width * scale);
  const frameH = Math.round(preset.height * scale);
  const box = computeContainedCreativeRect({
    viewportWidth: preset.width,
    viewportHeight: preset.height,
    imageWidth: PRODUCT_INTRO_RECOMMENDED_EXPORT_WIDTH_PX,
    imageHeight: PRODUCT_INTRO_RECOMMENDED_EXPORT_HEIGHT_PX,
    sizePreset: config.sizePreset,
  });
  const imgW = Math.round(box.width * scale);
  const imgH = Math.round(box.height * scale);
  const safeInset = `${PRODUCT_INTRO_SAFE_ZONE_INSET_PCT}%`;
  const enterClass = cssClassForProductIntroEnter(config.animationIn);
  const enterMs = productIntroEnterMotionMs(config.animationIn);
  const exitMs = productIntroExitMotionMs(config.animationOut);

  return (
    <div className="space-y-2">
      <div
        key={`${replayKey}-${viewport}`}
        className="relative mx-auto flex flex-col items-center justify-center overflow-hidden rounded-[24px] border border-sam-border"
        style={{
          width: frameW,
          height: frameH,
          background: config.backgroundColor || "#FFFCFC",
        }}
      >
        {media ? (
          <div className="relative flex h-full w-full items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={media}
              alt=""
              className={enterClass}
              style={{
                width: imgW,
                height: imgH,
                objectFit: "contain",
                display: "block",
                animationDuration: `${enterMs}ms`,
              }}
            />
            <div
              className="pointer-events-none absolute inset-0 border border-dashed border-sam-brand/40"
              style={{ margin: safeInset }}
              aria-hidden
            />
          </div>
        ) : (
          <p className="px-4 text-center sam-text-caption text-sam-muted">이미지를 선택하세요</p>
        )}
      </div>
      <p className="text-center sam-text-caption text-sam-muted">
        {config.status === "active" && isProductIntroDisplayEligible(config)
          ? "사용 중 · 표시 가능"
          : config.status === "active"
            ? "사용 중 · 일정/이미지 확인"
            : "사용 안 함"}
      </p>
      <p className="text-center sam-text-caption text-sam-muted">
        {`진입 ${enterMs}ms · 종료 ${exitMs}ms`}
      </p>
    </div>
  );
}

export function ProductIntroAdminSection() {
  const { safeT } = useI18n();
  const [draft, setDraft] = useState<ProductIntroConfig>(() => ({
    ...BUNDLED_PRODUCT_INTRO_CONFIG,
  }));
  const [baseline, setBaseline] = useState<ProductIntroConfig>(() => ({
    ...BUNDLED_PRODUCT_INTRO_CONFIG,
  }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [replayKey, setReplayKey] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [previewViewport, setPreviewViewport] =
    useState<ProductIntroViewportKind>("phone_portrait");
  const mobileRef = useRef<HTMLInputElement>(null);
  const tabletRef = useRef<HTMLInputElement>(null);

  const clickMode = clickModeFrom(draft);
  const destKind = destKindFrom(draft);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/startup-product-intro", {
          credentials: "same-origin",
        });
        const json = (await res.json()) as { ok?: boolean; config?: unknown };
        if (!cancelled && json?.ok) {
          const next = normalizeProductIntroConfig(json.config);
          setDraft(next);
          setBaseline(next);
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

  const dirty = useMemo(() => !productIntroConfigEquals(draft, baseline), [draft, baseline]);

  const patch = useCallback((partial: Partial<ProductIntroConfig>) => {
    setDraft((prev) => normalizeProductIntroConfig({ ...prev, ...partial }));
  }, []);

  const setEnabled = useCallback(
    (on: boolean) => {
      patch({ status: on ? "active" : "inactive" });
    },
    [patch]
  );

  const setClick = useCallback(
    (mode: ClickMode, kind: DestKind = destKind, target = draft.action.target) => {
      patch({ action: actionFromOperator(mode, kind, target) });
    },
    [destKind, draft.action.target, patch]
  );

  const upload = useCallback(
    async (kind: "mobile" | "tablet", file: File) => {
      setUploading(true);
      setMessage(null);
      const priorMobile = draft.media.mobileUrl;
      const priorTablet = draft.media.tabletUrl;
      try {
        const validated = validateCampaignImageFile(file, {
          maxBytes: PRODUCT_INTRO_MAX_SOURCE_BYTES,
        });
        if (!validated.ok) {
          if (validated.error === "file_too_large") {
            setMessage(
              safeT("admin_first_entry_file_too_large", {
                fallbackKo: `원본이 너무 큽니다. 최대 ${Math.round(PRODUCT_INTRO_MAX_SOURCE_BYTES / (1024 * 1024))}MB까지 올릴 수 있습니다(업로드 시 자동 최적화). 기존 이미지는 유지됩니다.`,
                fallbackEn: `Source file is too large. Max ${Math.round(PRODUCT_INTRO_MAX_SOURCE_BYTES / (1024 * 1024))}MB (auto-optimized on upload). The previous image was kept.`,
              })
            );
          } else if (validated.error === "invalid_type") {
            setMessage(
              safeT("admin_first_entry_invalid_type", {
                fallbackKo: `지원 형식: ${PRODUCT_INTRO_SUPPORTED_FORMATS.map((m) => m.replace("image/", "").toUpperCase()).join(", ")}. 기존 이미지는 유지됩니다.`,
                fallbackEn: `Allowed: JPG, PNG, WEBP. The previous image was kept.`,
              })
            );
          } else {
            setMessage(
              safeT("admin_startup_config_upload_failed", {
                fallbackKo: "업로드에 실패했습니다. 기존 이미지는 유지됩니다.",
                fallbackEn: "Upload failed. The previous image was kept.",
              })
            );
          }
          return;
        }
        const fd = new FormData();
        fd.set("kind", kind === "mobile" ? "product" : "product_tablet");
        fd.set("file", file);
        const res = await fetch("/api/admin/startup-config/upload-image", {
          method: "POST",
          credentials: "same-origin",
          body: fd,
        });
        const json = (await res.json()) as {
          ok?: boolean;
          url?: string;
          error?: string;
          optimized?: boolean;
          originalBytes?: number;
          outputBytes?: number;
          width?: number;
          height?: number;
        };
        if (!res.ok || !json.ok || !json.url) {
          if (json.error === "file_too_large") {
            setMessage(
              safeT("admin_first_entry_file_too_large", {
                fallbackKo: `원본이 너무 큽니다. 최대 ${Math.round(PRODUCT_INTRO_MAX_SOURCE_BYTES / (1024 * 1024))}MB까지 올릴 수 있습니다(업로드 시 자동 최적화). 기존 이미지는 유지됩니다.`,
                fallbackEn: `Source file is too large. Max ${Math.round(PRODUCT_INTRO_MAX_SOURCE_BYTES / (1024 * 1024))}MB (auto-optimized on upload). The previous image was kept.`,
              })
            );
          } else if (
            json.error === "image_decode_failed" ||
            json.error === "invalid_dimensions" ||
            json.error === "source_dimensions_too_large" ||
            json.error === "optimize_failed" ||
            json.error === "output_too_large"
          ) {
            setMessage(
              safeT("admin_first_entry_optimize_failed", {
                fallbackKo: `이미지를 처리할 수 없습니다(${json.error}). 기존 이미지는 유지됩니다.`,
                fallbackEn: `Could not process image (${json.error}). The previous image was kept.`,
              })
            );
          } else {
            setMessage(
              safeT("admin_startup_config_upload_failed", {
                fallbackKo: "업로드에 실패했습니다. 기존 이미지는 유지됩니다.",
                fallbackEn: "Upload failed. The previous image was kept.",
              })
            );
          }
          // Preserve prior draft media on failed replacement.
          patch({
            media: {
              mobileUrl: priorMobile,
              tabletUrl: priorTablet,
            },
          });
          return;
        }
        setDraft((prev) =>
          normalizeProductIntroConfig({
            ...prev,
            media: {
              ...prev.media,
              ...(kind === "mobile" ? { mobileUrl: json.url } : { tabletUrl: json.url }),
            },
          })
        );
        const orig =
          typeof json.originalBytes === "number" ? formatBytesShort(json.originalBytes) : null;
        const out =
          typeof json.outputBytes === "number" ? formatBytesShort(json.outputBytes) : null;
        const resLabel =
          typeof json.width === "number" && typeof json.height === "number"
            ? `${json.width}×${json.height}`
            : `${PRODUCT_INTRO_RECOMMENDED_EXPORT_WIDTH_PX}×${PRODUCT_INTRO_RECOMMENDED_EXPORT_HEIGHT_PX}`;
        const sizeLine =
          orig && out
            ? safeT("admin_first_entry_optimize_summary", {
                fallbackKo: `원본 ${orig} → 최적화 ${out} · ${resLabel}`,
                fallbackEn: `Original ${orig} → optimized ${out} · ${resLabel}`,
                vars: { original: orig, optimized: out, resolution: resLabel },
              })
            : null;
        setMessage(
          [
            sizeLine,
            safeT("admin_first_entry_upload_ready", {
              fallbackKo: "업로드 준비 완료",
              fallbackEn: "Upload ready",
            }),
            safeT("admin_first_entry_upload_need_save", {
              fallbackKo: "새 이미지가 업로드되었습니다. 적용하려면 저장하세요.",
              fallbackEn: "New image uploaded. Press Save to apply.",
            }),
          ]
            .filter(Boolean)
            .join(" · ")
        );
      } catch {
        setMessage(
          safeT("admin_startup_config_upload_failed", {
            fallbackKo: "업로드에 실패했습니다. 기존 이미지는 유지됩니다.",
            fallbackEn: "Upload failed. The previous image was kept.",
          })
        );
      } finally {
        setUploading(false);
      }
    },
    [draft.media.mobileUrl, draft.media.tabletUrl, patch, safeT]
  );

  const save = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/startup-product-intro", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: draft }),
      });
      const json = (await res.json()) as { ok?: boolean; config?: unknown; error?: string };
      if (!res.ok || !json.ok) {
        setMessage(json.error ?? "save_failed");
        return;
      }
      const next = normalizeProductIntroConfig(json.config);
      setDraft(next);
      setBaseline(next);
      writeProductIntroCache(next);
      syncProductIntroToNative(next);
      if (next.media.mobileUrl && isProductIntroDisplayEligible(next)) {
        void prefetchProductIntroMedia(next.media.mobileUrl, { markReady: true });
      }
      setMessage(
        safeT("admin_first_entry_saved", {
          fallbackKo: "저장되었습니다.",
          fallbackEn: "Saved.",
        })
      );
    } catch {
      setMessage("save_failed");
    } finally {
      setSaving(false);
    }
  }, [draft, safeT]);

  if (loading) {
    return <p className="sam-text-body text-sam-muted">{safeT("common_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-8 lg:grid-cols-[1fr_240px]">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
            <div>
              <p className="sam-text-body font-semibold text-sam-fg">
                {safeT("admin_first_entry_enable", {
                  fallbackKo: "첫 진입 화면 사용",
                  fallbackEn: "Use first-entry screen",
                })}
              </p>
              <p className="sam-text-caption text-sam-muted">
                {safeT("admin_first_entry_enable_help", {
                  fallbackKo: "끄면 앱 콘텐츠로 바로 들어갑니다.",
                  fallbackEn: "When off, the app opens content immediately.",
                })}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.status === "active"}
              className={`relative h-8 w-14 rounded-full transition-colors ${
                draft.status === "active" ? "bg-sam-brand" : "bg-sam-border"
              }`}
              onClick={() => setEnabled(draft.status !== "active")}
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  draft.status === "active" ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>

          <div>
            <FieldLabel>
              {safeT("admin_first_entry_image", { fallbackKo: "이미지", fallbackEn: "Image" })}
            </FieldLabel>
            <input
              ref={mobileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload("mobile", f);
                e.target.value = "";
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="sam-btn sam-btn-secondary"
                disabled={uploading}
                onClick={() => mobileRef.current?.click()}
              >
                {uploading
                  ? safeT("admin_startup_config_uploading", {
                      fallbackKo: "업로드 중…",
                      fallbackEn: "Uploading…",
                    })
                  : draft.media.mobileUrl
                    ? safeT("admin_first_entry_replace_image", {
                        fallbackKo: "이미지 바꾸기",
                        fallbackEn: "Replace image",
                      })
                    : safeT("admin_first_entry_pick_image", {
                        fallbackKo: "이미지 선택",
                        fallbackEn: "Choose image",
                      })}
              </button>
              {draft.media.mobileUrl ? (
                <button
                  type="button"
                  className="sam-btn sam-btn-ghost"
                  onClick={() =>
                    patch({ media: { ...draft.media, mobileUrl: null } })
                  }
                >
                  {safeT("admin_first_entry_clear_image", {
                    fallbackKo: "제거",
                    fallbackEn: "Remove",
                  })}
                </button>
              ) : null}
            </div>
            {draft.media.mobileUrl ? (
              <div className="mt-3 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={draft.media.mobileUrl}
                  alt=""
                  className="mx-auto max-h-40 object-contain"
                />
              </div>
            ) : null}
            <p className="mt-2 sam-text-caption text-sam-muted">
              {safeT("admin_first_entry_image_guide", {
                fallbackKo: `권장 ${PRODUCT_INTRO_RECOMMENDED_EXPORT_WIDTH_PX}×${PRODUCT_INTRO_RECOMMENDED_EXPORT_HEIGHT_PX} · ${PRODUCT_INTRO_CANONICAL_ASPECT}. 업로드 시 서버가 자동 최적화합니다(원본 최대 ${Math.round(PRODUCT_INTRO_MAX_SOURCE_BYTES / (1024 * 1024))}MB · JPG/PNG/WEBP). 중요한 글자·로고는 가장자리에서 ${PRODUCT_INTRO_SAFE_ZONE_INSET_PCT}% 안쪽(안전 영역)에 두세요. 원본 1장으로 모든 기기에 맞춰 표시됩니다.`,
                fallbackEn: `Recommended ${PRODUCT_INTRO_RECOMMENDED_EXPORT_WIDTH_PX}×${PRODUCT_INTRO_RECOMMENDED_EXPORT_HEIGHT_PX} · ${PRODUCT_INTRO_CANONICAL_ASPECT}. Auto-optimized on upload (source max ${Math.round(PRODUCT_INTRO_MAX_SOURCE_BYTES / (1024 * 1024))}MB · JPG/PNG/WEBP). Keep text/logo inside the ${PRODUCT_INTRO_SAFE_ZONE_INSET_PCT}% safe inset. One source image renders responsively on all devices.`,
              })}
            </p>
          </div>

          <details
            className="rounded-ui-rect border border-sam-border px-3 py-2"
            open={advancedOpen}
            onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer sam-text-body font-medium text-sam-fg">
              {safeT("admin_first_entry_advanced_media", {
                fallbackKo: "기기별 이미지 고급 설정",
                fallbackEn: "Per-device image (optional)",
              })}
            </summary>
            <div className="mt-3 space-y-2">
              <p className="sam-text-caption text-sam-muted">
                {safeT("admin_first_entry_advanced_media_help", {
                  fallbackKo: "비우면 위 이미지가 폰·태블릿에 함께 사용됩니다.",
                  fallbackEn: "If empty, the main image is used on phone and tablet.",
                })}
              </p>
              <input
                ref={tabletRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload("tablet", f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="sam-btn sam-btn-secondary"
                disabled={uploading}
                onClick={() => tabletRef.current?.click()}
              >
                {safeT("admin_first_entry_tablet_image", {
                  fallbackKo: "태블릿 이미지 (선택)",
                  fallbackEn: "Tablet image (optional)",
                })}
              </button>
              {draft.media.tabletUrl ? (
                <p className="break-all sam-text-caption text-sam-muted">{draft.media.tabletUrl}</p>
              ) : null}
            </div>
          </details>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>
                {safeT("admin_first_entry_bg", {
                  fallbackKo: "배경색",
                  fallbackEn: "Background",
                })}
              </FieldLabel>
              <TextInput
                type="color"
                value={/^#[0-9A-Fa-f]{6}$/.test(draft.backgroundColor) ? draft.backgroundColor : "#FFFCFC"}
                onChange={(e) => patch({ backgroundColor: e.target.value })}
              />
              <p className="mt-1 sam-text-caption text-sam-muted">
                {safeT("admin_first_entry_bg_help", {
                  fallbackKo: "전체 기기 캔버스 배경. 기본값은 앱 런치 화면과 같습니다.",
                  fallbackEn: "Full-device canvas background. Default matches the launch canvas.",
                })}
              </p>
            </div>
            <div>
              <FieldLabel>
                {safeT("admin_first_entry_display_mode", {
                  fallbackKo: "표시 방식",
                  fallbackEn: "Display",
                })}
              </FieldLabel>
              <p className="sam-text-caption text-sam-muted">
                {safeT("admin_first_entry_contain_locked", {
                  fallbackKo:
                    "전체 캔버스 + 이미지 비율 유지(잘림 없음). 카드/채우기/그림자 없음.",
                  fallbackEn:
                    "Full canvas + preserve image aspect (no crop). No card, fill, or shadow.",
                })}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <FieldLabel>
                {safeT("admin_first_entry_size", {
                  fallbackKo: "배너 크기",
                  fallbackEn: "Banner size",
                })}
              </FieldLabel>
              <SelectField
                value={draft.sizePreset}
                onChange={(v) => patch({ sizePreset: v as ProductIntroSizePreset })}
                options={(PRODUCT_INTRO_SIZE_PRESETS as readonly ProductIntroSizePreset[]).map(
                  (value) => ({
                    value,
                    label:
                      value === "small"
                        ? safeT("admin_first_entry_size_small", {
                            fallbackKo: "작게",
                            fallbackEn: "Small",
                          })
                        : value === "medium"
                          ? safeT("admin_first_entry_size_medium", {
                              fallbackKo: "보통",
                              fallbackEn: "Medium",
                            })
                          : value === "large"
                            ? safeT("admin_first_entry_size_large", {
                                fallbackKo: "크게",
                                fallbackEn: "Large",
                              })
                            : safeT("admin_first_entry_size_max", {
                                fallbackKo: "화면 최대",
                                fallbackEn: "Maximum",
                              }),
                  })
                )}
              />
            </div>
            <div>
              <FieldLabel>
                {safeT("admin_first_entry_enter_motion", {
                  fallbackKo: "진입 효과",
                  fallbackEn: "Entrance effect",
                })}
              </FieldLabel>
              <SelectField
                value={draft.animationIn}
                onChange={(v) => patch({ animationIn: v as ProductIntroAnimIn })}
                options={(PRODUCT_INTRO_ANIM_IN as readonly ProductIntroAnimIn[]).map((value) => ({
                  value,
                  label:
                    value === "none"
                      ? safeT("admin_first_entry_motion_none", {
                          fallbackKo: "효과 없음",
                          fallbackEn: "None",
                        })
                      : value === "fade_in"
                        ? safeT("admin_first_entry_enter_fade", {
                            fallbackKo: "부드럽게 나타남",
                            fallbackEn: "Soft fade in",
                          })
                        : safeT("admin_first_entry_enter_fade_expand", {
                            fallbackKo: "살짝 펼쳐지며 나타남",
                            fallbackEn: "Soft expand in",
                          }),
                }))}
              />
            </div>
            <div>
              <FieldLabel>
                {safeT("admin_first_entry_exit_motion", {
                  fallbackKo: "종료 효과",
                  fallbackEn: "Exit effect",
                })}
              </FieldLabel>
              <SelectField
                value={draft.animationOut}
                onChange={(v) => patch({ animationOut: v as ProductIntroAnimOut })}
                options={(PRODUCT_INTRO_ANIM_OUT as readonly ProductIntroAnimOut[]).map((value) => ({
                  value,
                  label:
                    value === "none"
                      ? safeT("admin_first_entry_motion_none", {
                          fallbackKo: "효과 없음",
                          fallbackEn: "None",
                        })
                      : value === "fade_out"
                        ? safeT("admin_first_entry_exit_fade", {
                            fallbackKo: "부드럽게 사라짐",
                            fallbackEn: "Soft fade out",
                          })
                        : safeT("admin_first_entry_exit_expand_fade", {
                            fallbackKo: "펼쳐지며 사라짐",
                            fallbackEn: "Expand and fade out",
                          }),
                }))}
              />
            </div>
          </div>

          {/* V2: raw fit/cover/duration knobs remain removed — CONTAIN + no post-ready hold. */}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>
                {safeT("admin_first_entry_click", {
                  fallbackKo: "클릭 시",
                  fallbackEn: "On tap",
                })}
              </FieldLabel>
              <SelectField
                value={clickMode}
                onChange={(v) => setClick(v as ClickMode)}
                options={[
                  {
                    value: "none",
                    label: safeT("admin_first_entry_click_none", {
                      fallbackKo: "동작 없음",
                      fallbackEn: "No action",
                    }),
                  },
                  {
                    value: "navigate",
                    label: safeT("admin_first_entry_click_navigate", {
                      fallbackKo: "페이지 이동",
                      fallbackEn: "Go to page",
                    }),
                  },
                ]}
              />
            </div>
            {clickMode === "navigate" ? (
              <div>
                <FieldLabel>
                  {safeT("admin_first_entry_dest", {
                    fallbackKo: "이동 위치",
                    fallbackEn: "Destination",
                  })}
                </FieldLabel>
                <SelectField
                  value={destKind}
                  onChange={(v) => setClick("navigate", v as DestKind, draft.action.target)}
                  options={[
                    { value: "community", label: "커뮤니티" },
                    { value: "trade", label: "중고거래" },
                    { value: "food", label: "배달" },
                    { value: "chat", label: "채팅" },
                    { value: "my", label: "마이페이지" },
                    { value: "store", label: "매장" },
                    { value: "product", label: "상품" },
                    { value: "community_post", label: "커뮤니티 게시물" },
                    { value: "market_listing", label: "거래 글" },
                    { value: "delivery_category", label: "배달 카테고리" },
                    { value: "chat_room", label: "채팅방" },
                  ]}
                />
              </div>
            ) : null}
            {clickMode === "navigate" && needsTargetId(destKind) ? (
              <div className="sm:col-span-2">
                <FieldLabel>
                  {safeT("admin_first_entry_dest_id", {
                    fallbackKo: "대상 ID / 슬러그",
                    fallbackEn: "Target id / slug",
                  })}
                </FieldLabel>
                <TextInput
                  value={draft.action.target}
                  onChange={(e) => setClick("navigate", destKind, e.target.value)}
                  placeholder={
                    destKind === "product"
                      ? "store-slug/productId"
                      : destKind === "store"
                        ? "store-slug"
                        : "id"
                  }
                />
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>
                {safeT("admin_first_entry_starts", {
                  fallbackKo: "노출 시작",
                  fallbackEn: "Starts",
                })}
              </FieldLabel>
              <TextInput
                type="datetime-local"
                value={isoToLocalInput(draft.startsAt)}
                onChange={(e) => patch({ startsAt: localInputToIso(e.target.value) })}
              />
            </div>
            <div>
              <FieldLabel>
                {safeT("admin_first_entry_ends", {
                  fallbackKo: "노출 종료",
                  fallbackEn: "Ends",
                })}
              </FieldLabel>
              <TextInput
                type="datetime-local"
                value={isoToLocalInput(draft.endsAt)}
                onChange={(e) => patch({ endsAt: localInputToIso(e.target.value) })}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="sam-btn sam-btn-primary"
              disabled={!dirty || saving}
              onClick={() => void save()}
            >
              {saving
                ? safeT("common_loading", { fallbackKo: "저장 중…", fallbackEn: "Saving…" })
                : safeT("common_save", { fallbackKo: "저장", fallbackEn: "Save" })}
            </button>
            <button
              type="button"
              className="sam-btn sam-btn-secondary"
              onClick={() => setReplayKey((k) => k + 1)}
            >
              {safeT("admin_first_entry_preview", {
                fallbackKo: "미리보기",
                fallbackEn: "Preview",
              })}
            </button>
            {message ? <span className="sam-text-caption text-sam-muted">{message}</span> : null}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {(Object.keys(PRODUCT_INTRO_VIEWPORT_PRESETS) as ProductIntroViewportKind[]).map(
              (key) => (
                <button
                  key={key}
                  type="button"
                  className={`rounded-ui-rect px-2 py-1 sam-text-caption ${
                    previewViewport === key
                      ? "bg-sam-brand text-white"
                      : "border border-sam-border bg-sam-surface text-sam-fg"
                  }`}
                  onClick={() => {
                    setPreviewViewport(key);
                    setReplayKey((k) => k + 1);
                  }}
                >
                  {PRODUCT_INTRO_VIEWPORT_PRESETS[key].labelKo}
                </button>
              )
            )}
          </div>
          <FirstEntryPreview
            config={draft}
            replayKey={replayKey}
            viewport={previewViewport}
          />
        </div>
      </div>
    </div>
  );
}
