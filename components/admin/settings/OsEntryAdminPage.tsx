"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { OsEntryScreen } from "@/components/os-entry/OsEntryScreen";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { createBuiltInOsEntryConfig } from "@/lib/os-entry/defaults";
import { normalizeOsEntryConfig } from "@/lib/os-entry/normalize";
import type { OsEntryConfig } from "@/lib/os-entry/types";

type PreviewDevice = "phone" | "tablet" | "iphone" | "ipad";

const PREVIEW_SIZES: Record<PreviewDevice, { w: number; h: number }> = {
  phone: { w: 360, h: 740 },
  tablet: { w: 768, h: 1024 },
  iphone: { w: 430, h: 932 },
  ipad: { w: 820, h: 1180 },
};

export function OsEntryAdminPage() {
  const { safeT } = useI18n();
  const [draft, setDraft] = useState<OsEntryConfig>(() => createBuiltInOsEntryConfig());
  const [live, setLive] = useState<OsEntryConfig>(() => ({
    ...createBuiltInOsEntryConfig(),
    revision: 0,
  }));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>("phone");

  const reload = useCallback(async () => {
    const res = await fetch("/api/admin/os-entry", { credentials: "same-origin" });
    const json = (await res.json()) as {
      ok?: boolean;
      draft?: unknown;
      live?: unknown;
      error?: string;
    };
    if (!res.ok || !json.ok) {
      setMessage(json.error ?? "load_failed");
      return;
    }
    setDraft(normalizeOsEntryConfig(json.draft));
    setLive(normalizeOsEntryConfig(json.live));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await reload();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const patch = (partial: Partial<OsEntryConfig>) => {
    setDraft((prev) => normalizeOsEntryConfig({ ...prev, ...partial }));
  };

  const saveDraft = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/os-entry", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: draft }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        draft?: unknown;
        live?: unknown;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setMessage(json.error ?? "save_failed");
        return;
      }
      setDraft(normalizeOsEntryConfig(json.draft));
      if (json.live) setLive(normalizeOsEntryConfig(json.live));
      setMessage(
        safeT("admin_os_entry_save_ok", {
          fallbackKo: "DRAFT 저장됨 (LIVE 미변경)",
          fallbackEn: "DRAFT saved (LIVE unchanged)",
        })
      );
    } finally {
      setBusy(false);
    }
  };

  const serviceApply = async () => {
    setBusy(true);
    setMessage(null);
    try {
      // Persist draft first so Apply uses latest form values.
      const saveRes = await fetch("/api/admin/os-entry", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: draft }),
      });
      if (!saveRes.ok) {
        setMessage("save_before_apply_failed");
        return;
      }
      const res = await fetch("/api/admin/os-entry/apply", {
        method: "POST",
        credentials: "same-origin",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        live?: unknown;
        draft?: unknown;
        revision?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setMessage(json.error ?? "apply_failed");
        return;
      }
      if (json.live) setLive(normalizeOsEntryConfig(json.live));
      if (json.draft) setDraft(normalizeOsEntryConfig(json.draft));
      setMessage(
        safeT("admin_os_entry_apply_ok", {
          fallbackKo: `서비스 적용됨 · LIVE revision ${json.revision ?? "?"}`,
          fallbackEn: `Service applied · LIVE revision ${json.revision ?? "?"}`,
        })
      );
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async (file: File) => {
    setBusy(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/os-entry/upload-image", {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      const json = (await res.json()) as {
        ok?: boolean;
        draft?: unknown;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setMessage(json.error ?? "upload_failed");
        return;
      }
      setDraft(normalizeOsEntryConfig(json.draft));
      setMessage(
        safeT("admin_os_entry_upload_ok", {
          fallbackKo: "이미지 DRAFT에 반영됨 (SAVE/APPLY 필요)",
          fallbackEn: "Image on DRAFT (SAVE/APPLY still required)",
        })
      );
    } finally {
      setBusy(false);
    }
  };

  const removeImage = () => {
    patch({
      imageUrl: null,
      imageStoragePath: null,
      imageSha256: null,
      imageMimeType: null,
      imageByteLength: null,
    });
  };

  const preview = PREVIEW_SIZES[previewDevice];

  if (loading) {
    return <div className="p-4 text-sam-muted">…</div>;
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={safeT("admin_os_entry_title", {
          fallbackKo: "OS 시작 화면",
          fallbackEn: "OS start screen",
        })}
        description={safeT("admin_os_entry_desc", {
          fallbackKo:
            "OS 직후 제품 소유 시작 화면입니다. 진짜 Android/iOS OS Splash가 아닙니다. SAVE=DRAFT, 서비스 적용=LIVE.",
          fallbackEn:
            "Product-owned screen right after OS splash — not the real OS launch screen. SAVE=DRAFT, Service Apply=LIVE.",
        })}
      />

      <AdminCard>
        <p className="sam-text-body text-sam-muted">
          LIVE revision: <strong className="text-sam-fg">{live.revision}</strong>
          {" · "}
          LIVE bg: <span style={{ color: live.backgroundColor }}>{live.backgroundColor}</span>
          {" · "}
          LIVE text: {live.text || "(empty)"}
        </p>
        {message ? <p className="mt-2 sam-text-body text-sam-fg">{message}</p> : null}
      </AdminCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminCard>
          <h2 className="mb-3 sam-text-title font-semibold text-sam-fg">
            {safeT("admin_os_entry_edit", { fallbackKo: "편집 (DRAFT)", fallbackEn: "Edit (DRAFT)" })}
          </h2>

          <label className="mb-3 block sam-text-body text-sam-fg">
            Background
            <input
              type="color"
              className="ml-2 align-middle"
              value={draft.backgroundColor}
              onChange={(e) => patch({ backgroundColor: e.target.value })}
            />
            <input
              type="text"
              className="ml-2 rounded-ui-rect border border-sam-border px-2 py-1"
              value={draft.backgroundColor}
              onChange={(e) => patch({ backgroundColor: e.target.value })}
            />
          </label>

          <div className="mb-3 space-y-2">
            <div className="sam-text-body font-medium text-sam-fg">Image</div>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadImage(f);
              }}
            />
            <button type="button" className="sam-btn sam-btn-secondary" onClick={removeImage}>
              Remove image
            </button>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["imageX", "X"],
                  ["imageY", "Y"],
                  ["imageWidth", "Width"],
                  ["imageHeight", "Height"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="sam-text-helper text-sam-muted">
                  {label} (0–1)
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={1}
                    className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1 text-sam-fg"
                    value={draft[key]}
                    onChange={(e) => patch({ [key]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
            <p className="sam-text-helper text-sam-muted">Fit: CONTAIN (fixed)</p>
          </div>

          <div className="mb-3 space-y-2">
            <label className="block sam-text-body text-sam-fg">
              Text
              <textarea
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1"
                rows={2}
                value={draft.text}
                onChange={(e) => patch({ text: e.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["textX", "X"],
                  ["textY", "Y"],
                  ["textWidth", "Width"],
                  ["textSize", "Size"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="sam-text-helper text-sam-muted">
                  {label} (0–1)
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={1}
                    className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1 text-sam-fg"
                    value={draft[key]}
                    onChange={(e) => patch({ [key]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
            <label className="sam-text-helper text-sam-muted">
              Align
              <select
                className="ml-2 rounded-ui-rect border border-sam-border px-2 py-1 text-sam-fg"
                value={draft.textAlign}
                onChange={(e) =>
                  patch({ textAlign: e.target.value as OsEntryConfig["textAlign"] })
                }
              >
                <option value="left">left</option>
                <option value="center">center</option>
                <option value="right">right</option>
              </select>
            </label>
          </div>

          <label className="mb-4 block sam-text-body text-sam-fg">
            Minimum visible (ms)
            <input
              type="number"
              min={0}
              max={30000}
              className="ml-2 w-28 rounded-ui-rect border border-sam-border px-2 py-1"
              value={draft.minimumVisibleMs}
              onChange={(e) => patch({ minimumVisibleMs: Number(e.target.value) })}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="sam-btn sam-btn-secondary"
              disabled={busy}
              onClick={() => void saveDraft()}
            >
              SAVE (DRAFT)
            </button>
            <button
              type="button"
              className="sam-btn sam-btn-primary"
              disabled={busy}
              onClick={() => void serviceApply()}
            >
              Service Apply → LIVE
            </button>
          </div>
        </AdminCard>

        <AdminCard>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="sam-text-title font-semibold text-sam-fg">Preview (same renderer)</h2>
            {(Object.keys(PREVIEW_SIZES) as PreviewDevice[]).map((d) => (
              <button
                key={d}
                type="button"
                className={`rounded-ui-rect border px-2 py-1 sam-text-helper ${
                  previewDevice === d
                    ? "border-sam-primary text-sam-primary"
                    : "border-sam-border text-sam-muted"
                }`}
                onClick={() => setPreviewDevice(d)}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="overflow-auto rounded-ui-rect border border-sam-border">
            <OsEntryScreen
              config={draft}
              imageSrc={draft.imageUrl}
              previewWidth={preview.w}
              previewHeight={preview.h}
            />
          </div>
        </AdminCard>
      </div>
    </div>
  );
}
