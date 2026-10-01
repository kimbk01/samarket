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
  LAUNCH_INTRO_FREQUENCIES,
  LAUNCH_INTRO_ENTER_MOTIONS,
  LAUNCH_INTRO_LAYOUTS,
  LAUNCH_INTRO_MAX_DECORATIONS,
  LAUNCH_INTRO_TRANSITIONS,
  type LaunchIntroDecorationSlot,
  type LaunchIntroDocument,
  type LaunchIntroEligibility,
  type LaunchIntroFit,
  type LaunchIntroFrequency,
  type LaunchIntroImageRef,
  type LaunchIntroVideoRef,
  type LaunchIntroLiveState,
  type LaunchIntroScene,
  type LaunchIntroSceneText,
  type LaunchIntroTextStyle,
} from "@/lib/launch-intro/document";
import {
  launchIntroCanReactivate,
  launchIntroCanTransition,
  launchIntroDraftStatus,
  type LaunchIntroLifecycleAction,
} from "@/lib/launch-intro/lifecycle";
import { LAUNCH_INTRO_TARGETS, type LaunchIntroTarget } from "@/lib/launch-intro/target";
import {
  formatManila,
  launchIntroScheduleState,
  manilaLocalToIso,
  validateLaunchIntroEligibility,
} from "@/lib/launch-intro/schedule";

