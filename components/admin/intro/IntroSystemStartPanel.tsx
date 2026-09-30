"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import {
  BRAND_SIZE_NORM,
  SYSTEM_START_MIN_VISIBLE_PRESETS_MS,
  type BrandSizePreset,
} from "@/lib/intro/system-start/contract";

type NextBuildState = {
  revision: number;
  backgroundColor: string;
  backgroundImageMediaId: string | null;
  backgroundImagePreviewUrl: string | null;
  brandAssetEnabled: boolean;
  brandAssetMediaId: string | null;
  brandPreviewUrl: string | null;
  brandSizePreset: BrandSizePreset;
  brandXNorm: number;
  brandYNorm: number;
  minVisibleMs: number;
};

type InstalledState = {
  revision: number;
  backgroundColor: string;
  backgroundImageMediaId: string | null;
  backgroundImagePreviewUrl: string | null;
  brandAssetEnabled: boolean;
  brandAssetMediaId: string | null;
  brandPreviewUrl: string | null;
  brandSizePreset: BrandSizePreset;
  brandXNorm: number;
  brandYNorm: number;
  minVisibleMs: number;
  materializedAt: string;
} | null;

type LiveState =
  | { kind: "NO_LIVE" }
  | {
      kind: "LIVE";
      revision: number;
      generationId: string;
      backgroundColor: string;
      backgroundImageMediaId: string | null;
      backgroundImagePreviewUrl: string | null;
      brandAssetEnabled: boolean;
      brandAssetMediaId: string | null;
      brandPreviewUrl: string | null;
      brandSizePreset: BrandSizePreset;
      brandXNorm: number;
      brandYNorm: number;
      minVisibleMs: number;
    };

type MediaItem = {
  mediaId: string;
  mediaKind: string;
  originalName: string;
  previewUrl: string | null;
};

type PickerTarget = "brand" | "background";

const SIZE_OPTIONS: { value: BrandSizePreset; label: string }[] = [
  { value: "S", label: "작게 (S)" },
  { value: "M", label: "보통 (M)" },
  { value: "L", label: "크게 (L)" },
];

/**
 * System Start Admin — durable draft + Layer B Live Apply.
 * Layer A OS LaunchScreen/Splash = native build materialized stamp only.
 */
