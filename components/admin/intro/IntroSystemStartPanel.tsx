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
  brandAssetEnabled: boolean;
  brandAssetMediaId: string | null;
  brandPreviewUrl: string | null;
  brandSizePreset: BrandSizePreset;
  minVisibleMs: number;
};

type InstalledState = {
  revision: number;
  backgroundColor: string;
  brandAssetEnabled: boolean;
  brandAssetMediaId: string | null;
  brandPreviewUrl: string | null;
  brandSizePreset: BrandSizePreset;
  minVisibleMs: number;
  materializedAt: string;
} | null;

type MediaItem = {
  mediaId: string;
  mediaKind: string;
  originalName: string;
  previewUrl: string | null;
};

const SIZE_OPTIONS: { value: BrandSizePreset; label: string }[] = [
  { value: "S", label: "작게 (S)" },
  { value: "M", label: "보통 (M)" },
  { value: "L", label: "크게 (L)" },
];

/**
 * System Start Admin — F1/F2 frozen capability only.
 * No free x/y, arbitrary fit, full-bleed BG image, or minVisibleMs=0.
 */
export function IntroSystemStartPanel() {
  const [installed, setInstalled] = useState<InstalledState>(null);
  const [draft, setDraft] = useState<NextBuildState | null>(null);
  const [saved, setSaved] = useState<NextBuildState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/intro/system-start", { cache: "no-store" });
      const json = (await res.json()) as {
        ok: boolean;
        nextBuild?: NextBuildState;
        installed?: InstalledState;
        error?: string;
      };
      if (!json.ok || !json.nextBuild) {
        setErr(json.error ?? "load_failed");
        return;
      }
      const next = normalizeNext(json.nextBuild);
      setDraft(next);
      setSaved(next);
      setInstalled(json.installed ? normalizeInstalled(json.installed) : null);
    })();
  }, []);

  async function loadMedia() {
    const res = await fetch("/api/admin/intro/media", { cache: "no-store" });
    const json = (await res.json()) as { ok: boolean; items?: MediaItem[] };
    if (json.ok) setMediaItems(json.items ?? []);
  }

  const dirty = useMemo(() => {
    if (!saved || !draft) return false;
    return (
      draft.backgroundColor !== saved.backgroundColor ||
      draft.brandAssetEnabled !== saved.brandAssetEnabled ||
      draft.brandAssetMediaId !== saved.brandAssetMediaId ||
      draft.brandSizePreset !== saved.brandSizePreset ||
      draft.minVisibleMs !== saved.minVisibleMs
    );
  }, [saved, draft]);

  if (!draft) {
    return (
      <div className="text-sm text-sam-muted">{err ?? "불러오는 중…"}</div>
    );
  }

  const sizeNorm = BRAND_SIZE_NORM[draft.brandSizePreset];
  const logoPct = Math.round(sizeNorm * 100);
  const previewUrl = draft.brandPreviewUrl;
  const showLogo = draft.brandAssetEnabled && !!previewUrl;

  async function persist(next: NextBuildState, clearBrand = false) {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/admin/intro/system-start", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backgroundColor: next.backgroundColor,
          brandAssetEnabled: next.brandAssetEnabled,
          brandAssetMediaId: clearBrand ? null : next.brandAssetMediaId,
          clearBrandAsset: clearBrand,
          brandSizePreset: next.brandSizePreset,
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
          "다음 앱 버전 설정이 저장되었습니다. 앱 업데이트가 필요합니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function uploadLogo(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("asLogo", "1");
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
      const next: NextBuildState = {
        ...draft,
        brandAssetEnabled: true,
        brandAssetMediaId: json.item.mediaId,
        brandPreviewUrl: json.item.previewUrl,
      };
      setDraft(next);
      await persist(next);
    } finally {
      setBusy(false);
    }
  }

  async function selectFromLibrary(mediaId: string, previewUrl: string | null) {
    if (!draft) return;
    const next: NextBuildState = {
      ...draft,
      brandAssetEnabled: true,
      brandAssetMediaId: mediaId,
      brandPreviewUrl: previewUrl,
    };
    setDraft(next);
    setPickerOpen(false);
    await persist(next);
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
    await persist(next, true);
  }

  return (
    <div className="space-y-6" data-intro13-system-start="1">
      <div>
        <h2 className="text-lg font-semibold text-sam-fg">시스템 시작 화면</h2>
        <p className="mt-1 text-sm text-sam-muted">
          앱 아이콘 직후 OS/앱 연속 화면입니다. Product Intro와 다릅니다. 배경색 ·
          브랜드 이미지 · 크기 프리셋 · 최소 표시시간만 설정할 수 있습니다. 자유
          위치·맞춤·전체 배경 이미지는 플랫폼 공통 capability가 아니므로 제공하지
          않습니다.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          <div className="text-xs font-medium text-sam-muted">
            빌드 미리보기 (OS 한계 반영)
          </div>
          <div
            className="relative mx-auto aspect-[9/16] w-full max-w-[240px] overflow-hidden rounded-ui-rect border border-sam-border"
            style={{ backgroundColor: draft.backgroundColor }}
            data-system-start-preview="1"
          >
            {showLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl!}
                alt=""
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain"
                style={{ width: `${logoPct}%`, height: `${logoPct}%` }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-white/60">
                {draft.brandAssetEnabled ? "이미지를 선택하세요" : "배경만"}
              </div>
            )}
          </div>
          <p className="text-[11px] text-sam-muted">
            중앙 브랜드 마크 · 배경색 · 크기 프리셋만 반영됩니다.
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
                    onClick={() => {
                      void loadMedia().then(() => setPickerOpen(true));
                    }}
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
                      if (f) void uploadLogo(f);
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

          <AdminActionButton
            variant="primary"
            disabled={busy || !dirty}
            onClick={() => void persist(draft)}
            data-system-start-save="1"
          >
            {busy ? "저장 중…" : "다음 앱 버전 설정 저장"}
          </AdminActionButton>
          <p className="text-xs text-sam-muted">
            저장해도 현재 설치 앱은 바뀌지 않습니다. 앱 업데이트가 필요합니다.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4 text-sm">
          <div className="font-medium text-sam-fg">현재 설치 앱</div>
          {installed ? (
            <>
              <p className="mt-2 text-sam-muted">
                rev {installed.revision} · 배경{" "}
                <code className="text-sam-fg">{installed.backgroundColor}</code>
                {" · "}
                브랜드{" "}
                {installed.brandAssetEnabled && installed.brandAssetMediaId
                  ? `있음 (${installed.brandSizePreset})`
                  : "없음"}
                {" · "}
                최소 {(installed.minVisibleMs / 1000).toFixed(1)}초
              </p>
              <div
                className="relative mt-2 h-16 w-full overflow-hidden rounded-ui-rect border border-sam-border"
                style={{ backgroundColor: installed.backgroundColor }}
              >
                {installed.brandPreviewUrl && installed.brandAssetEnabled ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={installed.brandPreviewUrl}
                    alt=""
                    className="absolute left-1/2 top-1/2 h-8 -translate-x-1/2 -translate-y-1/2 object-contain"
                  />
                ) : null}
              </div>
            </>
          ) : (
            <p className="mt-2 text-sam-muted">
              아직 네이티브 빌드로 반영된 기록이 없습니다. 다음 앱 빌드 후
              표시됩니다.
            </p>
          )}
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4 text-sm">
          <div className="font-medium text-sam-fg">다음 앱 버전</div>
          <p className="mt-2 text-sam-muted">
            rev {draft.revision}
            {dirty ? " (미저장 변경)" : ""} · 배경{" "}
            <code className="text-sam-fg">{draft.backgroundColor}</code>
            {" · "}
            브랜드{" "}
            {draft.brandAssetEnabled && draft.brandAssetMediaId
              ? `있음 (${draft.brandSizePreset})`
              : "없음"}
            {" · "}
            최소 {(draft.minVisibleMs / 1000).toFixed(1)}초
          </p>
          <div
            className="relative mt-2 h-16 w-full overflow-hidden rounded-ui-rect border border-sam-border"
            style={{ backgroundColor: draft.backgroundColor }}
          >
            {showLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl!}
                alt=""
                className="absolute left-1/2 top-1/2 h-8 -translate-x-1/2 -translate-y-1/2 object-contain"
              />
            ) : null}
          </div>
          <p className="mt-3 text-xs font-medium text-amber-800">
            {dirty
              ? "다음 앱 버전에 적용될 설정입니다. 앱 업데이트가 필요합니다."
              : "Durable SSOT와 일치"}
          </p>
        </div>
      </div>

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
              <h3 className="font-semibold text-sam-fg">미디어에서 선택</h3>
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
                      void selectFromLibrary(m.mediaId, m.previewUrl)
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

function normalizeNext(raw: NextBuildState): NextBuildState {
  return {
    revision: Number(raw.revision) || 1,
    backgroundColor: String(raw.backgroundColor || "#312E81").toUpperCase(),
    brandAssetEnabled: !!raw.brandAssetEnabled,
    brandAssetMediaId: raw.brandAssetMediaId ?? null,
    brandPreviewUrl: raw.brandPreviewUrl ?? null,
    brandSizePreset:
      raw.brandSizePreset === "S" ||
      raw.brandSizePreset === "M" ||
      raw.brandSizePreset === "L"
        ? raw.brandSizePreset
        : "M",
    minVisibleMs: Math.min(
      5000,
      Math.max(500, Number(raw.minVisibleMs) || 500),
    ),
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
