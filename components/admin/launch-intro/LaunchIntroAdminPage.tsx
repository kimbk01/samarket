"use client";

/**
 * DIBAY Intro — Admin (contract §1, §3, §6, §7). SAVE = DRAFT, PUBLISH = immutable publication +
 * Live pointer. Pause / Resume / Unpublish / Reactivate follow the live state machine.
 * Preview uses the SAME renderer as the app (LaunchIntroSceneView).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { LaunchIntroSceneView } from "@/components/launch-intro/LaunchIntroSceneView";
import {
  emptyLaunchIntroDocument,
  normalizeLaunchIntroHex,
  type LaunchIntroDocument,
  type LaunchIntroImageRef,
  type LaunchIntroLiveState,
  type LaunchIntroScene,
} from "@/lib/launch-intro/document";

type Snapshot = {
  ok: true;
  draft: { id: string; document: LaunchIntroDocument; version: number; updated_at: string } | null;
  draftImageUrls: Record<string, string>;
  live: { publication_id: string | null; state: LaunchIntroLiveState; revision: number; updated_at: string };
  publications: Array<{ id: string; created_at: string; source_draft_version: number | null; document: LaunchIntroDocument }>;
  publicAssetBase: string;
};
type ApiError = { ok: false; error?: string };

const field = "w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg";

function PhonePreview({ scene, imageSrc, skipLabel }: { scene: LaunchIntroScene; imageSrc: string | null; skipLabel: string }) {
  return (
    <div className="mx-auto aspect-[9/19.5] w-[200px] overflow-hidden rounded-[24px] border border-sam-border">
      <LaunchIntroSceneView scene={scene} imageSrc={imageSrc} skipLabel={skipLabel} />
    </div>
  );
}

export function LaunchIntroAdminPage() {
  const { t } = useI18n();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [doc, setDoc] = useState<LaunchIntroDocument | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const apply = useCallback((json: Snapshot) => {
    setSnap(json);
    setDoc(json.draft?.document ?? null);
    setImageUrls((prev) => ({ ...prev, ...json.draftImageUrls }));
  }, []);

  const call = useCallback(
    async (url: string, init: RequestInit, okMessage: string) => {
      setBusy(true);
      setMessage(null);
      try {
        const res = await fetch(url, { credentials: "same-origin", ...init });
        const json = (await res.json()) as Snapshot | ApiError;
        if (json.ok) {
          apply(json);
          setMessage(okMessage);
        } else setMessage(t("admin_launch_intro_error", { error: json.error ?? String(res.status) }));
      } catch {
        setMessage(t("admin_launch_intro_error", { error: "network" }));
      } finally {
        setBusy(false);
      }
    },
    [apply, t]
  );

  useEffect(() => {
    void call("/api/admin/launch-intro", { method: "GET" }, "");
  }, [call]);

  const scene = doc?.scenes[0] ?? null;
  const dirty = useMemo(
    () => !!snap?.draft && JSON.stringify(doc) !== JSON.stringify(snap.draft.document),
    [doc, snap]
  );

  const patchScene = (patch: Partial<LaunchIntroScene>) => {
    if (!doc || !scene) return;
    setDoc({ ...doc, scenes: [{ ...scene, ...patch }] });
  };

  const save = (document: LaunchIntroDocument | null) =>
    call(
      "/api/admin/launch-intro",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: snap?.draft?.id ?? null, version: snap?.draft?.version ?? null, document }),
      },
      t("admin_launch_intro_saved")
    );

  const upload = async (file: File) => {
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/launch-intro/image", { method: "POST", credentials: "same-origin", body: form });
      const json = (await res.json()) as { ok: true; image: LaunchIntroImageRef; url: string | null } | ApiError;
      if (!json.ok) {
        setMessage(t("admin_launch_intro_error", { error: json.error ?? String(res.status) }));
        return;
      }
      if (json.url) setImageUrls((prev) => ({ ...prev, [json.image.sha256]: json.url! }));
      patchScene({ image: json.image });
    } catch {
      setMessage(t("admin_launch_intro_error", { error: "network" }));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const setState = (action: "pause" | "resume" | "unpublish" | "reactivate", publicationId?: string) =>
    call(
      "/api/admin/launch-intro/state",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, publicationId }) },
      t("admin_launch_intro_done")
    );

  const live = snap?.live;
  const stateLabel =
    live?.state === "active"
      ? t("admin_launch_intro_state_active")
      : live?.state === "paused"
        ? t("admin_launch_intro_state_paused")
        : t("admin_launch_intro_state_unpublished");

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t("admin_launch_intro_title")} description={t("admin_launch_intro_desc")} />
      <AdminCard>
        <p className="px-4 py-3.5 sam-text-body text-sam-fg sm:px-5">{t("admin_launch_intro_propagation_note")}</p>
      </AdminCard>

      {message ? (
        <p className="sam-text-body text-sam-fg" role="status">
          {message}
        </p>
      ) : null}

      {live ? (
        <AdminCard title={t("admin_launch_intro_live_title")}>
          <div className="space-y-3 px-4 py-4 sm:px-5">
            <p className="sam-text-body text-sam-fg">
              <span className="font-semibold">{stateLabel}</span>
              <span className="text-sam-muted">
                {" "}
                · {t("admin_launch_intro_revision")} {live.revision}
                {live.publication_id ? ` · ${t("admin_launch_intro_publication")} ${live.publication_id.slice(0, 8)}` : ""}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="sam-btn sam-btn--secondary" disabled={busy || live.state !== "active"} onClick={() => void setState("pause")}>
                {t("admin_launch_intro_pause")}
              </button>
              <button type="button" className="sam-btn sam-btn--secondary" disabled={busy || live.state !== "paused"} onClick={() => void setState("resume")}>
                {t("admin_launch_intro_resume")}
              </button>
              <button type="button" className="sam-btn sam-btn--secondary" disabled={busy || live.state === "unpublished"} onClick={() => void setState("unpublish")}>
                {t("admin_launch_intro_unpublish")}
              </button>
            </div>
            <div>
              <p className="mb-1 sam-text-body font-medium text-sam-fg">{t("admin_launch_intro_history_title")}</p>
              {snap?.publications.length ? (
                <ul className="space-y-1">
                  {snap.publications.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 sam-text-body-secondary text-sam-muted">
                      <span className="font-mono">
                        {p.id.slice(0, 8)} · {new Date(p.created_at).toLocaleString()}
                        {p.id === live.publication_id ? " · LIVE" : ""}
                      </span>
                      {p.id !== live.publication_id ? (
                        <button type="button" className="sam-btn sam-btn--secondary" disabled={busy} onClick={() => void setState("reactivate", p.id)}>
                          {t("admin_launch_intro_reactivate")}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sam-text-body-secondary text-sam-muted">{t("admin_launch_intro_history_empty")}</p>
              )}
            </div>
          </div>
        </AdminCard>
      ) : null}

      <AdminCard title={t("admin_launch_intro_draft_title")}>
        {!snap ? null : !doc || !scene ? (
          <div className="space-y-3 px-4 py-4 sm:px-5">
            <p className="sam-text-body text-sam-muted">{t("admin_launch_intro_no_draft")}</p>
            <button type="button" className="sam-btn sam-btn--primary" disabled={busy} onClick={() => void save(emptyLaunchIntroDocument())}>
              {t("admin_launch_intro_create")}
            </button>
          </div>
        ) : (
          <div className="grid gap-5 px-4 py-4 sm:px-5 md:grid-cols-[1fr_auto]">
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block sam-text-body font-medium text-sam-fg">{t("admin_launch_intro_background")}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-10 w-12 shrink-0 cursor-pointer rounded-ui-rect border border-sam-border"
                    value={scene.background}
                    onChange={(e) => patchScene({ background: e.target.value.toUpperCase() })}
                  />
                  <input
                    className={`${field} font-mono`}
                    defaultValue={scene.background}
                    key={scene.background}
                    maxLength={7}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => {
                      const hex = normalizeLaunchIntroHex(e.target.value);
                      if (hex) patchScene({ background: hex });
                    }}
                  />
                </div>
              </label>

              <div>
                <span className="mb-1 block sam-text-body font-medium text-sam-fg">{t("admin_launch_intro_image")}</span>
                <p className="mb-2 sam-text-body-secondary text-sam-muted">{t("admin_launch_intro_image_hint")}</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="sam-btn sam-btn--secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
                    {t("admin_launch_intro_upload")}
                  </button>
                  {scene.image ? (
                    <button type="button" className="sam-btn sam-btn--secondary" disabled={busy} onClick={() => patchScene({ image: null })}>
                      {t("admin_launch_intro_remove_image")}
                    </button>
                  ) : null}
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block sam-text-body font-medium text-sam-fg">{t("admin_launch_intro_text")}</span>
                <input
                  className={field}
                  maxLength={80}
                  value={scene.text?.value ?? ""}
                  onChange={(e) =>
                    patchScene({ text: { value: e.target.value, color: scene.text?.color ?? "#FFFFFF" } })
                  }
                />
              </label>
              <label className="block">
                <span className="mb-1 block sam-text-body font-medium text-sam-fg">{t("admin_launch_intro_text_color")}</span>
                <input
                  type="color"
                  className="h-10 w-12 cursor-pointer rounded-ui-rect border border-sam-border"
                  value={scene.text?.color ?? "#FFFFFF"}
                  onChange={(e) =>
                    patchScene({ text: { value: scene.text?.value ?? "", color: e.target.value.toUpperCase() } })
                  }
                />
              </label>
              <label className="block">
                <span className="mb-1 block sam-text-body font-medium text-sam-fg">{t("admin_launch_intro_cta_label")}</span>
                <input
                  className={field}
                  maxLength={24}
                  value={scene.cta?.label ?? ""}
                  onChange={(e) => patchScene({ cta: { label: e.target.value, path: scene.cta?.path ?? "" } })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block sam-text-body font-medium text-sam-fg">{t("admin_launch_intro_cta_path")}</span>
                <input
                  className={`${field} font-mono`}
                  maxLength={200}
                  placeholder="/"
                  value={scene.cta?.path ?? ""}
                  onChange={(e) => patchScene({ cta: { label: scene.cta?.label ?? "", path: e.target.value } })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block sam-text-body font-medium text-sam-fg">{t("admin_launch_intro_duration")}</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  step={0.5}
                  className={field}
                  value={scene.durationMs / 1000}
                  onChange={(e) => {
                    const sec = Number(e.target.value);
                    if (Number.isFinite(sec)) patchScene({ durationMs: Math.round(Math.min(10, Math.max(1, sec)) * 1000) });
                  }}
                />
              </label>

              {dirty ? <p className="sam-text-body-secondary text-sam-warning">{t("admin_launch_intro_unsaved")}</p> : null}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="sam-btn sam-btn--primary" disabled={busy || !dirty} onClick={() => void save(doc)}>
                  {t("admin_launch_intro_save")}
                </button>
                <button type="button" className="sam-btn sam-btn--secondary" disabled={busy || !dirty} onClick={() => setDoc(snap.draft?.document ?? null)}>
                  {t("admin_launch_intro_cancel")}
                </button>
                <button
                  type="button"
                  className="sam-btn sam-btn--primary"
                  disabled={busy || dirty || !snap.draft}
                  onClick={() =>
                    void call(
                      "/api/admin/launch-intro/publish",
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ draftId: snap.draft!.id, version: snap.draft!.version }),
                      },
                      t("admin_launch_intro_done")
                    )
                  }
                >
                  {t("admin_launch_intro_publish")}
                </button>
                <button
                  type="button"
                  className="sam-btn sam-btn--secondary"
                  disabled={busy || !snap.draft}
                  onClick={() => {
                    if (!window.confirm(t("admin_launch_intro_delete_confirm"))) return;
                    void call(`/api/admin/launch-intro?id=${snap.draft!.id}`, { method: "DELETE" }, t("admin_launch_intro_done"));
                  }}
                >
                  {t("admin_launch_intro_delete")}
                </button>
              </div>
            </div>
            <div>
              <p className="mb-2 text-center sam-text-body-secondary text-sam-muted">{t("admin_launch_intro_preview")}</p>
              <PhonePreview
                scene={scene}
                imageSrc={scene.image ? imageUrls[scene.image.sha256] ?? null : null}
                skipLabel={t("launch_intro_skip")}
              />
            </div>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