type Snapshot = {
  ok: true;
  draft: { id: string; document: LaunchIntroDocument; version: number; updated_at: string } | null;
  draftImageUrls: Record<string, string>;
  live: { publication_id: string | null; state: LaunchIntroLiveState; revision: number; updated_at: string };
  publications: Array<{
    id: string;
    created_at: string;
    source_draft_id: string | null;
    source_draft_version: number | null;
    document: LaunchIntroDocument;
    eligibility: LaunchIntroEligibility | null;
  }>;
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
const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const FREQUENCY_LABEL = {
  every_launch: "admin_launch_intro_frequency_every_launch",
  once_per_publication: "admin_launch_intro_frequency_once_per_publication",
  once_per_day: "admin_launch_intro_frequency_once_per_day",
} as const satisfies Record<LaunchIntroFrequency, string>;
const TARGET_LABEL = {
  all: "admin_launch_intro_target_all",
  phone: "admin_launch_intro_target_phone",
  tablet: "admin_launch_intro_target_tablet",
} as const satisfies Record<LaunchIntroTarget, string>;
/** Confirm + result copy per Live transition (every state change asks first, then says what happens on devices). */
const LIFECYCLE_COPY = {
  pause: {
    title: "admin_launch_intro_pause_confirm",
    desc: "admin_launch_intro_pause_confirm_desc",
    label: "admin_launch_intro_pause",
    done: "admin_launch_intro_pause_done",
  },
  resume: {
    title: "admin_launch_intro_resume_confirm",
    desc: "admin_launch_intro_resume_confirm_desc",
    label: "admin_launch_intro_resume",
    done: "admin_launch_intro_resume_done",
  },
  unpublish: {
    title: "admin_launch_intro_unpublish_confirm",
    desc: "admin_launch_intro_unpublish_confirm_desc",
    label: "admin_launch_intro_unpublish",
    done: "admin_launch_intro_unpublish_done",
  },
  reactivate: {
    title: "admin_launch_intro_reactivate_confirm",
    desc: "admin_launch_intro_reactivate_confirm_desc",
    label: "admin_launch_intro_reactivate",
    done: "admin_launch_intro_reactivate_done",
  },
} as const satisfies Record<LaunchIntroLifecycleAction, Record<"title" | "desc" | "label" | "done", string>>;
const PREVIEW_MAX_W = 300;
const PREVIEW_MAX_H = 560;

function defaultTextStyle(kind: "headline" | "supporting", value: string): LaunchIntroTextStyle {
  return kind === "headline"
    ? { value, size: "L", weight: "bold", color: "#FFFFFF" }
    : { value, size: "M", weight: "regular", color: "#FFFFFF" };
}

class UploadError extends Error {}

/** Two-step draft upload: signed URL → direct PUT to storage → server inspection (the authority). */
async function uploadLaunchIntroAsset(
  file: Blob & { type: string }
): Promise<{ kind: "image" | "video"; ref: LaunchIntroImageRef | LaunchIntroVideoRef; url: string | null }> {
  const post = async (body: unknown) => {
    const res = await fetch("/api/admin/launch-intro/upload", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as Record<string, unknown> & { ok: boolean; error?: string };
    if (!json.ok) throw new UploadError(json.error ?? String(res.status));
    return json;
  };
  const start = (await post({ action: "start", mime: file.type, bytes: file.size })) as unknown as { path: string; signedUrl: string };
  const put = await fetch(start.signedUrl, {
    method: "PUT",
    headers: { "content-type": file.type, "x-upsert": "false", "cache-control": "max-age=3600" },
    body: file,
  });
  if (!put.ok) throw new UploadError(`storage_${put.status}`);
  const done = (await post({ action: "finish", path: start.path })) as unknown as {
    kind: "image" | "video";
    ref: LaunchIntroImageRef | LaunchIntroVideoRef;
    url: string | null;
  };
  return done;
}

/** First frame of a local MP4 → JPEG at the video's display size (event-driven, no timers). */
function extractVideoPoster(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const fail = () => {
      URL.revokeObjectURL(url);
      reject(new UploadError("poster_failed"));
    };
    video.onerror = fail;
    video.onloadeddata = () => {
      video.onseeked = () => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const g = canvas.getContext("2d");
        if (!g || !canvas.width || !canvas.height) return fail();
        g.drawImage(video, 0, 0);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (!blob) return reject(new UploadError("poster_failed"));
            resolve(new File([blob], "poster.jpg", { type: "image/jpeg" }));
          },
          "image/jpeg",
          0.9
        );
      };
      video.currentTime = 0;
    };
    video.src = url;
  });
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
  /** Publish schedule (P5), Manila wall time; empty = no limit. */
  const [schedule, setSchedule] = useState<{
    startLocal: string;
    endLocal: string;
    frequency: LaunchIntroFrequency;
    target: LaunchIntroTarget;
  }>({
    startLocal: "",
    endLocal: "",
    frequency: "every_launch",
    target: "all",
  });
  /** Clock for schedule labels, refreshed with every server snapshot (no timers). */
  const [now, setNow] = useState(() => Date.now());
  const fileRef = useRef<HTMLInputElement | null>(null);
  /** Where the next uploaded image goes (one hidden file input for every image slot). */
  const uploadTarget = useRef<UploadTarget>({ kind: "media" });

  const apply = useCallback((json: Snapshot) => {
    setSnap(json);
    setNow(Date.now());
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
    if (fileRef.current) {
      fileRef.current.accept =
        target.kind === "media" || target.kind === "background" ? `${IMAGE_ACCEPT},video/mp4` : IMAGE_ACCEPT;
    }
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
      const isVideo = file.type === "video/mp4";
      if (isVideo && target.kind !== "media" && target.kind !== "background") throw new UploadError("video_not_allowed_here");
      let video: LaunchIntroVideoRef | null = null;
      let asset: LaunchIntroImageRef;
      if (isVideo) {
        const v = await uploadLaunchIntroAsset(file);
        if (v.kind !== "video") throw new UploadError("unsupported_media");
        video = v.ref as LaunchIntroVideoRef;
        // Poster = the video's first frame at its display size (same aspect ratio by construction).
        const poster = await uploadLaunchIntroAsset(await extractVideoPoster(file));
        if (poster.kind !== "image") throw new UploadError("poster_failed");
        asset = poster.ref as LaunchIntroImageRef;
        setImageUrls((prev) => ({ ...prev, ...(v.url ? { [v.ref.sha256]: v.url } : {}), ...(poster.url ? { [poster.ref.sha256]: poster.url } : {}) }));
      } else {
        const img = await uploadLaunchIntroAsset(file);
        if (img.kind !== "image") throw new UploadError("unsupported_media");
        asset = img.ref as LaunchIntroImageRef;
        if (img.url) setImageUrls((prev) => ({ ...prev, [img.ref.sha256]: img.url! }));
      }
      patchSceneAt(index, (s) => {
        if (target.kind === "media") return { ...s, media: { asset, fit: s.media?.fit ?? "contain", video } };
        if (target.kind === "background")
          return { ...s, background: { ...s.background, media: { asset, fit: s.background.media?.fit ?? "cover", video } } };
        if (target.kind === "logo") return { ...s, logo: { asset } };
        const rest = s.decorations.filter((d) => d.slot !== target.slot);
        return { ...s, decorations: [...rest, { asset, slot: target.slot, size: "M" }] };
      });
    } catch (err) {
      setMessage(t("admin_launch_intro_error", { error: err instanceof UploadError ? err.message : "network" }));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const publish = async () => {
    if (!snap?.draft) return;
    const startAt = manilaLocalToIso(schedule.startLocal);
    const endAt = manilaLocalToIso(schedule.endLocal);
    if (startAt === undefined || endAt === undefined) {
      setMessage(t("admin_launch_intro_schedule_err_invalid"));
      return;
    }
    const checked = validateLaunchIntroEligibility(
      { frequency: schedule.frequency, target: schedule.target, startAt, endAt },
      Date.now()
    );
    if (!checked.ok) {
      setMessage(
        checked.error === "schedule_end_before_start"
          ? t("admin_launch_intro_schedule_err_end_before_start")
          : checked.error === "schedule_already_ended"
            ? t("admin_launch_intro_schedule_err_already_ended")
            : t("admin_launch_intro_schedule_err_invalid")
      );
      return;
    }
    const e = checked.eligibility;
    const ok = await dibayConfirm({
      title: t("admin_launch_intro_publish_confirm"),
      description: [
        t("admin_launch_intro_publish_confirm_desc"),
        t(FREQUENCY_LABEL[e.frequency]) + ".",
        t(TARGET_LABEL[e.target ?? "all"]) + ".",
        e.startAt || e.endAt
          ? t("admin_launch_intro_schedule_summary", {
              start: e.startAt ? formatManila(e.startAt, undefined) : t("admin_launch_intro_schedule_now"),
              end: e.endAt ? formatManila(e.endAt, undefined) : t("admin_launch_intro_schedule_no_end"),
            })
          : t("admin_launch_intro_schedule_always"),
      ].join(" "),
      confirmLabel: t("admin_launch_intro_publish"),
    });
    if (!ok) return;
    await call(
      "/api/admin/launch-intro/publish",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: snap.draft.id, version: snap.draft.version, eligibility: e }),
      },
      t("admin_launch_intro_publish_done")
    );
  };

  const fmtDate = (iso: string) => new Date(iso).toLocaleString();
  const setState = async (action: LaunchIntroLifecycleAction, publicationId?: string) => {
    const copy = LIFECYCLE_COPY[action];
    const pub = publicationId ? snap?.publications.find((p) => p.id === publicationId) : null;
    // Reactivate while nothing is live: there is no current Intro to take down.
    const desc =
      action === "reactivate" && pub && launchIntroScheduleState(pub.eligibility, Date.now()) === "ended"
        ? "admin_launch_intro_reactivate_confirm_desc_ended"
        : action === "reactivate" && snap?.live.state === "unpublished"
          ? "admin_launch_intro_reactivate_confirm_desc_none"
          : copy.desc;
    const ok = await dibayConfirm({
      title: t(copy.title),
      description: t(desc, { id: pub ? pub.id.slice(0, 8) : "", date: pub ? fmtDate(pub.created_at) : "" }),
      confirmLabel: t(copy.label),
      confirmTone: action === "unpublish" ? "destructive" : "primary",
    });
    if (!ok) return;
    await call(
      "/api/admin/launch-intro/state",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, publicationId }) },
      t(copy.done)
    );
  };

  const live = snap?.live;
  const livePublication = live?.publication_id ? (snap?.publications.find((p) => p.id === live.publication_id) ?? null) : null;
  const draftStatus = launchIntroDraftStatus({ draft: snap?.draft ?? null, dirty, livePublication });
  const liveSchedule = livePublication ? launchIntroScheduleState(livePublication.eligibility, now) : "always";
  const scheduleText = (e: LaunchIntroEligibility | null) =>
    [
      e?.target ? t(TARGET_LABEL[e.target]) : "",
      e?.frequency && e.frequency !== "every_launch" ? t(FREQUENCY_LABEL[e.frequency]) : "",
      e?.startAt || e?.endAt
        ? t("admin_launch_intro_schedule_window", {
            start: e.startAt ? formatManila(e.startAt, undefined) : t("admin_launch_intro_schedule_now"),
            end: e.endAt ? formatManila(e.endAt, undefined) : t("admin_launch_intro_schedule_no_end"),
          })
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
  const devicesLine = !live
    ? ""
    : live.state === "active" && livePublication && liveSchedule === "scheduled"
      ? t("admin_launch_intro_status_devices_scheduled", {
          id: livePublication.id.slice(0, 8),
          start: formatManila(livePublication.eligibility!.startAt!, undefined),
        })
    : live.state === "active" && livePublication && liveSchedule === "ended"
      ? t("admin_launch_intro_status_devices_ended", {
          id: livePublication.id.slice(0, 8),
          end: formatManila(livePublication.eligibility!.endAt!, undefined),
        })
    : live.state === "active" && livePublication
      ? `${t("admin_launch_intro_status_devices_active", { id: livePublication.id.slice(0, 8), date: fmtDate(livePublication.created_at) })}${
          scheduleText(livePublication.eligibility) ? ` · ${scheduleText(livePublication.eligibility)}` : ""
        }`
      : live.state === "paused" && livePublication
        ? t("admin_launch_intro_status_devices_paused", { id: livePublication.id.slice(0, 8) })
        : t("admin_launch_intro_status_devices_unpublished");
  const draftLine =
    draftStatus === "none"
      ? t("admin_launch_intro_status_draft_none")
      : draftStatus === "unsaved"
        ? t("admin_launch_intro_status_draft_unsaved")
        : draftStatus === "published"
          ? t("admin_launch_intro_status_draft_published", { v: snap?.draft?.version ?? 0 })
          : draftStatus === "not_live"
            ? t("admin_launch_intro_status_draft_not_live", { v: snap?.draft?.version ?? 0 })
            : t("admin_launch_intro_status_draft_changed", { v: snap?.draft?.version ?? 0 });
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
          <div className="space-y-3 px-4 py-4 sm:px-5" data-launch-intro-status-board="">
            <dl className="grid gap-x-4 gap-y-2 sam-text-body sm:grid-cols-[max-content_1fr]">
              <dt className="font-medium text-sam-fg">{t("admin_launch_intro_status_devices")}</dt>
              <dd className="text-sam-fg" data-launch-intro-live-state={live.state} data-launch-intro-schedule-state={liveSchedule}>
                {devicesLine}
              </dd>
              <dt className="font-medium text-sam-fg">{t("admin_launch_intro_status_draft")}</dt>
              <dd className={draftStatus === "unsaved" || draftStatus === "changed" ? "text-sam-warning" : "text-sam-fg"} data-launch-intro-draft-status={draftStatus}>
                {draftLine}
              </dd>
              <dt className="font-medium text-sam-muted">{t("admin_launch_intro_status_last_change")}</dt>
              <dd className="text-sam-muted">
                {fmtDate(live.updated_at)} · {t("admin_launch_intro_revision")} {live.revision}
              </dd>
            </dl>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="sam-btn sam-btn--secondary" disabled={busy || !launchIntroCanTransition(live, "pause")} onClick={() => void setState("pause")}>
                {t("admin_launch_intro_pause")}
              </button>
              <button type="button" className="sam-btn sam-btn--secondary" disabled={busy || !launchIntroCanTransition(live, "resume")} onClick={() => void setState("resume")}>
                {t("admin_launch_intro_resume")}
              </button>
              <button type="button" className="sam-btn sam-btn--secondary" disabled={busy || !launchIntroCanTransition(live, "unpublish")} onClick={() => void setState("unpublish")}>
                {t("admin_launch_intro_unpublish")}
              </button>
            </div>
            <div>
              <p className="mb-1 sam-text-body font-medium text-sam-fg">{t("admin_launch_intro_history_title")}</p>
              {snap?.publications.length ? (
                <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border">
                  {snap.publications.map((p) => {
                    const isLive = p.id === live.publication_id;
                    return (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 sam-text-body-secondary text-sam-muted" data-launch-intro-publication={p.id}>
                        <span>
                          <span className="font-mono text-sam-fg">{p.id.slice(0, 8)}</span> · {fmtDate(p.created_at)} ·{" "}
                          {t("admin_launch_intro_history_scenes", { n: p.document.scenes.length })}
                          {p.source_draft_version != null ? ` · Draft v${p.source_draft_version}` : ""}
                          {scheduleText(p.eligibility) ? ` · ${scheduleText(p.eligibility)}` : ""}
                          {isLive ? (
                            <span className="ml-2 rounded-full bg-sam-surface-muted px-2 py-0.5 font-medium text-sam-fg">
                              {live.state === "paused" ? t("admin_launch_intro_history_badge_paused") : t("admin_launch_intro_history_badge_live")}
                            </span>
                          ) : null}
                        </span>
                        {launchIntroCanReactivate(live, p.id) ? (
                          <button type="button" className="sam-btn sam-btn--secondary" disabled={busy} onClick={() => void setState("reactivate", p.id)}>
                            {t("admin_launch_intro_reactivate")}
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
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
                accept={IMAGE_ACCEPT}
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

              <fieldset className="space-y-2 rounded-ui-rect border border-sam-border p-3" data-launch-intro-schedule="">
                <legend className="px-1 sam-text-body font-medium text-sam-fg">{t("admin_launch_intro_publish_settings_title")}</legend>
                <div className="flex flex-wrap gap-3">
                  <label className="space-y-1">
                    <span className="block sam-text-body-secondary text-sam-muted">{t("admin_launch_intro_schedule_start")}</span>
                    <input
                      type="datetime-local"
                      className={`${field} w-auto`}
                      value={schedule.startLocal}
                      onChange={(e) => setSchedule((s) => ({ ...s, startLocal: e.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block sam-text-body-secondary text-sam-muted">{t("admin_launch_intro_schedule_end")}</span>
                    <input
                      type="datetime-local"
                      className={`${field} w-auto`}
                      value={schedule.endLocal}
                      onChange={(e) => setSchedule((s) => ({ ...s, endLocal: e.target.value }))}
                    />
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="block sam-text-body-secondary text-sam-muted">{t("admin_launch_intro_frequency")}</span>
                  <select
                    className={`${field} w-auto`}
                    value={schedule.frequency}
                    onChange={(e) => setSchedule((s) => ({ ...s, frequency: e.target.value as LaunchIntroFrequency }))}
                    data-launch-intro-frequency=""
                  >
                    {LAUNCH_INTRO_FREQUENCIES.map((f) => (
                      <option key={f} value={f}>
                        {t(FREQUENCY_LABEL[f])}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="block sam-text-body-secondary text-sam-muted">{t("admin_launch_intro_target")}</span>
                  <select
                    className={`${field} w-auto`}
                    value={schedule.target}
                    onChange={(e) => setSchedule((s) => ({ ...s, target: e.target.value as LaunchIntroTarget }))}
                    data-launch-intro-target=""
                  >
                    {LAUNCH_INTRO_TARGETS.map((x) => (
                      <option key={x} value={x}>
                        {t(TARGET_LABEL[x])}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="sam-text-body-secondary text-sam-muted">{t("admin_launch_intro_schedule_hint")}</p>
                <p className="sam-text-body-secondary text-sam-muted">{t("admin_launch_intro_frequency_hint")}</p>
              </fieldset>

              {dirty ? <p className="sam-text-body-secondary text-sam-warning">{t("admin_launch_intro_unsaved")}</p> : null}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="sam-btn sam-btn--primary" disabled={busy || !dirty} onClick={() => void save(doc)}>
                  {t("admin_launch_intro_save")}
                </button>
                <button
                  type="button"
                  className="sam-btn sam-btn--secondary"
                  disabled={busy || !dirty}
                  onClick={async () => {
                    const ok = await dibayConfirm({
                      title: t("admin_launch_intro_cancel_confirm"),
                      confirmLabel: t("admin_launch_intro_cancel_confirm_label"),
                      confirmTone: "destructive",
                    });
                    if (!ok) return;
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
                    void call(`/api/admin/launch-intro?id=${snap.draft!.id}`, { method: "DELETE" }, t("admin_launch_intro_delete_done"));
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