export function IntroSystemStartPanel() {
  const [installed, setInstalled] = useState<InstalledState>(null);
  const [live, setLive] = useState<LiveState>({ kind: "NO_LIVE" });
  const [draft, setDraft] = useState<NextBuildState | null>(null);
  const [saved, setSaved] = useState<NextBuildState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>("brand");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);

  async function reloadFromServer() {
    const res = await fetch("/api/admin/intro/system-start", { cache: "no-store" });
    const json = (await res.json()) as {
      ok: boolean;
      nextBuild?: NextBuildState;
      installed?: InstalledState;
      live?: unknown;
      error?: string;
    };
    if (!json.ok || !json.nextBuild) {
      setErr(json.error ?? "load_failed");
      return false;
    }
    const next = normalizeNext(json.nextBuild);
    setDraft(next);
    setSaved(next);
    setInstalled(json.installed ? normalizeInstalled(json.installed) : null);
    setLive(parseLive(json.live, next));
    return true;
  }

  useEffect(() => {
    void reloadFromServer();
  }, []);

  async function loadMedia() {
    const res = await fetch("/api/admin/intro/media", { cache: "no-store" });
    const json = (await res.json()) as { ok: boolean; items?: MediaItem[] };
    if (json.ok) setMediaItems(json.items ?? []);
  }

  const dirty = useMemo(() => {
    if (!saved || !draft) return false;
    return !draftEquals(saved, draft);
  }, [saved, draft]);

  const draftMatchesLive = useMemo(() => {
    if (!draft || live.kind !== "LIVE") return false;
    return liveDraftEquals(live, draft);
  }, [draft, live]);

  if (!draft) {
    return (
      <div className="text-sm text-sam-muted">{err ?? "불러오는 중…"}</div>
    );
  }

  const sizeNorm = BRAND_SIZE_NORM[draft.brandSizePreset];
  const logoPct = Math.round(sizeNorm * 100);
  const previewUrl = draft.brandPreviewUrl;
  const showLogo = draft.brandAssetEnabled && !!previewUrl;
  const bgPreviewUrl = draft.backgroundImagePreviewUrl;

  async function persist(
    next: NextBuildState,
    opts?: { clearBrand?: boolean; clearBackground?: boolean },
  ) {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/admin/intro/system-start", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backgroundColor: next.backgroundColor,
          backgroundImageMediaId: opts?.clearBackground
            ? null
            : next.backgroundImageMediaId,
          clearBackgroundImage: opts?.clearBackground === true,
          brandAssetEnabled: next.brandAssetEnabled,
          brandAssetMediaId: opts?.clearBrand ? null : next.brandAssetMediaId,
          clearBrandAsset: opts?.clearBrand === true,
          brandSizePreset: next.brandSizePreset,
          brandXNorm: next.brandXNorm,
          brandYNorm: next.brandYNorm,
          minVisibleMs: next.minVisibleMs,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        nextBuild?: NextBuildState;
        installed?: InstalledState;
        message?: string;
        error?: string;
      };
      if (!json.ok || !json.nextBuild) {
        setErr(json.error ?? "save_failed");
        return;
      }
      const normalized = normalizeNext(json.nextBuild);
      setDraft(normalized);
      setSaved(normalized);
      setInstalled(json.installed ? normalizeInstalled(json.installed) : installed);
      setMsg(
        json.message ??
          "저장 완료 — durable 초안이 저장되었습니다. 「적용」으로 다음 콜드 스타트(Layer B)에 반영하세요.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function applyLive() {
    if (dirty) {
      setErr("미저장 변경이 있습니다. 먼저 저장한 뒤 적용하세요.");
      return;
    }
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/admin/intro/system-start/apply", {
        method: "POST",
      });
      const json = (await res.json()) as {
        ok: boolean;
        live?: unknown;
        message?: string;
        error?: string;
      };
      if (!json.ok) {
        setErr(json.error ?? "apply_failed");
        return;
      }
      if (saved) setLive(parseLive(json.live, saved));
      setMsg(
        json.message ??
          "적용 완료 — 다음 앱 실행(콜드 스타트)부터 새 시스템 시작 화면이 표시됩니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function uploadMedia(file: File, target: PickerTarget) {
    setBusy(true);
    setErr(null);
    try {
      const form = new FormData();
      form.set("file", file);
      if (target === "brand") form.set("asLogo", "1");
      const res = await fetch("/api/admin/intro/media", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as {
        ok: boolean;
        item?: MediaItem & { mediaId: string; previewUrl: string | null };
        error?: string;
      };
      if (!json.ok || !json.item) {
        setErr(json.error ?? "upload_failed");
        return;
      }
      if (!draft) return;
      const next: NextBuildState =
        target === "brand"
          ? {
              ...draft,
              brandAssetEnabled: true,
              brandAssetMediaId: json.item.mediaId,
              brandPreviewUrl: json.item.previewUrl,
            }
          : {
              ...draft,
              backgroundImageMediaId: json.item.mediaId,
              backgroundImagePreviewUrl: json.item.previewUrl,
            };
      setDraft(next);
      await persist(next);
    } finally {
      setBusy(false);
    }
  }

  async function selectFromLibrary(
    mediaId: string,
    previewUrl: string | null,
    target: PickerTarget,
  ) {
    if (!draft) return;
    const next: NextBuildState =
      target === "brand"
        ? {
            ...draft,
            brandAssetEnabled: true,
            brandAssetMediaId: mediaId,
            brandPreviewUrl: previewUrl,
          }
        : {
            ...draft,
            backgroundImageMediaId: mediaId,
            backgroundImagePreviewUrl: previewUrl,
          };
    setDraft(next);
    setPickerOpen(false);
    await persist(next);
  }

  async function clearBackgroundImage() {
    if (!draft) return;
    if (
      draft.backgroundImageMediaId &&
      !window.confirm("배경 이미지를 제거할까요?")
    ) {
      return;
    }
    const next: NextBuildState = {
      ...draft,
      backgroundImageMediaId: null,
      backgroundImagePreviewUrl: null,
    };
    setDraft(next);
    await persist(next, { clearBackground: true });
  }

  async function deleteLogo() {
    if (!draft) return;
    if (!window.confirm("선택한 브랜드 이미지를 제거할까요?")) return;
    const next: NextBuildState = {
      ...draft,
      brandAssetEnabled: false,
      brandAssetMediaId: null,
      brandPreviewUrl: null,
    };
    setDraft(next);
    await persist(next, { clearBrand: true });
  }

  function openPicker(target: PickerTarget) {
    setPickerTarget(target);
    void loadMedia().then(() => setPickerOpen(true));
  }

  return (
    <div className="space-y-6" data-intro13-system-start="1">
      <div>
        <h2 className="text-lg font-semibold text-sam-fg">시스템 시작 화면</h2>
        <p className="mt-1 text-sm text-sam-muted">
          앱 아이콘 직후 연속 화면(Layer B)입니다. Product Intro와 다릅니다.
          <strong className="font-medium text-sam-fg"> 저장</strong>은 durable
          초안만 기록하고,{" "}
          <strong className="font-medium text-sam-fg">적용</strong>은 다음
          콜드 스타트부터 Live로 반영합니다. OS LaunchScreen/Splash(Layer A)는
          네이티브 빌드 materialized stamp가 갱신될 때만 바뀝니다.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          <div className="text-xs font-medium text-sam-muted">
            미리보기 (Layer B 근사)
          </div>
          <SystemStartPreviewFrame
            backgroundColor={draft.backgroundColor}
            backgroundImageUrl={bgPreviewUrl}
            showLogo={showLogo}
            logoUrl={previewUrl}
            logoPct={logoPct}
            brandXNorm={draft.brandXNorm}
            brandYNorm={draft.brandYNorm}
          />
          <p className="text-[11px] text-sam-muted">
            배경색 · 선택 배경 이미지(cover) · 브랜드 위치·크기 프리셋을
            반영합니다.
          </p>
        </div>

        <div className="space-y-5 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <label className="block text-sm">
            <span className="font-medium text-sam-fg">배경색</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={
                  /^#[0-9A-Fa-f]{6}$/.test(draft.backgroundColor)
                    ? draft.backgroundColor
                    : "#312E81"
                }
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    backgroundColor: e.target.value.toUpperCase(),
                  })
                }
                className="h-9 w-12 cursor-pointer rounded-ui-rect border border-sam-border"
              />
              <input
                className="min-h-9 flex-1 rounded-ui-rect border border-[var(--admin-console-border,#d0d7e2)] bg-[var(--admin-console-surface,#fff)] px-3 text-sm text-[var(--admin-console-fg,#1f2937)]"
                value={draft.backgroundColor}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    backgroundColor: e.target.value.toUpperCase(),
                  })
                }
                spellCheck={false}
              />
            </div>
          </label>

          <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-app p-3">
            <div className="text-sm font-medium text-sam-fg">배경 이미지</div>
            <p className="text-[11px] text-sam-muted">
              선택 시 배경색 위에 cover로 깔립니다. Layer B Live Apply에
              포함됩니다.
            </p>
            {bgPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bgPreviewUrl}
                alt=""
                className="h-24 w-full rounded-ui-rect object-cover"
              />
            ) : (
              <div className="flex h-24 items-center justify-center rounded-ui-rect border border-dashed border-sam-border text-xs text-sam-muted">
                배경 이미지 없음
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <AdminActionButton
                variant="secondary"
                disabled={busy}
                onClick={() => openPicker("background")}
              >
                {bgPreviewUrl ? "교체 · 미디어에서 선택" : "미디어에서 선택"}
              </AdminActionButton>
              <AdminActionButton
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  document.getElementById("system-start-bg-upload")?.click();
                }}
              >
                업로드
              </AdminActionButton>
              <input
                id="system-start-bg-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadMedia(f, "background");
                  e.target.value = "";
                }}
              />
              {draft.backgroundImageMediaId ? (
                <AdminActionButton
                  variant="danger"
                  disabled={busy}
                  onClick={() => void clearBackgroundImage()}
                >
                  제거
                </AdminActionButton>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-sam-fg">
              <input
                type="checkbox"
                checked={draft.brandAssetEnabled}
                onChange={(e) => {
                  setDraft({
                    ...draft,
                    brandAssetEnabled: e.target.checked,
                  });
                }}
              />
              브랜드 이미지 / 로고 사용
            </label>

            {draft.brandAssetEnabled ? (
              <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-app p-3">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt=""
                    className="h-24 w-full rounded-ui-rect object-contain bg-white"
                  />
                ) : (
                  <div className="flex h-24 items-center justify-center rounded-ui-rect border border-dashed border-sam-border text-xs text-sam-muted">
                    선택된 이미지 없음
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <AdminActionButton
                    variant="secondary"
                    disabled={busy}
                    onClick={() => openPicker("brand")}
                  >
                    {previewUrl ? "교체 · 미디어에서 선택" : "이미지 선택"}
                  </AdminActionButton>
                  <AdminActionButton
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      document.getElementById("system-start-logo-upload")?.click();
                    }}
                  >
                    업로드
                  </AdminActionButton>
                  <input
                    id="system-start-logo-upload"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadMedia(f, "brand");
                      e.target.value = "";
                    }}
                  />
                  {draft.brandAssetMediaId ? (
                    <AdminActionButton
                      variant="danger"
                      disabled={busy}
                      onClick={() => void deleteLogo()}
                    >
                      삭제
                    </AdminActionButton>
                  ) : null}
                </div>

                <div>
                  <div className="mb-1 text-sm font-medium text-sam-fg">
                    브랜드 크기
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SIZE_OPTIONS.map((o) => (
                      <AdminActionButton
                        key={o.value}
                        variant={
                          draft.brandSizePreset === o.value
                            ? "primary"
                            : "secondary"
                        }
                        onClick={() =>
                          setDraft({ ...draft, brandSizePreset: o.value })
                        }
                      >
                        {o.label}
                      </AdminActionButton>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-sm font-medium text-sam-fg">
                    브랜드 위치
                  </div>
                  <AdminActionButton
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        brandXNorm: 0.5,
                        brandYNorm: 0.5,
                      })
                    }
                  >
                    가운데 맞춤
                  </AdminActionButton>
                  <p className="mt-1 text-[11px] text-sam-muted">
                    현재 ({draft.brandXNorm.toFixed(2)},{" "}
                    {draft.brandYNorm.toFixed(2)}) — 저장 후 적용에 반영됩니다.
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <div className="mb-1 text-sm font-medium text-sam-fg">최소 표시시간</div>
            <p className="mb-2 text-[11px] text-sam-muted">
              앱이 제어하는 연속 화면(continuation)에만 적용됩니다. OS LaunchScreen
              자체 표시시간은 설정할 수 없습니다. 범위 0.5–5.0초.
            </p>
            <div className="flex flex-wrap gap-2">
              {SYSTEM_START_MIN_VISIBLE_PRESETS_MS.map((ms) => (
                <AdminActionButton
                  key={ms}
                  variant={draft.minVisibleMs === ms ? "primary" : "secondary"}
                  onClick={() => setDraft({ ...draft, minVisibleMs: ms })}
                >
                  {(ms / 1000).toFixed(1)}초
                </AdminActionButton>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <AdminActionButton
              variant="secondary"
              disabled={busy || !dirty}
              onClick={() => void persist(draft)}
              data-system-start-save="1"
            >
              {busy ? "저장 중…" : "저장"}
            </AdminActionButton>
            <AdminActionButton
              variant="primary"
              disabled={busy || dirty}
              onClick={() => void applyLive()}
              data-system-start-apply="1"
            >
              {busy ? "적용 중…" : "적용"}
            </AdminActionButton>
          </div>
          <p className="text-xs text-sam-muted">
            저장 = durable 초안. 적용 = Layer B Live — 다음 콜드 스타트부터
            표시됩니다. 미저장 변경이 있으면 적용할 수 없습니다.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-ui-rect border-2 border-emerald-600/40 bg-sam-app p-4 text-sm">
          <div className="font-semibold text-emerald-900">CURRENT LIVE</div>
          <p className="mt-1 text-[11px] text-sam-muted">
            Layer B — 마지막 「적용」이 가리키는 generation (콜드 스타트)
          </p>
          {live.kind === "LIVE" ? (
            <>
              <StatusSummary row={live} />
              <MiniPreview row={live} />
              <p className="mt-2 text-[11px] text-sam-muted">
                generation {live.generationId.slice(0, 8)}…
              </p>
            </>
          ) : (
            <p className="mt-2 text-sam-muted">
              아직 Live Apply 기록이 없습니다. 초안을 저장한 뒤 「적용」하세요.
            </p>
          )}
        </div>

        <div
          className={`rounded-ui-rect border-2 p-4 text-sm ${
            dirty
              ? "border-amber-500/60 bg-sam-app"
              : draftMatchesLive
                ? "border-sky-500/40 bg-sam-app"
                : "border-sam-border bg-sam-app"
          }`}
        >
          <div className="font-semibold text-sam-fg">DRAFT</div>
          <p className="mt-1 text-[11px] text-sam-muted">
            durable desired config — 저장 후 「적용」 대상
          </p>
          <StatusSummary row={draft} dirtyLabel={dirty ? "미저장" : undefined} />
          <MiniPreview row={draft} />
          <p className="mt-3 text-xs font-medium text-sam-fg">
            {dirty
              ? "미저장 변경 — 저장 후 적용하세요."
              : draftMatchesLive
                ? "Live와 초안 일치 — 적용 시 변경 없음"
                : live.kind === "LIVE"
                  ? "Live와 다름 — 「적용」하면 다음 콜드 스타트에 반영"
                  : "저장됨 — 「적용」으로 Live 생성"}
          </p>
        </div>
      </div>

      {installed ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-sm">
          <div className="font-medium text-sam-fg">Layer A — materialized (OS)</div>
          <p className="mt-1 text-[11px] text-sam-muted">
            rev {installed.revision} · 네이티브 빌드 stamp ·{" "}
            {installed.materializedAt}
          </p>
          <p className="mt-1 text-sam-muted">
            배경 <code className="text-sam-fg">{installed.backgroundColor}</code>
            {" · "}
            브랜드{" "}
            {installed.brandAssetEnabled && installed.brandAssetMediaId
              ? `있음 (${installed.brandSizePreset})`
              : "없음"}
          </p>
        </div>
      ) : null}

      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
      {err ? (
        <p className="text-sm text-red-600" role="alert">
          {err}
        </p>
      ) : null}

      {pickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-ui-rect bg-sam-surface p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-sam-fg">
                {pickerTarget === "background"
                  ? "배경 이미지 선택"
                  : "브랜드 이미지 선택"}
              </h3>
              <AdminActionButton
                variant="secondary"
                onClick={() => setPickerOpen(false)}
              >
                닫기
              </AdminActionButton>
            </div>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {mediaItems.map((m) => (
                <li key={m.mediaId}>
                  <button
                    type="button"
                    className="w-full overflow-hidden rounded-ui-rect border border-sam-border text-left hover:border-sky-500"
                    onClick={() =>
                      void selectFromLibrary(
                        m.mediaId,
                        m.previewUrl,
                        pickerTarget,
                      )
                    }
                  >
                    {m.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.previewUrl}
                        alt=""
                        className="h-24 w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-24 items-center justify-center text-xs text-sam-muted">
                        READY
                      </div>
                    )}
                    <p className="truncate p-1 text-[10px] text-sam-muted">
                      {m.originalName}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
            {mediaItems.length === 0 ? (
              <p className="text-sm text-sam-muted">
                미디어 라이브러리가 비어 있습니다.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SystemStartPreviewFrame(props: {
  backgroundColor: string;
  backgroundImageUrl: string | null;
  showLogo: boolean;
  logoUrl: string | null;
  logoPct: number;
  brandXNorm: number;
  brandYNorm: number;
}) {
  const {
    backgroundColor,
    backgroundImageUrl,
    showLogo,
    logoUrl,
    logoPct,
    brandXNorm,
    brandYNorm,
  } = props;
  return (
    <div
      className="relative mx-auto aspect-[9/16] w-full max-w-[240px] overflow-hidden rounded-ui-rect border border-sam-border"
      style={{ backgroundColor }}
      data-system-start-preview="1"
    >
      {backgroundImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={backgroundImageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      {showLogo && logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className="absolute object-contain"
          style={{
            left: `${brandXNorm * 100}%`,
            top: `${brandYNorm * 100}%`,
            transform: "translate(-50%, -50%)",
            width: `${logoPct}%`,
            height: `${logoPct}%`,
          }}
        />
      ) : !backgroundImageUrl ? (
        <div className="flex h-full items-center justify-center text-xs text-white/60">
          {showLogo ? "이미지를 선택하세요" : "배경만"}
        </div>
      ) : null}
    </div>
  );
}

type SummaryRow = {
  revision?: number;
  backgroundColor: string;
  backgroundImageMediaId: string | null;
  brandAssetEnabled: boolean;
  brandAssetMediaId: string | null;
  brandSizePreset: BrandSizePreset;
  minVisibleMs: number;
};

function StatusSummary(props: {
  row: SummaryRow & {
    backgroundImagePreviewUrl?: string | null;
    brandPreviewUrl?: string | null;
  };
  dirtyLabel?: string;
}) {
  const { row, dirtyLabel } = props;
  return (
    <p className="mt-2 text-sam-muted">
      {row.revision != null ? <>rev {row.revision} · </> : null}
      {dirtyLabel ? `${dirtyLabel} · ` : null}
      배경 <code className="text-sam-fg">{row.backgroundColor}</code>
      {" · "}
      BG 이미지 {row.backgroundImageMediaId ? "있음" : "없음"}
      {" · "}
      브랜드{" "}
      {row.brandAssetEnabled && row.brandAssetMediaId
        ? `있음 (${row.brandSizePreset})`
        : "없음"}
      {" · "}
      최소 {(row.minVisibleMs / 1000).toFixed(1)}초
    </p>
  );
}

function MiniPreview(props: {
  row: {
    backgroundColor: string;
    backgroundImagePreviewUrl?: string | null;
    brandAssetEnabled: boolean;
    brandPreviewUrl?: string | null;
    brandSizePreset: BrandSizePreset;
    brandXNorm?: number;
    brandYNorm?: number;
  };
}) {
  const { row } = props;
  const logoPct = Math.round(BRAND_SIZE_NORM[row.brandSizePreset] * 100);
  const x = row.brandXNorm ?? 0.5;
  const y = row.brandYNorm ?? 0.5;
  const showLogo = row.brandAssetEnabled && !!row.brandPreviewUrl;
  return (
    <div
      className="relative mt-2 h-16 w-full overflow-hidden rounded-ui-rect border border-sam-border"
      style={{ backgroundColor: row.backgroundColor }}
    >
      {row.backgroundImagePreviewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={row.backgroundImagePreviewUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      {showLogo && row.brandPreviewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={row.brandPreviewUrl}
          alt=""
          className="absolute object-contain"
          style={{
            left: `${x * 100}%`,
            top: `${y * 100}%`,
            transform: "translate(-50%, -50%)",
            width: `${logoPct * 0.35}%`,
            height: `${logoPct * 0.35}%`,
            minWidth: 16,
            minHeight: 16,
          }}
        />
      ) : null}
    </div>
  );
}

function clampNorm(n: unknown, fallback = 0.5): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(1, Math.max(0, v));
}

function normalizeNext(raw: NextBuildState): NextBuildState {
  const presets = SYSTEM_START_MIN_VISIBLE_PRESETS_MS as readonly number[];
  const ms = Number(raw.minVisibleMs);
  const minVisibleMs = presets.includes(ms) ? ms : 500;
  return {
    revision: Number(raw.revision) || 1,
    backgroundColor: String(raw.backgroundColor || "#312E81").toUpperCase(),
    backgroundImageMediaId: raw.backgroundImageMediaId ?? null,
    backgroundImagePreviewUrl: raw.backgroundImagePreviewUrl ?? null,
    brandAssetEnabled: !!raw.brandAssetEnabled,
    brandAssetMediaId: raw.brandAssetMediaId ?? null,
    brandPreviewUrl: raw.brandPreviewUrl ?? null,
    brandSizePreset:
      raw.brandSizePreset === "S" ||
      raw.brandSizePreset === "M" ||
      raw.brandSizePreset === "L"
        ? raw.brandSizePreset
        : "M",
    brandXNorm: clampNorm(raw.brandXNorm),
    brandYNorm: clampNorm(raw.brandYNorm),
    minVisibleMs,
  };
}

function normalizeInstalled(
  raw: NonNullable<InstalledState>,
): NonNullable<InstalledState> {
  return {
    ...normalizeNext(raw),
    materializedAt: raw.materializedAt,
  };
}

function parseLive(raw: unknown, draftFallback: NextBuildState): LiveState {
  if (!raw || typeof raw !== "object") return { kind: "NO_LIVE" };
  const o = raw as Record<string, unknown>;
  if (o.kind !== "LIVE") return { kind: "NO_LIVE" };
  const config = o.config as Record<string, unknown> | undefined;
  const assetUrls = (o.assetRetrievalUrls ?? {}) as Record<string, string>;
  const bgId =
    (config?.backgroundImageMediaId as string | null | undefined) ?? null;
  const brandId =
    (config?.brandAssetMediaId as string | null | undefined) ?? null;
  const brandEnabled = !!config?.brandAssetEnabled;
  return {
    kind: "LIVE",
    revision: Number(o.revision) || 0,
    generationId: String(o.generationId ?? ""),
    backgroundColor: String(
      config?.backgroundColor ?? draftFallback.backgroundColor,
    ).toUpperCase(),
    backgroundImageMediaId: bgId,
    backgroundImagePreviewUrl: bgId
      ? (assetUrls[bgId] ?? draftFallback.backgroundImagePreviewUrl)
      : null,
    brandAssetEnabled: brandEnabled,
    brandAssetMediaId: brandId,
    brandPreviewUrl: brandId
      ? (assetUrls[brandId] ?? draftFallback.brandPreviewUrl)
      : null,
    brandSizePreset:
      config?.brandSizePreset === "S" ||
      config?.brandSizePreset === "M" ||
      config?.brandSizePreset === "L"
        ? config.brandSizePreset
        : "M",
    brandXNorm: clampNorm(config?.brandXNorm),
    brandYNorm: clampNorm(config?.brandYNorm),
    minVisibleMs: coerceMinVisible(config?.minVisibleMs),
  };
}

function coerceMinVisible(raw: unknown): number {
  const presets = SYSTEM_START_MIN_VISIBLE_PRESETS_MS as readonly number[];
  const n = Math.round(Number(raw));
  return presets.includes(n) ? n : 500;
}

function draftEquals(a: NextBuildState, b: NextBuildState): boolean {
  return (
    a.backgroundColor === b.backgroundColor &&
    a.backgroundImageMediaId === b.backgroundImageMediaId &&
    a.brandAssetEnabled === b.brandAssetEnabled &&
    a.brandAssetMediaId === b.brandAssetMediaId &&
    a.brandSizePreset === b.brandSizePreset &&
    a.brandXNorm === b.brandXNorm &&
    a.brandYNorm === b.brandYNorm &&
    a.minVisibleMs === b.minVisibleMs
  );
}

function liveDraftEquals(live: Extract<LiveState, { kind: "LIVE" }>, draft: NextBuildState): boolean {
  return (
    live.revision === draft.revision &&
    live.backgroundColor === draft.backgroundColor &&
    live.backgroundImageMediaId === draft.backgroundImageMediaId &&
    live.brandAssetEnabled === draft.brandAssetEnabled &&
    live.brandAssetMediaId === draft.brandAssetMediaId &&
    live.brandSizePreset === draft.brandSizePreset &&
    live.brandXNorm === draft.brandXNorm &&
    live.brandYNorm === draft.brandYNorm &&
    live.minVisibleMs === draft.minVisibleMs
  );
}
