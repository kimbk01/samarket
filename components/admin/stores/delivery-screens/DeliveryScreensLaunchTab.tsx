"use client";

/**
 * 「배달 화면 구성 › 배달 오픈 관리」 (Owner 「배달 on/off·매장 모집 배너」 2026-11-10 · 설계 v2 §6-1).
 * 정식 운영 / 매장 모집 전환, 기기별 배너 이미지(폰 4:3 · 와이드 2:1), 언어별 문구, 모집 팝업·고객센터 FAB,
 * 오픈 기념 무료 종료일, 기기별 미리보기, 변경 이력. 저장 = 최고관리자, 읽은 revision 으로만(409 시 덮어쓰지 않음).
 * 광고 배너·광고 팝업과 별개 저장소(`delivery_launch_settings`).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliveryRecruitingHero } from "@/components/delivery/launch/DeliveryRecruitingSurface";
import {
  DELIVERY_LAUNCH_IMAGE_SPECS,
  DELIVERY_LAUNCH_LOCALES,
  isDeliveryFreePromoActive,
  type DeliveryLaunchContent,
  type DeliveryLaunchImageKind,
  type DeliveryLaunchLocale,
  type DeliveryLaunchMode,
  type DeliveryLaunchSettings,
  type DeliveryLaunchTexts,
} from "@/lib/delivery/launch/delivery-launch-contract";

type LogRow = {
  revision: number;
  actorId: string | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  createdAt: string;
};

type LoadResponse = {
  ok: boolean;
  error?: string;
  settings?: DeliveryLaunchSettings;
  migrationApplied?: boolean;
  logs?: LogRow[];
  counts?: { visibleStores: number | null; visibleRealStores: number | null; pendingApplications: number | null };
};

type Draft = {
  mode: DeliveryLaunchMode;
  freeUntil: string;
  popupEnabled: boolean;
  fabEnabled: boolean;
  content: DeliveryLaunchContent;
};

function draftFrom(s: DeliveryLaunchSettings): Draft {
  return {
    mode: s.mode,
    freeUntil: s.freeUntil ?? "",
    popupEnabled: s.popupEnabled,
    fabEnabled: s.fabEnabled,
    content: s.content,
  };
}

function fmtPht(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 16).replace("T", " ")} PHT`;
}

const TEXT_FIELDS: { key: keyof DeliveryLaunchTexts; ko: string; en: string; multiline?: boolean }[] = [
  { key: "badge", ko: "혜택 배지", en: "Benefit badge" },
  { key: "title", ko: "제목 (매장 모집 시 한국어 필수)", en: "Title (Korean required when recruiting)" },
  { key: "body", ko: "설명", en: "Description", multiline: true },
  { key: "schedule", ko: "오픈 일정 문구", en: "Opening schedule" },
  { key: "applyLabel", ko: "신청 버튼 (이동: 매장 신청)", en: "Apply button (→ store application)" },
  { key: "inquiryLabel", ko: "문의 버튼 (입점 문의)", en: "Inquiry button (partnership inquiry)" },
  { key: "popupTitle", ko: "팝업 제목 (비우면 배너 제목)", en: "Popup title (blank = banner title)" },
  { key: "popupBody", ko: "팝업 설명 (비우면 배너 설명)", en: "Popup text (blank = banner text)", multiline: true },
];

const IMAGE_FIELD: Record<DeliveryLaunchImageKind, keyof Pick<DeliveryLaunchContent, "mobileImageUrl" | "wideImageUrl" | "popupImageUrl">> = {
  mobile: "mobileImageUrl",
  wide: "wideImageUrl",
  popup: "popupImageUrl",
};

const IMAGE_LABEL: Record<DeliveryLaunchImageKind, { ko: string; en: string }> = {
  mobile: { ko: "폰 이미지 (필수)", en: "Phone image (required)" },
  wide: { ko: "와이드 이미지 (태블릿·PC·Windows, 선택)", en: "Wide image (tablet·PC·Windows, optional)" },
  popup: { ko: "팝업 이미지 (선택)", en: "Popup image (optional)" },
};

const ERROR_KO: Record<string, string> = {
  stale_revision: "다른 관리자가 먼저 저장했어요. 새로 불러온 뒤 다시 저장하세요.",
  super_admin_only: "최고관리자만 저장할 수 있어요.",
  title_required_for_recruiting: "매장 모집으로 바꾸려면 한국어 제목을 넣어 주세요.",
  invalid_free_until: "무료 종료일 형식이 올바르지 않아요.",
  migration_not_applied: "운영 DB 에 아직 적용되지 않은 기능이에요 (마이그레이션 적용 필요).",
  image_too_small: "이미지가 최소 크기보다 작아요.",
  image_ratio_mismatch: "이미지 비율이 맞지 않아요 (±8%).",
  file_too_large: "2MB 이하 이미지만 올릴 수 있어요.",
  invalid_type: "JPG·PNG·WebP 만 올릴 수 있어요.",
};

export function DeliveryScreensLaunchTab() {
  const { language } = useI18n();
  const ko = language === "ko";
  const [loaded, setLoaded] = useState<LoadResponse | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [revision, setRevision] = useState(0);
  const [locale, setLocale] = useState<DeliveryLaunchLocale>("ko");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<DeliveryLaunchImageKind | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const errText = useCallback(
    (code: string | undefined) => (ko ? ERROR_KO[code ?? ""] : null) ?? code ?? (ko ? "실패했어요" : "Failed"),
    [ko]
  );

  const load = useCallback(async () => {
    setMessage(null);
    try {
      const res = await fetch("/api/admin/delivery-launch", { cache: "no-store" });
      const json = (await res.json()) as LoadResponse;
      setLoaded(json);
      if (json.ok && json.settings) {
        setDraft(draftFrom(json.settings));
        setRevision(json.settings.revision);
      }
    } catch {
      setLoaded({ ok: false, error: "network" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setText = (key: keyof DeliveryLaunchTexts, value: string) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            content: {
              ...d.content,
              texts: { ...d.content.texts, [locale]: { ...d.content.texts[locale], [key]: value } },
            },
          }
        : d
    );

  const upload = async (kind: DeliveryLaunchImageKind, file: File) => {
    setUploading(kind);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("file", file);
      const res = await fetch("/api/admin/delivery-launch/upload-image", { method: "POST", body: fd });
      const json = (await res.json()) as { ok?: boolean; url?: string; error?: string; width?: number; height?: number };
      if (!json.ok || !json.url) {
        const size = json.width && json.height ? ` (${json.width}×${json.height})` : "";
        setMessage({ tone: "error", text: `${errText(json.error)}${size}` });
        return;
      }
      setDraft((d) => (d ? { ...d, content: { ...d.content, [IMAGE_FIELD[kind]]: json.url } } : d));
    } catch {
      setMessage({ tone: "error", text: errText("network") });
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/delivery-launch", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: revision,
          mode: draft.mode,
          freeUntil: draft.freeUntil || null,
          popupEnabled: draft.popupEnabled,
          fabEnabled: draft.fabEnabled,
          content: draft.content,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; revision?: number };
      if (!json.ok) {
        setMessage({ tone: "error", text: errText(json.error) });
        return;
      }
      setMessage({ tone: "ok", text: ko ? `저장했어요 (버전 r${json.revision})` : `Saved (r${json.revision})` });
      await load();
    } catch {
      setMessage({ tone: "error", text: errText("network") });
    } finally {
      setSaving(false);
    }
  };

  const previewState = useMemo(
    () =>
      draft
        ? {
            mode: "recruiting" as const,
            freeUntil: draft.freeUntil || null,
            freePromoActive: isDeliveryFreePromoActive(draft.freeUntil || null),
            popupEnabled: draft.popupEnabled,
            fabEnabled: draft.fabEnabled,
            content: draft.content,
          }
        : null,
    [draft]
  );

  if (!loaded) {
    return <p className="py-6 text-[13px] text-sam-muted">{ko ? "불러오는 중…" : "Loading…"}</p>;
  }
  if (!loaded.ok || !draft) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-[13px]">
        <p>{errText(loaded.error)}</p>
        <button type="button" className="mt-2 underline" onClick={() => void load()}>
          {ko ? "다시 불러오기" : "Reload"}
        </button>
      </div>
    );
  }

  const settings = loaded.settings;
  const texts = draft.content.texts[locale];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]" data-admin-delivery-launch="1">
      <div className="grid content-start gap-4">
        {loaded.migrationApplied === false ? (
          <p className="rounded-ui-rect border border-sam-warning/40 bg-sam-warning-soft px-3 py-2 text-[12px]">
            {ko
              ? "운영 DB 에 배달 오픈 관리 테이블이 아직 없어요. 지금은 「정식 운영」으로 동작하고 저장할 수 없어요 (Owner 승인 후 마이그레이션 적용)."
              : "Delivery launch table is not in the production DB yet. Running as open; saving is disabled until the migration is applied."}
          </p>
        ) : null}

        <section className="grid gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h3 className="text-[14px] font-bold">{ko ? "배달 상태" : "Delivery status"}</h3>
          <div className="grid grid-cols-2 overflow-hidden rounded-ui-rect border border-sam-border" role="radiogroup">
            {(["open", "recruiting"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={draft.mode === m}
                onClick={() => setDraft({ ...draft, mode: m })}
                className={`grid gap-0.5 p-3 text-left ${draft.mode === m ? "bg-sam-primary text-white" : "bg-sam-surface"}`}
                data-delivery-launch-mode={m}
              >
                <b className="text-[13px]">{m === "open" ? (ko ? "정식 운영" : "Open") : ko ? "매장 모집" : "Recruiting stores"}</b>
                <small className="text-[11.5px] opacity-80">
                  {m === "open"
                    ? ko
                      ? "매장 목록 그대로, 주문 가능. 배너·팝업·FAB 없음"
                      : "Store list as is, ordering on. No banner/popup/FAB"
                    : ko
                      ? "큰 배너 + 목록 흐림 + 팝업 + FAB, 고객 주문 막힘"
                      : "Big banner + dimmed list + popup + FAB, customer orders blocked"}
                </small>
              </button>
            ))}
          </div>
          <p className="text-[12px] text-sam-muted">
            {ko
              ? "모드와 상관없이 매장 신청·사장님 화면·본인 매장 보기·운영 공지·입점 문의는 항상 됩니다."
              : "Store applications, owner pages, own-store preview, owner notices and partnership inquiries always work."}
          </p>
        </section>

        <section className="grid gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h3 className="text-[14px] font-bold">{ko ? "모집 배너 · 팝업 이미지" : "Banner & popup images"}</h3>
          {(["mobile", "wide", "popup"] as const).map((kind) => {
            const spec = DELIVERY_LAUNCH_IMAGE_SPECS[kind];
            const url = draft.content[IMAGE_FIELD[kind]];
            return (
              <div key={kind} className="flex min-w-0 items-center gap-3 rounded-ui-rect border border-dashed border-sam-border p-2.5">
                <div
                  className="h-[54px] shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted"
                  style={{ aspectRatio: `${spec.ratioW} / ${spec.ratioH}` }}
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 어드민 미리보기
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 text-[12px]">
                  <b>{ko ? IMAGE_LABEL[kind].ko : IMAGE_LABEL[kind].en}</b>
                  <p className="text-sam-muted">
                    {spec.ratioLabel} · {ko ? "권장" : "rec."} {spec.recommendedWidth}×{spec.recommendedHeight} ·{" "}
                    {ko ? "최소" : "min"} {spec.minWidth}×{spec.minHeight}
                  </p>
                  <div className="mt-1 flex gap-3">
                    <label className="cursor-pointer underline">
                      {uploading === kind ? (ko ? "올리는 중…" : "Uploading…") : url ? (ko ? "바꾸기" : "Replace") : ko ? "올리기" : "Upload"}
                      <input
                        id={`delivery-launch-upload-${kind}`}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        disabled={uploading != null}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void upload(kind, f);
                        }}
                      />
                    </label>
                    {url ? (
                      <button
                        type="button"
                        className="text-sam-muted underline"
                        onClick={() => setDraft({ ...draft, content: { ...draft.content, [IMAGE_FIELD[kind]]: "" } })}
                      >
                        {ko ? "지우기" : "Remove"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
          <p className="text-[11.5px] text-sam-muted">
            {ko
              ? "JPG·PNG·WebP · 2MB 이하 · 비율 ±8% · 저장 시 WebP 로 변환 · 문구는 이미지에 넣지 말고 아래 칸에 (로고는 가운데 80% 안)"
              : "JPG/PNG/WebP · ≤2MB · ratio ±8% · converted to WebP · put text in the fields below, not in the image"}
          </p>
        </section>

        <section className="grid gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[14px] font-bold">{ko ? "문구" : "Copy"}</h3>
            <div className="flex gap-1">
              {DELIVERY_LAUNCH_LOCALES.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLocale(l)}
                  className={`rounded-ui-rect border px-2.5 py-1 text-[12px] ${locale === l ? "border-sam-primary bg-sam-primary text-white" : "border-sam-border"}`}
                >
                  {l === "ko" ? "한국어" : "English"}
                </button>
              ))}
            </div>
          </div>
          {locale === "en" ? (
            <p className="text-[11.5px] text-sam-muted">{ko ? "빈 칸은 한국어로 표시돼요." : "Blank fields fall back to Korean."}</p>
          ) : null}
          {TEXT_FIELDS.map((f) => (
            <label key={f.key} className="grid gap-1 text-[12px] text-sam-muted">
              {ko ? f.ko : f.en}
              {f.multiline ? (
                <textarea
                  id={`delivery-launch-${locale}-${f.key}`}
                  rows={2}
                  value={texts[f.key]}
                  onChange={(e) => setText(f.key, e.target.value)}
                  className="rounded-ui-rect border border-sam-border bg-sam-app px-2.5 py-2 text-[13px] text-sam-fg"
                />
              ) : (
                <input
                  id={`delivery-launch-${locale}-${f.key}`}
                  value={texts[f.key]}
                  onChange={(e) => setText(f.key, e.target.value)}
                  className="rounded-ui-rect border border-sam-border bg-sam-app px-2.5 py-2 text-[13px] text-sam-fg"
                />
              )}
            </label>
          ))}
        </section>

        <section className="grid gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h3 className="text-[14px] font-bold">{ko ? "모집 팝업 · 고객센터 FAB" : "Popup & support FAB"}</h3>
          <label className="flex items-center justify-between gap-3 text-[13px]">
            <span>{ko ? "배달 첫 화면 진입 시 팝업 (오늘 하루 보지 않기 포함)" : "Show popup on delivery home (with 'hide today')"}</span>
            <input
              id="delivery-launch-popup-enabled"
              type="checkbox"
              checked={draft.popupEnabled}
              onChange={(e) => setDraft({ ...draft, popupEnabled: e.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-[13px]">
            <span>{ko ? "고객센터 FAB (문의 유형: 매장 입점 문의)" : "Support FAB (topic: store partnership)"}</span>
            <input
              id="delivery-launch-fab-enabled"
              type="checkbox"
              checked={draft.fabEnabled}
              onChange={(e) => setDraft({ ...draft, fabEnabled: e.target.checked })}
            />
          </label>
          <p className="text-[11.5px] text-sam-muted">
            {ko
              ? "매장 모집 중에는 배달 첫 화면에서 광고 팝업을 띄우지 않아요. 정식 운영으로 바꾸면 배너·팝업·FAB 가 함께 사라져요."
              : "While recruiting, ad popups are not shown on the delivery home. Switching to open removes banner, popup and FAB."}
          </p>
        </section>

        <section className="grid gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h3 className="text-[14px] font-bold">{ko ? "오픈 기념 무료" : "Launch free period"}</h3>
          <label className="grid gap-1 text-[12px] text-sam-muted">
            {ko ? "무료 종료일 (필리핀 날짜 · 비우면 신청서에 무료 문구 없음)" : "Free until (PH date · blank = no free offer)"}
            <input
              id="delivery-launch-free-until"
              type="date"
              value={draft.freeUntil}
              onChange={(e) => setDraft({ ...draft, freeUntil: e.target.value })}
              className="w-fit rounded-ui-rect border border-sam-border bg-sam-app px-2.5 py-2 text-[13px] text-sam-fg"
            />
          </label>
          <p className="text-[11.5px] text-sam-muted">
            {ko
              ? "무료는 모드가 아니라 이 날짜로 끝나요. 이후에는 업종별 수수료 정책을 따릅니다."
              : "The free period ends on this date regardless of mode; category fee policies apply afterwards."}
          </p>
        </section>

        {message ? (
          <p
            role="status"
            className={`rounded-ui-rect px-3 py-2 text-[13px] ${message.tone === "ok" ? "bg-sam-primary-soft text-sam-primary" : "bg-sam-warning-soft text-sam-fg"}`}
          >
            {message.text}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded-ui-rect border border-sam-border px-4 py-2 text-[13px] font-bold"
            onClick={() => settings && setDraft(draftFrom(settings))}
            disabled={saving}
          >
            {ko ? "되돌리기" : "Revert"}
          </button>
          <button
            type="button"
            className="rounded-ui-rect bg-sam-primary px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
            onClick={() => void save()}
            disabled={saving || loaded.migrationApplied === false}
            data-delivery-launch-save
          >
            {saving ? (ko ? "저장 중…" : "Saving…") : ko ? "저장" : "Save"}
          </button>
        </div>
        <p className="text-[11.5px] text-sam-muted">
          {ko
            ? `저장 버전 r${revision}${settings?.updatedAt ? ` · 마지막 저장 ${fmtPht(settings.updatedAt)}` : ""} · 읽은 버전으로만 저장돼요.`
            : `Revision r${revision}${settings?.updatedAt ? ` · last saved ${fmtPht(settings.updatedAt)}` : ""}`}
        </p>
      </div>

      <div className="grid content-start gap-4">
        <section className="grid gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h3 className="text-[14px] font-bold">{ko ? "기기별 미리보기 (매장 모집 화면)" : "Preview by device (recruiting)"}</h3>
          {previewState ? (
            <div className="grid gap-3 overflow-x-auto">
              <div>
                <p className="mb-1 text-[11.5px] text-sam-muted">{ko ? "폰 (375)" : "Phone (375)"}</p>
                <div className="w-[343px] max-w-full" inert>
                  <DeliveryRecruitingHero state={previewState} />
                </div>
              </div>
              <div>
                <p className="mb-1 text-[11.5px] text-sam-muted">
                  {ko ? "태블릿·PC·Windows (배달 본문 736)" : "Tablet·PC·Windows (736 content)"}
                  {!draft.content.wideImageUrl
                    ? ko
                      ? " · 와이드 이미지 없음 → 폰 이미지를 잘라 사용"
                      : " · no wide image → phone image cropped"
                    : ""}
                </p>
                <div className="w-[736px]" inert>
                  <DeliveryRecruitingHero state={previewState} />
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="grid gap-1.5 rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-[12.5px]">
          <h3 className="text-[14px] font-bold">{ko ? "지금 상태" : "Current status"}</h3>
          <p>
            {ko ? "고객 노출 매장" : "Visible stores"} <b>{loaded.counts?.visibleStores ?? "—"}</b> · {ko ? "그중 실매장" : "real"}{" "}
            <b>{loaded.counts?.visibleRealStores ?? "—"}</b>
          </p>
          <p>
            {ko ? "입점 심사 대기(대기·심사·보완)" : "Applications under review"} <b>{loaded.counts?.pendingApplications ?? "—"}</b>
          </p>
          <p>
            {ko ? "저장된 상태" : "Saved mode"}{" "}
            <b>{settings?.mode === "recruiting" ? (ko ? "매장 모집" : "Recruiting") : ko ? "정식 운영" : "Open"}</b>
          </p>
        </section>

        <section className="grid gap-1.5 rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-[12px]">
          <h3 className="text-[14px] font-bold">{ko ? "변경 이력" : "History"}</h3>
          {(loaded.logs ?? []).length === 0 ? (
            <p className="text-sam-muted">{ko ? "아직 없어요" : "None yet"}</p>
          ) : (
            (loaded.logs ?? []).map((l) => (
              <div key={l.revision} className="flex flex-wrap justify-between gap-2 border-b border-dashed border-sam-border pb-1">
                <span>
                  r{l.revision} · {String(l.before.mode ?? "—")} → {String(l.after.mode ?? "—")}
                  {l.before.free_until !== l.after.free_until ? ` · ${ko ? "무료 종료" : "free until"} ${String(l.after.free_until ?? "—")}` : ""}
                </span>
                <span className="font-mono text-sam-muted">
                  {fmtPht(l.createdAt)} · {l.actorId ? l.actorId.slice(0, 8) : "—"}
                </span>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
