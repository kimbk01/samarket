"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { Sam } from "@/lib/ui/css-vars";

type LogoFit = "CONTAIN" | "COVER" | "ORIGINAL";

type SystemStartState = {
  version: number;
  backgroundColor: string;
  matchScene1Appearance: boolean;
  brandMarkEnabled: boolean;
  logoMediaId: string | null;
  logoPreviewUrl?: string | null;
  logoFit?: LogoFit;
  logoSizeNorm?: number;
  logoXNorm?: number;
  logoYNorm?: number;
  minVisibleMs?: number;
  note?: string;
};

type MediaItem = {
  mediaId: string;
  mediaKind: string;
  originalName: string;
  previewUrl: string | null;
};

const FIT_OPTIONS: { value: LogoFit; label: string; hint: string }[] = [
  { value: "ORIGINAL", label: "원본 비율", hint: "ORIGINAL" },
  { value: "CONTAIN", label: "화면 안에 맞춤", hint: "Contain" },
  { value: "COVER", label: "화면 채우기", hint: "Cover" },
];

const DURATION_PRESETS: { ms: number; label: string }[] = [
  { ms: 0, label: "최소" },
  { ms: 300, label: "0.3초" },
  { ms: 500, label: "0.5초" },
  { ms: 800, label: "0.8초" },
  { ms: 1000, label: "1.0초" },
];

/**
 * Independent OS System Start editor (build-bound).
 * Preview reflects next app version appearance — never claims Live Apply.
 */
