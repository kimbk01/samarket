"use client";

/**
 * DIBAY Intro — Admin (contract §1, §3, §6, §7; expansion P1). SAVE = DRAFT, PUBLISH = immutable
 * publication + Live pointer. Pause / Resume / Unpublish / Reactivate follow the live state machine.
 * Editor: scene list + per-scene form. Preview renders the SAME document through the SAME Player as
 * the app, inside fixed device-sized boxes (Phone / Android Tablet / iPad). The box is only a size:
 * no DeviceClass decision is made here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { LaunchIntroPlayer } from "@/components/launch-intro/LaunchIntroPlayer";
import { dibayConfirm } from "@/components/ui/dibay-overlay/DibayAppDialogProvider";
import {
  LAUNCH_INTRO_CTA_LABEL_MAX,
  LAUNCH_INTRO_CTA_PATH_MAX,
  LAUNCH_INTRO_DURATION_MAX_MS,
  LAUNCH_INTRO_DURATION_MIN_MS,
  LAUNCH_INTRO_HEADLINE_MAX,
  LAUNCH_INTRO_MAX_SCENES,
  LAUNCH_INTRO_SUPPORTING_MAX,
  LAUNCH_INTRO_TEXT_SIZES,
  emptyLaunchIntroDocument,
  emptyLaunchIntroScene,
  newLaunchIntroSceneId,
  normalizeLaunchIntroHex,
  LAUNCH_INTRO_DECORATION_SLOTS,
  LAUNCH_INTRO_ENTER_MOTIONS,
  LAUNCH_INTRO_LAYOUTS,
  LAUNCH_INTRO_MAX_DECORATIONS,
  LAUNCH_INTRO_TRANSITIONS,
  type LaunchIntroDecorationSlot,
  type LaunchIntroDocument,
  type LaunchIntroFit,
  type LaunchIntroImageRef,
  type LaunchIntroLiveState,
  type LaunchIntroScene,
  type LaunchIntroSceneText,
  type LaunchIntroTextStyle,
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
type UploadTarget =
  | { kind: "media" }
  | { kind: "background" }
  | { kind: "logo" }
  | { kind: "decoration"; slot: LaunchIntroDecorationSlot };

const field = "w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg";
const label = "mb-1 block sam-text-body font-medium text-sam-fg";

/** Preview boxes in CSS px (portrait). The Player lays out in container units, so the scaled box = the device. */
const PREVIEW_DEVICES = {
  phone: { w: 390, h: 844, rotatable: false },
  android_tablet: { w: 800, h: 1280, rotatable: true },
  ipad: { w: 820, h: 1180, rotatable: true },
} as const;
type PreviewDevice = keyof typeof PREVIEW_DEVICES;
const SLOT_LABEL = {
  "top-left": "admin_launch_intro_slot_top_left",
  "top-right": "admin_launch_intro_slot_top_right",
  "bottom-left": "admin_launch_intro_slot_bottom_left",
  "bottom-right": "admin_launch_intro_slot_bottom_right",
} as const satisfies Record<LaunchIntroDecorationSlot, string>;
const ENTER_LABEL = {
  none: "admin_launch_intro_enter_none",
  fade: "admin_launch_intro_enter_fade",
  "slide-up": "admin_launch_intro_enter_slide_up",
  scale: "admin_launch_intro_enter_scale",
} as const satisfies Record<LaunchIntroScene["motion"]["enter"], string>;
const PREVIEW_MAX_W = 300;
const PREVIEW_MAX_H = 560;

function defaultTextStyle(kind: "headline" | "supporting", value: string): LaunchIntroTextStyle {
  return kind === "headline"
    ? { value, size: "L", weight: "bold", color: "#FFFFFF" }
    : { value, size: "M", weight: "regular", color: "#FFFFFF" };
}

function FitSelect({ value, onChange }: { value: LaunchIntroFit; onChange: (fit: LaunchIntroFit) => void }) {
  const { t } = useI18n();
  return (
    <select className={`${field} w-auto`} value={value} onChange={(e) => onChange(e.target.value as LaunchIntroFit)}>
      <option value="contain">{t("admin_launch_intro_fit_contain")}</option>
      <option value="cover">{t("admin_launch_intro_fit_cover")}</option>
    </select>
  );
}

