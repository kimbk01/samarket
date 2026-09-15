"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  BUNDLED_PRODUCT_INTRO_CONFIG,
  PRODUCT_INTRO_ACTION_TYPES,
  PRODUCT_INTRO_ANIM_IN,
  PRODUCT_INTRO_ANIM_OUT,
  PRODUCT_INTRO_DISPLAY_MODES,
  PRODUCT_INTRO_OBJECT_FITS,
  PRODUCT_INTRO_SIZE_PRESETS,
  PRODUCT_INTRO_STATUSES,
  cssClassForProductIntroEnter,
  cssClassForProductIntroExit,
  isProductIntroDisplayEligible,
  normalizeProductIntroConfig,
  productIntroConfigEquals,
  productIntroImageWidthPercent,
  type ProductIntroConfig,
} from "@/lib/startup/product-intro";

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

function ProductIntroPreview({
  config,
  replayKey,
  playingExit,
}: {
  config: ProductIntroConfig;
  replayKey: number;
  playingExit: boolean;
}) {
  const media = config.media.mobileUrl;
  const enterClass = playingExit ? "" : cssClassForProductIntroEnter(config.animationIn);
  const exitClass = playingExit ? cssClassForProductIntroExit(config.animationOut) : "";
  const duration = playingExit ? config.exitDurationMs : config.enterDurationMs;
  const widthPct = productIntroImageWidthPercent(config);

  return (
    <div
      key={`${replayKey}-${playingExit ? "exit" : "enter"}`}
      className={`relative mx-auto flex h-[420px] w-[220px] flex-col items-center justify-center overflow-hidden rounded-[24px] border border-sam-border ${enterClass} ${exitClass}`}
      style={{
        background: config.backgroundColor,
        animationDuration: `${duration}ms`,
      }}
    >
      {media ? (
        <div
          className={
            config.displayMode === "card"
              ? "overflow-hidden bg-white shadow-sm"
              : "flex items-center justify-center"
          }
          style={{
            width: `${Math.min(config.displayMode === "card" ? 86 : widthPct, 92)}%`,
            borderRadius: config.displayMode === "card" ? config.cornerRadiusPx : 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={media}
            alt=""
            style={{
              width: "100%",
              maxHeight: 280,
              objectFit: config.objectFit,
              display: "block",
            }}
          />
        </div>
      ) : (
        <p className="sam-text-caption text-sam-muted px-4 text-center">No mobile image</p>
      )}
      <p className="absolute bottom-3 sam-text-caption text-sam-muted">
        {isProductIntroDisplayEligible(config) ? "Eligible (active+schedule)" : "Not eligible"}
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
  const [uploading, setUploading] = useState<"mobile" | "tablet" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [replayKey, setReplayKey] = useState(0);
  const [playingExit, setPlayingExit] = useState(false);
  const mobileRef = useRef<HTMLInputElement>(null);
  const tabletRef = useRef<HTMLInputElement>(null);

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

  const upload = useCallback(async (kind: "mobile" | "tablet", file: File) => {
    setUploading(kind);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.set("kind", kind === "mobile" ? "product" : "product_tablet");
      fd.set("file", file);
      const res = await fetch("/api/admin/startup-config/upload-image", {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !json.ok || !json.url) {
        setMessage(json.error ?? "upload_failed");
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
    } catch {
      setMessage("upload_failed");
    } finally {
      setUploading(null);
    }
  }, []);

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
      setMessage("saved");
    } catch {
      setMessage("save_failed");
    } finally {
      setSaving(false);
    }
  }, [draft]);

  if (loading) {
    return <p className="sam-text-body text-sam-muted">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="sam-text-title font-semibold text-sam-fg">
          {safeT("admin_product_intro_section_title", {
            fallbackKo: "첫 진입 인트로",
            fallbackEn: "First-entry Product Intro",
          })}
        </h2>
        <p className="mt-1 sam-text-body text-sam-muted">
          {safeT("admin_product_intro_section_help", {
            fallbackKo:
              "앱 준비(Technical Boot) 이후 사용자에게 보여 줄 운영/홍보 Intro입니다. 캐시된 Intro만 즉시 표시되며, 네트워크 대기로 진입을 막지 않습니다.",
            fallbackEn:
              "Shown after Technical Boot. Only cached eligible Intro appears immediately; network never blocks entry.",
          })}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_240px]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Status</FieldLabel>
              <SelectField
                value={draft.status}
                onChange={(v) => patch({ status: v as ProductIntroConfig["status"] })}
                options={PRODUCT_INTRO_STATUSES.map((v) => ({ value: v, label: v }))}
              />
            </div>
            <div>
              <FieldLabel>Name</FieldLabel>
              <TextInput
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Spring campaign"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Mobile image</FieldLabel>
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
              <button
                type="button"
                className="sam-btn sam-btn-secondary"
                disabled={uploading === "mobile"}
                onClick={() => mobileRef.current?.click()}
              >
                {uploading === "mobile" ? "Uploading…" : "Upload mobile"}
              </button>
              {draft.media.mobileUrl ? (
                <p className="mt-1 break-all sam-text-caption text-sam-muted">{draft.media.mobileUrl}</p>
              ) : null}
            </div>
            <div>
              <FieldLabel>Tablet image (optional)</FieldLabel>
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
                disabled={uploading === "tablet"}
                onClick={() => tabletRef.current?.click()}
              >
                {uploading === "tablet" ? "Uploading…" : "Upload tablet"}
              </button>
              {draft.media.tabletUrl ? (
                <p className="mt-1 break-all sam-text-caption text-sam-muted">{draft.media.tabletUrl}</p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Display</FieldLabel>
              <SelectField
                value={draft.displayMode}
                onChange={(v) => patch({ displayMode: v as ProductIntroConfig["displayMode"] })}
                options={PRODUCT_INTRO_DISPLAY_MODES.map((v) => ({ value: v, label: v }))}
              />
            </div>
            <div>
              <FieldLabel>Object fit</FieldLabel>
              <SelectField
                value={draft.objectFit}
                onChange={(v) => patch({ objectFit: v as ProductIntroConfig["objectFit"] })}
                options={PRODUCT_INTRO_OBJECT_FITS.map((v) => ({ value: v, label: v }))}
              />
            </div>
            <div>
              <FieldLabel>Size preset</FieldLabel>
              <SelectField
                value={draft.sizePreset}
                onChange={(v) => patch({ sizePreset: v as ProductIntroConfig["sizePreset"] })}
                options={PRODUCT_INTRO_SIZE_PRESETS.map((v) => ({ value: v, label: v }))}
              />
            </div>
            <div>
              <FieldLabel>Custom size % (optional)</FieldLabel>
              <TextInput
                type="number"
                min={40}
                max={100}
                value={draft.customSizePercent ?? ""}
                onChange={(e) =>
                  patch({
                    customSizePercent: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder="empty = preset"
              />
            </div>
            <div>
              <FieldLabel>Card radius (px)</FieldLabel>
              <TextInput
                type="number"
                min={0}
                max={48}
                value={draft.cornerRadiusPx}
                onChange={(e) => patch({ cornerRadiusPx: Number(e.target.value) })}
              />
            </div>
            <div>
              <FieldLabel>Background</FieldLabel>
              <TextInput
                value={draft.backgroundColor}
                onChange={(e) => patch({ backgroundColor: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Animation in</FieldLabel>
              <SelectField
                value={draft.animationIn}
                onChange={(v) => patch({ animationIn: v as ProductIntroConfig["animationIn"] })}
                options={PRODUCT_INTRO_ANIM_IN.map((v) => ({ value: v, label: v }))}
              />
            </div>
            <div>
              <FieldLabel>Animation out</FieldLabel>
              <SelectField
                value={draft.animationOut}
                onChange={(v) => patch({ animationOut: v as ProductIntroConfig["animationOut"] })}
                options={PRODUCT_INTRO_ANIM_OUT.map((v) => ({ value: v, label: v }))}
              />
            </div>
            <div>
              <FieldLabel>Enter ms</FieldLabel>
              <TextInput
                type="number"
                value={draft.enterDurationMs}
                onChange={(e) => patch({ enterDurationMs: Number(e.target.value) })}
              />
            </div>
            <div>
              <FieldLabel>Display ms</FieldLabel>
              <TextInput
                type="number"
                value={draft.displayDurationMs}
                onChange={(e) => patch({ displayDurationMs: Number(e.target.value) })}
              />
            </div>
            <div>
              <FieldLabel>Exit ms</FieldLabel>
              <TextInput
                type="number"
                value={draft.exitDurationMs}
                onChange={(e) => patch({ exitDurationMs: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Action type</FieldLabel>
              <SelectField
                value={draft.action.type}
                onChange={(v) =>
                  patch({
                    action: {
                      type: v as ProductIntroConfig["action"]["type"],
                      target: draft.action.target,
                    },
                  })
                }
                options={PRODUCT_INTRO_ACTION_TYPES.map((v) => ({ value: v, label: v }))}
              />
            </div>
            <div>
              <FieldLabel>Action target</FieldLabel>
              <TextInput
                value={draft.action.target}
                onChange={(e) =>
                  patch({ action: { type: draft.action.type, target: e.target.value } })
                }
                placeholder="community | store-slug | slug/productId | …"
                disabled={draft.action.type === "none"}
              />
            </div>
            <div>
              <FieldLabel>Starts at (ISO, optional)</FieldLabel>
              <TextInput
                value={draft.startsAt ?? ""}
                onChange={(e) => patch({ startsAt: e.target.value || null })}
                placeholder="2026-09-15T00:00:00.000Z"
              />
            </div>
            <div>
              <FieldLabel>Ends at (ISO, optional)</FieldLabel>
              <TextInput
                value={draft.endsAt ?? ""}
                onChange={(e) => patch({ endsAt: e.target.value || null })}
                placeholder="2026-09-30T00:00:00.000Z"
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
              {saving ? "Saving…" : "Save Product Intro"}
            </button>
            <button
              type="button"
              className="sam-btn sam-btn-secondary"
              onClick={() => {
                setPlayingExit(false);
                setReplayKey((k) => k + 1);
              }}
            >
              Preview enter
            </button>
            <button
              type="button"
              className="sam-btn sam-btn-secondary"
              onClick={() => {
                setPlayingExit(true);
                setReplayKey((k) => k + 1);
              }}
            >
              Preview exit
            </button>
            {message ? <span className="sam-text-caption text-sam-muted">{message}</span> : null}
          </div>
        </div>

        <ProductIntroPreview config={draft} replayKey={replayKey} playingExit={playingExit} />
      </div>
    </div>
  );
}