export function IntroSystemStartPanel() {
  const [installed, setInstalled] = useState<SystemStartState | null>(null);
  const [draft, setDraft] = useState<SystemStartState | null>(null);
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
        systemStart?: SystemStartState;
        error?: string;
      };
      if (!json.ok || !json.systemStart) {
        setErr(json.error ?? "load_failed");
        return;
      }
      const next = normalizeState(json.systemStart);
      setInstalled(next);
      setDraft(next);
    })();
  }, []);

  async function loadMedia() {
    const res = await fetch("/api/admin/intro/media", { cache: "no-store" });
    const json = (await res.json()) as { ok: boolean; items?: MediaItem[] };
    if (json.ok) setMediaItems(json.items ?? []);
  }

  const dirty = useMemo(() => {
    if (!installed || !draft) return false;
    return (
      draft.backgroundColor !== installed.backgroundColor ||
      draft.logoFit !== installed.logoFit ||
      draft.logoSizeNorm !== installed.logoSizeNorm ||
      draft.logoXNorm !== installed.logoXNorm ||
      draft.logoYNorm !== installed.logoYNorm ||
      draft.brandMarkEnabled !== installed.brandMarkEnabled ||
      draft.logoMediaId !== installed.logoMediaId ||
      draft.minVisibleMs !== installed.minVisibleMs ||
      draft.matchScene1Appearance !== installed.matchScene1Appearance
    );
  }, [installed, draft]);

  if (!draft) {
    return (
      <div className="text-sm text-sam-muted">{err ?? "불러오는 중…"}</div>
    );
  }

  const logoW = Math.round((draft.logoSizeNorm ?? 0.28) * 100);
  const logoX = Math.round((draft.logoXNorm ?? 0.5) * 100);
  const logoY = Math.round((draft.logoYNorm ?? 0.42) * 100);
  const previewUrl = draft.logoPreviewUrl ?? null;
  const showLogo = draft.brandMarkEnabled && !!previewUrl;

  async function persist(next: SystemStartState, clearLogo = false) {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/admin/intro/system-start", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backgroundColor: next.backgroundColor,
          matchScene1Appearance: false,
          brandMarkEnabled: next.brandMarkEnabled,
          logoMediaId: clearLogo ? null : next.logoMediaId,
          clearLogo,
          logoFit: next.logoFit,
          logoSizeNorm: next.logoSizeNorm,
          logoXNorm: next.logoXNorm,
          logoYNorm: next.logoYNorm,
          minVisibleMs: next.minVisibleMs,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        systemStart?: SystemStartState;
        message?: string;
        error?: string;
      };
      if (!json.ok || !json.systemStart) {
        setErr(json.error ?? "save_failed");
        return;
      }
      const saved = normalizeState(json.systemStart);
      setInstalled(saved);
      setDraft(saved);
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
      const next: SystemStartState = {
        ...draft,
        brandMarkEnabled: true,
        logoMediaId: json.item.mediaId,
        logoPreviewUrl: json.item.previewUrl,
      };
      setDraft(next);
      await persist(next);
    } finally {
      setBusy(false);
    }
  }

  async function selectFromLibrary(mediaId: string, previewUrl: string | null) {
    if (!draft) return;
    const next: SystemStartState = {
      ...draft,
      brandMarkEnabled: true,
      logoMediaId: mediaId,
      logoPreviewUrl: previewUrl,
    };
    setDraft(next);
    setPickerOpen(false);
    await persist(next);
  }

  async function deleteLogo() {
    if (!draft) return;
    if (!window.confirm("선택한 로고/이미지를 제거할까요?")) return;
    const next: SystemStartState = {
      ...draft,
      brandMarkEnabled: false,
      logoMediaId: null,
      logoPreviewUrl: null,
    };
    setDraft(next);
    await persist(next, true);
  }

  const objectFit =
    draft.logoFit === "COVER"
      ? "cover"
      : draft.logoFit === "CONTAIN"
        ? "contain"
        : "none";

  return (
    <div className="space-y-6" data-intro13-system-start="1">
      <div>
        <h2 className="text-lg font-semibold text-sam-fg">시스템 시작 화면</h2>
        <p className="mt-1 text-sm text-sam-muted">
          앱 아이콘 직후 OS가 보여주는 독립 화면입니다. Product Intro Scene1과
          다릅니다. 숨은 강제 대기는 없고, Owner가 설정한 최소 표시시간과 Scene1
          준비가 모두 충족되면 바로 넘깁니다.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          <div className="text-xs font-medium text-sam-muted">
            Preview · 다음 앱 버전
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
                className="absolute"
                style={{
                  left: `${logoX}%`,
                  top: `${logoY}%`,
                  width: `${logoW}%`,
                  height: draft.logoFit === "ORIGINAL" ? "auto" : `${logoW}%`,
                  maxHeight: draft.logoFit === "ORIGINAL" ? `${logoW}%` : undefined,
                  transform: "translate(-50%, -50%)",
                  objectFit,
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-white/60">
                {draft.brandMarkEnabled
                  ? "이미지를 선택하세요"
                  : "배경만"}
              </div>
            )}
          </div>
          <p className="text-[11px] text-sam-muted">
            배경 · 로고/이미지 · 맞춤 · 크기 · 위치가 반영됩니다.
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
                  setDraft({ ...draft, backgroundColor: e.target.value.toUpperCase() })
                }
                className="h-9 w-12 cursor-pointer rounded-ui-rect border border-sam-border"
              />
              <input
                className={Sam.input.base}
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
                checked={draft.brandMarkEnabled}
                onChange={(e) => {
                  const on = e.target.checked;
                  setDraft({
                    ...draft,
                    brandMarkEnabled: on,
                    ...(on ? {} : { logoMediaId: draft.logoMediaId }),
                  });
                }}
              />
              이미지 / 로고 사용
            </label>

            {draft.brandMarkEnabled ? (
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
                  <label className="inline-flex">
                    <span className="sr-only">업로드</span>
                    <AdminActionButton
                      variant="secondary"
                      disabled={busy}
                      className="cursor-pointer"
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
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadLogo(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <AdminActionButton
                    variant="danger"
                    disabled={busy || !draft.logoMediaId}
                    onClick={() => void deleteLogo()}
                  >
                    삭제
                  </AdminActionButton>
                </div>

                <div>
                  <div className="mb-1 text-sm font-medium text-sam-fg">맞춤 방식</div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {FIT_OPTIONS.map((opt) => (
                      <AdminActionButton
                        key={opt.value}
                        variant={draft.logoFit === opt.value ? "primary" : "secondary"}
                        onClick={() => setDraft({ ...draft, logoFit: opt.value })}
                      >
                        <span className="flex flex-col items-center leading-tight">
                          <span>{opt.label}</span>
                          <span className="text-[10px] font-normal opacity-70">
                            ({opt.hint})
                          </span>
                        </span>
                      </AdminActionButton>
                    ))}
                  </div>
                </div>

                <label className="block text-sm">
                  <span className="text-sam-muted">크기 {logoW}%</span>
                  <input
                    type="range"
                    min={8}
                    max={80}
                    value={logoW}
                    className="mt-1 w-full"
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        logoSizeNorm: Number(e.target.value) / 100,
                      })
                    }
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="text-sam-muted">가로 위치 {logoX}%</span>
                    <input
                      type="range"
                      min={10}
                      max={90}
                      value={logoX}
                      className="mt-1 w-full"
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          logoXNorm: Number(e.target.value) / 100,
                        })
                      }
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-sam-muted">세로 위치 {logoY}%</span>
                    <input
                      type="range"
                      min={10}
                      max={90}
                      value={logoY}
                      className="mt-1 w-full"
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          logoYNorm: Number(e.target.value) / 100,
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <div className="mb-1 text-sm font-medium text-sam-fg">최소 표시시간</div>
            <p className="mb-2 text-[11px] text-sam-muted">
              SYSTEM_START_MIN_VISIBLE_MS · Scene1 준비와 설정된 최소 시간이 모두
              충족되면 즉시 handoff합니다. 그 이상 기다리지 않습니다.
            </p>
            <div className="flex flex-wrap gap-2">
              {DURATION_PRESETS.map((p) => (
                <AdminActionButton
                  key={p.ms}
                  variant={draft.minVisibleMs === p.ms ? "primary" : "secondary"}
                  onClick={() => setDraft({ ...draft, minVisibleMs: p.ms })}
                >
                  {p.label}
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
          <p className="mt-2 text-sam-muted">
            배경{" "}
            <code className="text-sam-fg">{installed?.backgroundColor ?? "—"}</code>
            {" · "}
            로고 {installed?.brandMarkEnabled && installed.logoMediaId ? "있음" : "없음"}
            {" · "}
            최소{" "}
            {installed?.minVisibleMs
              ? `${(installed.minVisibleMs / 1000).toFixed(1)}초`
              : "최소(플랫폼 준비)"}
          </p>
          <div
            className="relative mt-2 h-16 w-full overflow-hidden rounded-ui-rect border border-sam-border"
            style={{ backgroundColor: installed?.backgroundColor }}
          >
            {installed?.logoPreviewUrl && installed.brandMarkEnabled ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={installed.logoPreviewUrl}
                alt=""
                className="absolute left-1/2 top-1/2 h-8 -translate-x-1/2 -translate-y-1/2 object-contain"
              />
            ) : null}
          </div>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4 text-sm">
          <div className="font-medium text-sam-fg">다음 앱 버전</div>
          <p className="mt-2 text-sam-muted">
            배경 <code className="text-sam-fg">{draft.backgroundColor}</code>
            {" · "}
            로고 {draft.brandMarkEnabled && draft.logoMediaId ? "있음" : "없음"}
            {" · "}
            최소{" "}
            {draft.minVisibleMs
              ? `${(draft.minVisibleMs / 1000).toFixed(1)}초`
              : "최소(플랫폼 준비)"}
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
              : "빌드 입력과 일치"}
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
              <AdminActionButton variant="secondary" onClick={() => setPickerOpen(false)}>
                닫기
              </AdminActionButton>
            </div>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {mediaItems.map((m) => (
                <li key={m.mediaId}>
                  <button
                    type="button"
                    className="w-full overflow-hidden rounded-ui-rect border border-sam-border text-left hover:border-sky-500"
                    onClick={() => void selectFromLibrary(m.mediaId, m.previewUrl)}
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
              <p className="text-sm text-sam-muted">미디어 라이브러리가 비어 있습니다.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function normalizeState(raw: SystemStartState): SystemStartState {
  return {
    ...raw,
    logoMediaId: raw.logoMediaId ?? null,
    logoPreviewUrl: raw.logoPreviewUrl ?? null,
    logoFit: raw.logoFit ?? "CONTAIN",
    logoSizeNorm: raw.logoSizeNorm ?? 0.28,
    logoXNorm: raw.logoXNorm ?? 0.5,
    logoYNorm: raw.logoYNorm ?? 0.42,
    minVisibleMs: raw.minVisibleMs ?? 0,
    brandMarkEnabled: !!raw.brandMarkEnabled,
  };
}
