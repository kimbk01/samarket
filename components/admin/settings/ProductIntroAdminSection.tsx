"use client";

/**
 * Admin FIRST ENTRY operational editor — single operator surface.
 * Runtime SSOT remains startup_product_intro_v1 (LKG / ProductIntroHost).
 * Does not expose Technical Boot / shellReady / LKG terminology.
 */

import type { InputHTMLAttributes, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  BUNDLED_PRODUCT_INTRO_CONFIG,
  PRODUCT_INTRO_ANIM_IN,
  cssClassForProductIntroEnter,
  isProductIntroDisplayEligible,
  normalizeProductIntroConfig,
  productIntroConfigEquals,
  productIntroImageWidthPercent,
  type ProductIntroAnimIn,
  type ProductIntroConfig,
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
  computeProductIntroLayoutBox,
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

type OperatorAnim = "none" | "fade" | "fade_scale" | "slide_up";
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

const OPERATOR_ANIMS: OperatorAnim[] = ["none", "fade", "fade_scale", "slide_up"];

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

function animOutFor(animIn: ProductIntroAnimIn): ProductIntroConfig["animationOut"] {
  if (animIn === "none") return "none";
  if (animIn === "fade_scale" || animIn === "scale") return "fade_scale";
  return "fade";
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
  const enterClass = cssClassForProductIntroEnter(config.animationIn);
  const widthPct = productIntroImageWidthPercent(config);
  const isPopup = config.displayMode === "card";
  const preset = PRODUCT_INTRO_VIEWPORT_PRESETS[viewport];
  const scale = Math.min(220 / preset.width, 420 / preset.height);
  const frameW = Math.round(preset.width * scale);
  const frameH = Math.round(preset.height * scale);
  const box = computeProductIntroLayoutBox({
    viewportWidth: preset.width,
    viewportHeight: preset.height,
    displayMode: config.displayMode,
    widthPercent: widthPct,
    objectFit: config.objectFit,
  });
  const surfaceW = Math.round(box.surfaceWidthPx * scale);
  const surfaceMaxH = Math.round(box.surfaceMaxHeightPx * scale);
  const safeInset = `${PRODUCT_INTRO_SAFE_ZONE_INSET_PCT}%`;

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
          <div
            className={`${enterClass} relative ${isPopup ? "overflow-hidden bg-white shadow-sm" : "flex items-center justify-center"}`}
            style={{
              width: isPopup ? surfaceW : `${Math.min(widthPct, 100)}%`,
              maxHeight: surfaceMaxH,
              borderRadius: isPopup ? Math.max(4, config.cornerRadiusPx * scale) : 0,
              animationDuration: `${config.enterDurationMs}ms`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={media}
              alt=""
              style={{
                width: "100%",
                maxHeight: surfaceMaxH,
                objectFit: box.objectFit,
                display: "block",
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
  const displaySeconds = Math.round(draft.displayDurationMs / 1000);

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

  const setAnim = useCallback(
    (anim: OperatorAnim) => {
      const animationIn = (PRODUCT_INTRO_ANIM_IN.includes(anim) ? anim : "fade") as ProductIntroAnimIn;
      patch({
        animationIn,
        animationOut: animOutFor(animationIn),
        enterDurationMs: animationIn === "none" ? 150 : 280,
        exitDurationMs: animationIn === "none" ? 150 : 220,
      });
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

  const isPopup = draft.displayMode === "card";
  const operatorAnim = (OPERATOR_ANIMS.includes(draft.animationIn as OperatorAnim)
    ? draft.animationIn
    : draft.animationIn === "scale"
      ? "fade_scale"
      : "fade") as OperatorAnim;

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
                {safeT("admin_first_entry_display_mode", {
                  fallbackKo: "표시 형태",
                  fallbackEn: "Display",
                })}
              </FieldLabel>
              <SelectField
                value={draft.displayMode}
                onChange={(v) =>
                  patch({
                    displayMode: v as ProductIntroConfig["displayMode"],
                    sizePreset: v === "fullscreen" ? "full" : draft.sizePreset === "full" ? "medium" : draft.sizePreset,
                  })
                }
                options={[
                  {
                    value: "fullscreen",
                    label: safeT("admin_first_entry_fullscreen", {
                      fallbackKo: "전체 화면",
                      fallbackEn: "Fullscreen",
                    }),
                  },
                  {
                    value: "card",
                    label: safeT("admin_first_entry_popup", {
                      fallbackKo: "팝업",
                      fallbackEn: "Popup",
                    }),
                  },
                ]}
              />
            </div>
            <div>
              <FieldLabel>
                {safeT("admin_first_entry_fit", {
                  fallbackKo: "이미지 맞춤",
                  fallbackEn: "Image fit",
                })}
              </FieldLabel>
              <SelectField
                value={draft.objectFit}
                onChange={(v) => patch({ objectFit: v as ProductIntroConfig["objectFit"] })}
                options={[
                  {
                    value: "contain",
                    label: safeT("admin_first_entry_fit_contain", {
                      fallbackKo: "화면에 맞춤",
                      fallbackEn: "Fit",
                    }),
                  },
                  {
                    value: "cover",
                    label: safeT("admin_first_entry_fit_cover", {
                      fallbackKo: "화면 채우기",
                      fallbackEn: "Fill",
                    }),
                  },
                ]}
              />
            </div>
            {isPopup ? (
              <>
                <div>
                  <FieldLabel>
                    {safeT("admin_first_entry_popup_size", {
                      fallbackKo: "팝업 크기",
                      fallbackEn: "Popup size",
                    })}
                  </FieldLabel>
                  <SelectField
                    value={draft.sizePreset === "full" ? "large" : draft.sizePreset}
                    onChange={(v) =>
                      patch({
                        sizePreset: v as ProductIntroConfig["sizePreset"],
                        customSizePercent: null,
                      })
                    }
                    options={[
                      { value: "small", label: "Small" },
                      { value: "medium", label: "Medium" },
                      { value: "large", label: "Large" },
                    ]}
                  />
                </div>
                <div>
                  <FieldLabel>
                    {safeT("admin_first_entry_radius", {
                      fallbackKo: "모서리",
                      fallbackEn: "Corner radius",
                    })}
                  </FieldLabel>
                  <SelectField
                    value={String(
                      draft.cornerRadiusPx <= 8
                        ? 8
                        : draft.cornerRadiusPx <= 16
                          ? 16
                          : draft.cornerRadiusPx <= 24
                            ? 24
                            : 32
                    )}
                    onChange={(v) => patch({ cornerRadiusPx: Number(v) })}
                    options={[
                      { value: "8", label: "8px" },
                      { value: "16", label: "16px" },
                      { value: "24", label: "24px" },
                      { value: "32", label: "32px" },
                    ]}
                  />
                </div>
              </>
            ) : null}
            <div>
              <FieldLabel>
                {safeT("admin_first_entry_min_display", {
                  fallbackKo: "최소 노출 시간 (초)",
                  fallbackEn: "Minimum display (sec)",
                })}
              </FieldLabel>
              <TextInput
                type="number"
                min={0}
                max={8}
                step={1}
                value={displaySeconds}
                onChange={(e) => {
                  const sec = Math.min(8, Math.max(0, Number(e.target.value) || 0));
                  patch({ displayDurationMs: sec * 1000 });
                }}
              />
              <p className="mt-1 sam-text-caption text-sam-muted">
                {safeT("admin_first_entry_min_display_help", {
                  fallbackKo:
                    "기본 0초: 앱이 준비되면 바로 닫힙니다. 부팅을 일부러 늘리지 않습니다. 캠페인용으로만 초를 올리세요.",
                  fallbackEn:
                    "Default 0: closes as soon as the app is ready. Does not extend boot. Raise only for intentional campaign hold.",
                })}
              </p>
            </div>
            <div>
              <FieldLabel>
                {safeT("admin_first_entry_animation", {
                  fallbackKo: "화면 전환",
                  fallbackEn: "Transition",
                })}
              </FieldLabel>
              <SelectField
                value={operatorAnim}
                onChange={(v) => setAnim(v as OperatorAnim)}
                options={[
                  {
                    value: "none",
                    label: safeT("admin_first_entry_anim_none", {
                      fallbackKo: "없음",
                      fallbackEn: "None",
                    }),
                  },
                  {
                    value: "fade",
                    label: safeT("admin_first_entry_anim_fade", {
                      fallbackKo: "페이드",
                      fallbackEn: "Fade",
                    }),
                  },
                  {
                    value: "fade_scale",
                    label: safeT("admin_first_entry_anim_fade_scale", {
                      fallbackKo: "확대 페이드",
                      fallbackEn: "Fade + scale",
                    }),
                  },
                  {
                    value: "slide_up",
                    label: safeT("admin_first_entry_anim_slide", {
                      fallbackKo: "아래에서 등장",
                      fallbackEn: "Slide up",
                    }),
                  },
                ]}
              />
            </div>
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
            </div>
          </div>

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