function TextStyleEditor({
  title,
  kind,
  style,
  max,
  onChange,
}: {
  title: string;
  kind: "headline" | "supporting";
  style: LaunchIntroTextStyle | null;
  max: number;
  onChange: (next: LaunchIntroTextStyle | null) => void;
}) {
  const { t } = useI18n();
  const cur = style ?? defaultTextStyle(kind, "");
  const set = (patch: Partial<LaunchIntroTextStyle>) => {
    const next = { ...cur, ...patch };
    onChange(next.value ? next : null);
  };
  return (
    <div className="space-y-2">
      <span className={label}>
        {title} <span className="sam-text-body-secondary text-sam-muted">({cur.value.length}/{max})</span>
      </span>
      <textarea className={field} rows={kind === "headline" ? 2 : 3} maxLength={max} value={cur.value} onChange={(e) => set({ value: e.target.value })} />
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${field} w-auto`} aria-label={t("admin_launch_intro_text_size")} value={cur.size} onChange={(e) => set({ size: e.target.value as LaunchIntroTextStyle["size"] })}>
          {LAUNCH_INTRO_TEXT_SIZES.map((sz) => (
            <option key={sz} value={sz}>
              {t("admin_launch_intro_text_size")} {sz}
            </option>
          ))}
        </select>
        <select className={`${field} w-auto`} aria-label={t("admin_launch_intro_text_weight")} value={cur.weight} onChange={(e) => set({ weight: e.target.value as LaunchIntroTextStyle["weight"] })}>
          <option value="regular">{t("admin_launch_intro_weight_regular")}</option>
          <option value="bold">{t("admin_launch_intro_weight_bold")}</option>
        </select>
        <input type="color" aria-label={t("admin_launch_intro_text_color")} className="h-10 w-12 cursor-pointer rounded-ui-rect border border-sam-border" value={cur.color} onChange={(e) => set({ color: e.target.value.toUpperCase() })} />
      </div>
    </div>
  );
}

function DevicePreview({
  doc,
  sceneIndex,
  playing,
  imageUrls,
  device,
  landscape,
  onSceneIndexChange,
  onStop,
  onNotice,
}: {
  doc: LaunchIntroDocument;
  sceneIndex: number;
  playing: boolean;
  imageUrls: Record<string, string>;
  device: PreviewDevice;
  landscape: boolean;
  onSceneIndexChange: (i: number) => void;
  onStop: () => void;
  onNotice: (text: string) => void;
}) {
  const { t } = useI18n();
  const spec = PREVIEW_DEVICES[device];
  const w = landscape && spec.rotatable ? spec.h : spec.w;
  const h = landscape && spec.rotatable ? spec.w : spec.h;
  const scale = Math.min(PREVIEW_MAX_W / w, PREVIEW_MAX_H / h);
  return (
    <div className="mx-auto overflow-hidden rounded-[20px] border border-sam-border" style={{ width: w * scale, height: h * scale }}>
      <div style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <LaunchIntroPlayer
          document={doc}
          resolveImage={(sha) => imageUrls[sha] ?? null}
          skipLabel={t("launch_intro_skip")}
          running={playing}
          sceneIndex={sceneIndex}
          onSceneIndexChange={onSceneIndexChange}
          onComplete={() => {
            onStop();
            onNotice(t("admin_launch_intro_preview_ended"));
          }}
          onRoute={(path) => {
            onStop();
            onNotice(t("admin_launch_intro_preview_route", { path }));
          }}
          onSkip={() => {
            onStop();
            onNotice(t("admin_launch_intro_preview_ended"));
          }}
          interactive={playing}
        />
      </div>
    </div>
  );
}

export function LaunchIntroAdminPage() {
  const { t } = useI18n();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [doc, setDoc] = useState<LaunchIntroDocument | null>(null);
  const [selected, setSelected] = useState(0);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [device, setDevice] = useState<PreviewDevice>("phone");
  const [landscape, setLandscape] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  /** Where the next uploaded image goes (one hidden file input for every image slot). */
  const uploadTarget = useRef<UploadTarget>({ kind: "media" });

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

  const sceneCount = doc?.scenes.length ?? 0;
  const sel = Math.min(selected, Math.max(sceneCount - 1, 0));
  const scene = doc?.scenes[sel] ?? null;
  const dirty = useMemo(
    () => !!snap?.draft && JSON.stringify(doc) !== JSON.stringify(snap.draft.document),
    [doc, snap]
  );

  // The static preview follows the selected scene; playback runs the whole document from scene 1.
  useEffect(() => {
    if (!playing) setPreviewIndex(sel);
  }, [sel, playing]);

  const setScenes = (scenes: LaunchIntroScene[], nextSelected: number) => {
    if (!doc) return;
    setPlaying(false);
    setDoc({ ...doc, scenes });
    setSelected(nextSelected);
  };
  const patchSceneAt = (index: number, fn: (s: LaunchIntroScene) => LaunchIntroScene) =>
    setDoc((d) => (d ? { ...d, scenes: d.scenes.map((s, i) => (i === index ? fn(s) : s)) } : d));
  const patchScene = (patch: Partial<LaunchIntroScene>) => patchSceneAt(sel, (s) => ({ ...s, ...patch }));
  const pickImage = (target: UploadTarget) => {
    uploadTarget.current = target;
    fileRef.current?.click();
  };
  const patchText = (patch: Partial<LaunchIntroSceneText>) => {
    if (!scene) return;
    const cur: LaunchIntroSceneText = scene.text ?? { headline: null, supporting: null, align: "center" };
    const next = { ...cur, ...patch };
    patchScene({ text: next.headline || next.supporting ? next : null });
  };
  const addScene = () => {
    if (!doc || sceneCount >= LAUNCH_INTRO_MAX_SCENES) return;
    const id = newLaunchIntroSceneId(doc.scenes.map((s) => s.id));
    const base = emptyLaunchIntroScene(id);
    base.background = { color: scene?.background.color ?? base.background.color, media: null };
    setScenes([...doc.scenes, base], sceneCount);
  };
  const duplicateScene = () => {
    if (!doc || !scene || sceneCount >= LAUNCH_INTRO_MAX_SCENES) return;
    const copy: LaunchIntroScene = { ...structuredClone(scene), id: newLaunchIntroSceneId(doc.scenes.map((s) => s.id)) };
    const scenes = [...doc.scenes];
    scenes.splice(sel + 1, 0, copy);
    setScenes(scenes, sel + 1);
  };
  const moveScene = (dir: -1 | 1) => {
    if (!doc) return;
    const to = sel + dir;
    if (to < 0 || to >= sceneCount) return;
    const scenes = [...doc.scenes];
    [scenes[sel], scenes[to]] = [scenes[to], scenes[sel]];
    setScenes(scenes, to);
  };
  const removeScene = () => {
    if (!doc || sceneCount <= 1) return;
    setScenes(doc.scenes.filter((_, i) => i !== sel), Math.max(0, sel - 1));
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
    const target = uploadTarget.current;
    const index = sel;
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
      const asset = json.image;
      patchSceneAt(index, (s) => {
        if (target.kind === "media") return { ...s, media: { asset, fit: s.media?.fit ?? "contain" } };
        if (target.kind === "background") return { ...s, background: { ...s.background, media: { asset, fit: s.background.media?.fit ?? "cover" } } };
        if (target.kind === "logo") return { ...s, logo: { asset } };
        const rest = s.decorations.filter((d) => d.slot !== target.slot);
        return { ...s, decorations: [...rest, { asset, slot: target.slot, size: "M" }] };
      });
    } catch {
      setMessage(t("admin_launch_intro_error", { error: "network" }));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const publish = async () => {
    if (!snap?.draft) return;
    const ok = await dibayConfirm({
      title: t("admin_launch_intro_publish_confirm"),
      description: t("admin_launch_intro_publish_confirm_desc"),
      confirmLabel: t("admin_launch_intro_publish"),
    });
    if (!ok) return;
    await call(
      "/api/admin/launch-intro/publish",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: snap.draft.id, version: snap.draft.version }),
      },
      t("admin_launch_intro_done")
    );
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
  const isLast = sel === sceneCount - 1;
  const ctaType = scene?.cta?.action.type ?? "none";

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
          <div className="grid gap-5 px-4 py-4 sm:px-5 lg:grid-cols-[180px_1fr_auto]">
            {/* Scene list */}
            <div className="space-y-2">
              <p className={label}>{t("admin_launch_intro_scenes")}</p>
              <ol className="space-y-1">
                {doc.scenes.map((s, i) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPlaying(false);
                        setSelected(i);
                      }}
                      className={`w-full rounded-ui-rect border px-3 py-2 text-left sam-text-body ${i === sel ? "border-sam-primary-border bg-sam-primary-soft font-semibold text-sam-fg" : "border-sam-border text-sam-fg"}`}
                    >
                      {t("admin_launch_intro_scene_n", { n: String(i + 1) })}
                      <span className="block truncate sam-text-body-secondary text-sam-muted">
                        {s.text?.headline?.value ?? s.text?.supporting?.value ?? (s.media || s.logo ? "🖼" : "—")}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              <button type="button" className="sam-btn sam-btn--secondary w-full" disabled={busy || sceneCount >= LAUNCH_INTRO_MAX_SCENES} onClick={addScene}>
                {t("admin_launch_intro_scene_add")}
              </button>
              {sceneCount >= LAUNCH_INTRO_MAX_SCENES ? (
                <p className="sam-text-body-secondary text-sam-muted">{t("admin_launch_intro_scene_max", { n: String(LAUNCH_INTRO_MAX_SCENES) })}</p>
              ) : null}
              <div className="flex flex-wrap gap-1">
                <button type="button" className="sam-btn sam-btn--secondary" disabled={busy || sel === 0} onClick={() => moveScene(-1)}>
                  {t("admin_launch_intro_scene_up")}
                </button>
                <button type="button" className="sam-btn sam-btn--secondary" disabled={busy || isLast} onClick={() => moveScene(1)}>
                  {t("admin_launch_intro_scene_down")}
                </button>
                <button type="button" className="sam-btn sam-btn--secondary" disabled={busy || sceneCount >= LAUNCH_INTRO_MAX_SCENES} onClick={duplicateScene}>
                  {t("admin_launch_intro_scene_duplicate")}
                </button>
                <button type="button" className="sam-btn sam-btn--secondary" disabled={busy || sceneCount <= 1} onClick={removeScene}>
                  {t("admin_launch_intro_scene_remove")}
                </button>
              </div>
              <label className="flex items-center gap-2 pt-2 sam-text-body text-sam-fg">
                <input
                  type="checkbox"
                  checked={doc.settings.skip.enabled}
                  onChange={(e) => setDoc({ ...doc, settings: { skip: { enabled: e.target.checked } } })}
                />
                {t("admin_launch_intro_skip_enabled")}
              </label>
            </div>

            {/* Selected scene */}
            <div className="space-y-4">
              <p className="sam-text-body font-semibold text-sam-fg">{t("admin_launch_intro_scene_n", { n: String(sel + 1) })}</p>
              <label className="block">
                <span className={label}>{t("admin_launch_intro_background")}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-10 w-12 shrink-0 cursor-pointer rounded-ui-rect border border-sam-border"
                    value={scene.background.color}
                    onChange={(e) => patchScene({ background: { ...scene.background, color: e.target.value.toUpperCase() } })}
                  />
                  <input
                    className={`${field} font-mono`}
                    defaultValue={scene.background.color}
                    key={`${scene.id}-${scene.background.color}`}
                    maxLength={7}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => {
                      const hex = normalizeLaunchIntroHex(e.target.value);
                      if (hex) patchScene({ background: { ...scene.background, color: hex } });
                    }}
                  />
                </div>
              </label>

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

              <label className="block">
                <span className={label}>{t("admin_launch_intro_layout")}</span>
                <select className={`${field} w-auto`} value={scene.layout} onChange={(e) => patchScene({ layout: e.target.value as LaunchIntroScene["layout"] })}>
                  {LAUNCH_INTRO_LAYOUTS.map((l) => (
                    <option key={l} value={l}>
                      {t(`admin_launch_intro_layout_${l}` as const)}
                    </option>
                  ))}
                </select>
                {scene.layout === "logo" && !scene.logo ? (
                  <p className="mt-1 sam-text-body-secondary text-sam-warning">{t("admin_launch_intro_layout_logo_needs_logo")}</p>
                ) : null}
              </label>

              <div>
                <span className={label}>{t("admin_launch_intro_image")}</span>
                <p className="mb-2 sam-text-body-secondary text-sam-muted">{t("admin_launch_intro_image_hint")}</p>
                {scene.layout === "logo" ? (
                  <p className="mb-2 sam-text-body-secondary text-sam-muted">{t("admin_launch_intro_image_logo_layout_note")}</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="sam-btn sam-btn--secondary" disabled={busy} onClick={() => pickImage({ kind: "media" })}>
                    {t("admin_launch_intro_upload")}
                  </button>
                  {scene.media ? (
                    <>
                      <FitSelect value={scene.media.fit} onChange={(fit) => patchScene({ media: { ...scene.media!, fit } })} />
                      <button type="button" className="sam-btn sam-btn--secondary" disabled={busy} onClick={() => patchScene({ media: null })}>
                        {t("admin_launch_intro_remove_image")}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div>
                <span className={label}>{t("admin_launch_intro_logo")}</span>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="sam-btn sam-btn--secondary" disabled={busy} onClick={() => pickImage({ kind: "logo" })}>
                    {t("admin_launch_intro_upload")}
                  </button>
                  {scene.logo ? (
                    <button type="button" className="sam-btn sam-btn--secondary" disabled={busy} onClick={() => patchScene({ logo: null })}>
                      {t("admin_launch_intro_remove_image")}
                    </button>
                  ) : null}
                </div>
              </div>

              <div>
                <span className={label}>{t("admin_launch_intro_background_image")}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="sam-btn sam-btn--secondary" disabled={busy} onClick={() => pickImage({ kind: "background" })}>
                    {t("admin_launch_intro_upload")}
                  </button>
                  {scene.background.media ? (
                    <>
                      <FitSelect
                        value={scene.background.media.fit}
                        onChange={(fit) => patchScene({ background: { ...scene.background, media: { ...scene.background.media!, fit } } })}
                      />
                      <button type="button" className="sam-btn sam-btn--secondary" disabled={busy} onClick={() => patchScene({ background: { ...scene.background, media: null } })}>
                        {t("admin_launch_intro_remove_image")}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              <div>
                <span className={label}>{t("admin_launch_intro_decorations")}</span>
                <p className="mb-2 sam-text-body-secondary text-sam-muted">{t("admin_launch_intro_decorations_hint", { n: String(LAUNCH_INTRO_MAX_DECORATIONS) })}</p>
                <div className="space-y-2">
                  {LAUNCH_INTRO_DECORATION_SLOTS.map((slot) => {
                    const deco = scene.decorations.find((d) => d.slot === slot);
                    const full = !deco && scene.decorations.length >= LAUNCH_INTRO_MAX_DECORATIONS;
                    return (
                      <div key={slot} className="flex flex-wrap items-center gap-2">
                        <span className="w-24 sam-text-body-secondary text-sam-muted">{t(SLOT_LABEL[slot])}</span>
                        <button type="button" className="sam-btn sam-btn--secondary" disabled={busy || full} onClick={() => pickImage({ kind: "decoration", slot })}>
                          {t("admin_launch_intro_upload")}
                        </button>
                        {deco ? (
                          <>
                            <select
                              className={`${field} w-auto`}
                              value={deco.size}
                              onChange={(e) =>
                                patchScene({ decorations: scene.decorations.map((d) => (d.slot === slot ? { ...d, size: e.target.value as "S" | "M" } : d)) })
                              }
                            >
                              <option value="S">{t("admin_launch_intro_text_size")} S</option>
                              <option value="M">{t("admin_launch_intro_text_size")} M</option>
                            </select>
                            <button type="button" className="sam-btn sam-btn--secondary" disabled={busy} onClick={() => patchScene({ decorations: scene.decorations.filter((d) => d.slot !== slot) })}>
                              {t("admin_launch_intro_remove_image")}
                            </button>
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <span className={label}>{t("admin_launch_intro_motion")}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className={`${field} w-auto`}
                    aria-label={t("admin_launch_intro_motion_enter")}
                    value={scene.motion.enter}
                    onChange={(e) => patchScene({ motion: { ...scene.motion, enter: e.target.value as LaunchIntroScene["motion"]["enter"] } })}
                  >
                    {LAUNCH_INTRO_ENTER_MOTIONS.map((m) => (
                      <option key={m} value={m}>
                        {t("admin_launch_intro_motion_enter")}: {t(ENTER_LABEL[m])}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 sam-text-body text-sam-fg">
                    <input type="checkbox" checked={scene.motion.float} onChange={(e) => patchScene({ motion: { ...scene.motion, float: e.target.checked } })} />
                    {t("admin_launch_intro_motion_float")}
                  </label>
                </div>
                <select
                  className={`${field} w-auto`}
                  aria-label={t("admin_launch_intro_transition")}
                  disabled={sel === 0}
                  value={scene.transition}
                  onChange={(e) => patchScene({ transition: e.target.value as LaunchIntroScene["transition"] })}
                >
                  {LAUNCH_INTRO_TRANSITIONS.map((tr) => (
                    <option key={tr} value={tr}>
                      {t("admin_launch_intro_transition")}: {t(`admin_launch_intro_transition_${tr}` as const)}
                    </option>
                  ))}
                </select>
                {sel === 0 ? <p className="sam-text-body-secondary text-sam-muted">{t("admin_launch_intro_first_scene_motion_note")}</p> : null}
              </div>

              <p className="sam-text-body-secondary text-sam-muted">{t("admin_launch_intro_text_hint")}</p>
              <TextStyleEditor
                key={`${scene.id}-h`}
                title={t("admin_launch_intro_headline")}
                kind="headline"
                style={scene.text?.headline ?? null}
                max={LAUNCH_INTRO_HEADLINE_MAX}
                onChange={(headline) => patchText({ headline })}
              />
              <TextStyleEditor
                key={`${scene.id}-s`}
                title={t("admin_launch_intro_supporting")}
                kind="supporting"
                style={scene.text?.supporting ?? null}
                max={LAUNCH_INTRO_SUPPORTING_MAX}
                onChange={(supporting) => patchText({ supporting })}
              />
              <label className="block">
                <span className={label}>{t("admin_launch_intro_align")}</span>
                <select className={`${field} w-auto`} value={scene.text?.align ?? "center"} onChange={(e) => patchText({ align: e.target.value as LaunchIntroSceneText["align"] })}>
                  <option value="center">{t("admin_launch_intro_align_center")}</option>
                  <option value="left">{t("admin_launch_intro_align_left")}</option>
                </select>
              </label>

              <div className="space-y-2">
                <span className={label}>{t("admin_launch_intro_cta_action")}</span>
                <select
                  className={`${field} w-auto`}
                  value={ctaType}
                  onChange={(e) => {
                    const v = e.target.value;
                    const lbl = scene.cta?.label ?? "";
                    if (v === "none") patchScene({ cta: null });
                    else if (v === "next") patchScene({ cta: { label: lbl, action: { type: "next" } } });
                    else patchScene({ cta: { label: lbl, action: { type: "route", path: scene.cta?.action.type === "route" ? scene.cta.action.path : "/" } } });
                  }}
                >
                  <option value="none">{t("admin_launch_intro_cta_none")}</option>
                  <option value="route">{t("admin_launch_intro_cta_route")}</option>
                  <option value="next" disabled={isLast}>
                    {t("admin_launch_intro_cta_next")}
                  </option>
                </select>
                {ctaType === "next" && isLast ? (
                  <p className="sam-text-body-secondary text-sam-warning">{t("admin_launch_intro_cta_next_last")}</p>
                ) : null}
                {scene.cta ? (
                  <label className="block">
                    <span className={label}>{t("admin_launch_intro_cta_label")}</span>
                    <input
                      className={field}
                      maxLength={LAUNCH_INTRO_CTA_LABEL_MAX}
                      value={scene.cta.label}
                      onChange={(e) => patchScene({ cta: { ...scene.cta!, label: e.target.value } })}
                    />
                  </label>
                ) : null}
                {scene.cta?.action.type === "route" ? (
                  <label className="block">
                    <span className={label}>{t("admin_launch_intro_cta_path")}</span>
                    <input
                      className={`${field} font-mono`}
                      maxLength={LAUNCH_INTRO_CTA_PATH_MAX}
                      placeholder="/"
                      value={scene.cta.action.path}
                      onChange={(e) => patchScene({ cta: { label: scene.cta!.label, action: { type: "route", path: e.target.value } } })}
                    />
                  </label>
                ) : null}
              </div>

              <label className="block">
                <span className={label}>{t("admin_launch_intro_duration")}</span>
                <input
                  type="number"
                  min={LAUNCH_INTRO_DURATION_MIN_MS / 1000}
                  max={LAUNCH_INTRO_DURATION_MAX_MS / 1000}
                  step={0.5}
                  className={`${field} w-32`}
                  value={scene.durationMs / 1000}
                  onChange={(e) => {
                    const sec = Number(e.target.value);
                    if (Number.isFinite(sec)) {
                      const ms = Math.round(sec * 1000);
                      patchScene({ durationMs: Math.min(LAUNCH_INTRO_DURATION_MAX_MS, Math.max(LAUNCH_INTRO_DURATION_MIN_MS, ms)) });
                    }
                  }}
                />
              </label>

              {dirty ? <p className="sam-text-body-secondary text-sam-warning">{t("admin_launch_intro_unsaved")}</p> : null}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="sam-btn sam-btn--primary" disabled={busy || !dirty} onClick={() => void save(doc)}>
                  {t("admin_launch_intro_save")}
                </button>
                <button
                  type="button"
                  className="sam-btn sam-btn--secondary"
                  disabled={busy || !dirty}
                  onClick={() => {
                    setPlaying(false);
                    setDoc(snap.draft?.document ?? null);
                  }}
                >
                  {t("admin_launch_intro_cancel")}
                </button>
                <button type="button" className="sam-btn sam-btn--primary" disabled={busy || dirty || !snap.draft} onClick={() => void publish()}>
                  {t("admin_launch_intro_publish")}
                </button>
                <button
                  type="button"
                  className="sam-btn sam-btn--secondary"
                  disabled={busy || !snap.draft}
                  onClick={async () => {
                    const ok = await dibayConfirm({ title: t("admin_launch_intro_delete_confirm"), confirmTone: "destructive", confirmLabel: t("admin_launch_intro_delete") });
                    if (!ok) return;
                    void call(`/api/admin/launch-intro?id=${snap.draft!.id}`, { method: "DELETE" }, t("admin_launch_intro_done"));
                  }}
                >
                  {t("admin_launch_intro_delete")}
                </button>
              </div>
            </div>

            {/* Preview: same document, same Player as the app */}
            <div className="space-y-2">
              <p className="text-center sam-text-body-secondary text-sam-muted">{t("admin_launch_intro_preview")}</p>
              <div className="flex flex-wrap justify-center gap-1">
                {(Object.keys(PREVIEW_DEVICES) as PreviewDevice[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`sam-btn ${device === d ? "sam-btn--primary" : "sam-btn--secondary"}`}
                    onClick={() => setDevice(d)}
                  >
                    {t(`admin_launch_intro_preview_${d}` as const)}
                  </button>
                ))}
              </div>
              {PREVIEW_DEVICES[device].rotatable ? (
                <div className="flex justify-center gap-1">
                  <button type="button" className={`sam-btn ${!landscape ? "sam-btn--primary" : "sam-btn--secondary"}`} onClick={() => setLandscape(false)}>
                    {t("admin_launch_intro_preview_portrait")}
                  </button>
                  <button type="button" className={`sam-btn ${landscape ? "sam-btn--primary" : "sam-btn--secondary"}`} onClick={() => setLandscape(true)}>
                    {t("admin_launch_intro_preview_landscape")}
                  </button>
                </div>
              ) : null}
              <DevicePreview
                doc={doc}
                sceneIndex={playing ? previewIndex : sel}
                playing={playing}
                imageUrls={imageUrls}
                device={device}
                landscape={landscape}
                onSceneIndexChange={setPreviewIndex}
                onStop={() => setPlaying(false)}
                onNotice={setPreviewNotice}
              />
              <div className="flex justify-center">
                {playing ? (
                  <button type="button" className="sam-btn sam-btn--secondary" onClick={() => setPlaying(false)}>
                    {t("admin_launch_intro_preview_stop")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="sam-btn sam-btn--secondary"
                    onClick={() => {
                      setPreviewNotice(null);
                      setPreviewIndex(0);
                      setPlaying(true);
                    }}
                  >
                    {t("admin_launch_intro_preview_play")}
                  </button>
                )}
              </div>
              {playing ? (
                <p className="text-center sam-text-body-secondary text-sam-muted">{t("admin_launch_intro_scene_n", { n: String(previewIndex + 1) })}</p>
              ) : previewNotice ? (
                <p className="max-w-[300px] text-center sam-text-body-secondary text-sam-muted">{previewNotice}</p>
              ) : null}
            </div>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
