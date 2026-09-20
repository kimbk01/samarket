"use client";

/**
 * CUT 4 local Admin Event / Distribution operation UX visual proof.
 * Mounts real Admin editor + Dist presentation/banner preview primitives.
 * Dev-only — no Production deploy.
 */

import { useMemo, useState, type ReactNode } from "react";
import { FeedAdFramePreview } from "@/components/ads/FeedAdBannerCarousel";
import { AdminPlatformEventEditorClient } from "@/components/admin/platform-events/AdminPlatformEventEditorClient";
import {
  AdminPlatformPopupPreview,
  type AdminPlatformPopupPreviewSource,
} from "@/components/admin/platform-popup/AdminPlatformPopupPreview";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { PlatformEventDetailContent } from "@/components/platform-events/PlatformEventDetailContent";
import { DeliveryAdBanner } from "@/components/stores/advertising/DeliveryAdBanner";
import { promotionAdminActionLabel } from "@/lib/admin/promotion-operation-actions";
import {
  formatPromotionAdminSchedule,
  promotionOperatorStatusLabel,
  promotionOperatorStatusTone,
  resolveEventOperatorStatus,
  type PromotionOperatorStatus,
} from "@/lib/admin/promotion-operation-status";
import type { PlatformEventRow } from "@/lib/platform-events/types";
import {
  eventBannerImageGuidance,
  eventBannerPlacementLabel,
  eventBannerPresentationLabel,
  listEventBannerPresentations,
} from "@/lib/platform-promotion-distribution/banner-presentation";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";

/** Same sizes as AdminPlatformPopupPreview FRAMES */
const FRAMES = {
  phone: { w: 390, h: 844, label: "Phone" },
  tablet_portrait: { w: 768, h: 1024, label: "Tablet P" },
  tablet_landscape: { w: 1024, h: 768, label: "Tablet L" },
  desktop: { w: 1280, h: 800, label: "Desktop" },
} as const;

type DeviceMode = keyof typeof FRAMES;

type PopupChoice = "artwork" | "card" | "sheet" | "benefit";

const POPUP_CHOICES: Array<{
  id: PopupChoice;
  ko: string;
  hintKo: string;
  presentationType: "center_modal" | "bottom_sheet" | "benefit_dialog";
  creativeMode: "artwork" | "card";
}> = [
  {
    id: "artwork",
    ko: "아트워크",
    hintKo: "투명 배경 가능 · contain · 강제 크롭 없음",
    presentationType: "center_modal",
    creativeMode: "artwork",
  },
  {
    id: "card",
    ko: "카드",
    hintKo: "36:25 · cover · 크롭 가능",
    presentationType: "center_modal",
    creativeMode: "card",
  },
  {
    id: "sheet",
    ko: "하단 시트",
    hintKo: "하단에서 올라오는 시트 미디어 계약",
    presentationType: "bottom_sheet",
    creativeMode: "card",
  },
  {
    id: "benefit",
    ko: "혜택",
    hintKo: "이벤트 혜택 정보 필요",
    presentationType: "benefit_dialog",
    creativeMode: "card",
  },
];

function fixtureSvg(label: string, bg: string, w: number, h: number): string {
  return (
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <rect width="${w}" height="${h}" fill="${bg}"/>
        <text x="${w / 2}" y="${h / 2}" text-anchor="middle" fill="white" font-size="${Math.round(h / 10)}" font-family="sans-serif">${label}</text>
      </svg>`
    )
  );
}

const PROOF_NOW = Date.parse("2026-06-15T12:00:00+08:00");

const STATUS_FIXTURES: Array<{
  id: PromotionOperatorStatus;
  row: { status: string; startsAt: string | null; endsAt: string | null };
}> = [
  { id: "DRAFT", row: { status: "draft", startsAt: null, endsAt: null } },
  {
    id: "SCHEDULED",
    row: {
      status: "published",
      startsAt: "2026-07-01T00:00:00+08:00",
      endsAt: "2026-07-31T00:00:00+08:00",
    },
  },
  {
    id: "ACTIVE",
    row: {
      status: "published",
      startsAt: "2026-06-01T00:00:00+08:00",
      endsAt: "2026-06-30T00:00:00+08:00",
    },
  },
  {
    id: "PAUSED",
    row: {
      status: "unpublished",
      startsAt: "2026-06-01T00:00:00+08:00",
      endsAt: "2026-06-30T00:00:00+08:00",
    },
  },
  {
    id: "ENDED",
    row: {
      status: "published",
      startsAt: "2026-01-01T00:00:00+08:00",
      endsAt: "2026-01-31T00:00:00+08:00",
    },
  },
];

const PREVIEW_EVENT: PlatformEventRow = {
  id: "proof-cut4-event",
  title: "CUT 4 운영 증명 이벤트",
  subtitle: "Admin Event / Dist visual proof",
  heroImageUrl: null,
  heroImagePath: null,
  sections: [
    { type: "text", body: "이벤트 본문 미리보기 — PlatformEventDetailContent" },
    { type: "benefit", title: "2,000원 할인", body: "최소주문 15,000원" },
  ],
  terms: "일부 지역에서는 이용이 제한될 수 있습니다.",
  status: "draft",
  startsAt: "2026-06-01T00:00:00+08:00",
  endsAt: "2026-06-30T00:00:00+08:00",
  timezone: "Asia/Manila",
  ctaLabel: "자세히 보기",
  ctaType: "internal_page",
  ctaTarget: "/market",
  ctaExternalUrl: null,
  publishedAt: null,
  sourceOwnerRequestId: "proof-owner-req-1",
  sourceStoreId: "proof-store-1",
  createdBy: null,
  updatedBy: null,
  createdAt: "2026-06-01T00:00:00+08:00",
  updatedAt: "2026-06-15T00:00:00+08:00",
};

const POPUP_IMAGE = fixtureSvg("Popup", "#0d9488", 720, 500);
const INLINE_IMAGE = fixtureSvg("Inline", "#0369a1", 1200, 400);
const HERO_IMAGE = fixtureSvg("Hero", "#7c3aed", 1560, 640);

function Shot({
  id,
  title,
  children,
  className = "",
}: {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-cut4-shot={id}
      className={`scroll-mt-4 space-y-3 rounded-ui-rect border border-sam-border bg-white p-4 ${className}`}
    >
      <header className="flex flex-wrap items-baseline gap-2 border-b border-sam-border pb-2">
        <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">
          {id}
        </span>
        <h2 className="text-sm font-semibold text-sam-fg">{title}</h2>
      </header>
      {children}
    </section>
  );
}

function ViewportFrame({
  mode,
  children,
}: {
  mode: DeviceMode;
  children: ReactNode;
}) {
  const frame = FRAMES[mode];
  return (
    <div
      className="mx-auto overflow-hidden rounded-2xl border border-sam-border bg-slate-100 shadow-sm"
      style={{ width: Math.min(frame.w, mode === "desktop" ? 720 : 560), maxWidth: "100%" }}
      data-cut4-viewport={mode}
    >
      <div className="border-b border-sam-border bg-white px-2 py-1 text-[10px] text-sam-muted">
        {frame.label} · {frame.w}×{frame.h} (AdminPlatformPopupPreview FRAMES)
      </div>
      <div
        className="overflow-auto bg-sam-app"
        style={{ maxHeight: Math.min(frame.h * 0.55, 480) }}
      >
        {children}
      </div>
    </div>
  );
}

function DistPopupSelectorProof({ benefitEligible }: { benefitEligible: boolean }) {
  const [choice, setChoice] = useState<PopupChoice>("card");
  const active = POPUP_CHOICES.find((c) => c.id === choice) ?? POPUP_CHOICES[1]!;

  const source: AdminPlatformPopupPreviewSource = useMemo(
    () => ({
      campaignId: "cut4-proof-popup",
      creativeId: "cut4-proof-creative",
      imageUrl: POPUP_IMAGE,
      altText: "CUT 4 popup proof",
      ctaHref: "/events/proof-cut4-event",
      ctaType: "event_detail",
      ctaLabel: null,
      title: "CUT 4 팝업 미리보기",
      body: null,
      benefit: benefitEligible
        ? { title: "2,000원 할인", body: "최소주문 15,000원" }
        : null,
      benefitEligible,
      surface: "GLOBAL",
      suppressionMode: "once_per_session",
      suppressionDurationSeconds: null,
      timezone: "Asia/Manila",
      presentationType: active.presentationType,
      frequencyMode: "once_per_session",
      creativeMode: active.creativeMode,
      unsaved: true,
    }),
    [active.creativeMode, active.presentationType, benefitEligible]
  );

  return (
    <div className="space-y-3" data-admin-popup-presentation-selector="1">
      <div className="grid gap-2 sm:grid-cols-2">
        {POPUP_CHOICES.map((c) => {
          const disabled = c.id === "benefit" && !benefitEligible;
          return (
            <button
              key={c.id}
              type="button"
              disabled={disabled}
              className={`rounded-ui-rect border px-3 py-2 text-left text-sm ${
                choice === c.id ? "border-sam-fg bg-sam-fg/5" : "border-sam-border"
              } ${disabled ? "opacity-50" : ""}`}
              data-admin-popup-presentation={c.id}
              onClick={() => {
                if (!disabled) setChoice(c.id);
              }}
            >
              <div className="font-semibold">{c.ko}</div>
              <div className="mt-0.5 text-xs text-sam-muted">{c.hintKo}</div>
              {disabled ? (
                <div
                  className="mt-1 text-xs text-red-600"
                  data-admin-popup-benefit-disabled-reason="1"
                >
                  혜택 정보가 없어 선택할 수 없습니다.
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-sam-muted" data-admin-popup-image-guidance="1">
        {active.hintKo}
      </p>
      <AdminPlatformPopupPreview source={source} />
    </div>
  );
}

function DistBannerProof({
  presentation,
  landscape,
}: {
  presentation: "INLINE_BANNER" | "HERO_BANNER";
  landscape?: boolean;
}) {
  const heroInv = useMemo(() => inventoryViewFromKey("STORES_HOME_HERO"), []);
  const device: DeviceMode = landscape ? "tablet_landscape" : "phone";
  const frame = FRAMES[device];
  const imageUrl = presentation === "INLINE_BANNER" ? INLINE_IMAGE : HERO_IMAGE;

  return (
    <div className="space-y-2" data-admin-banner-presentation={presentation}>
      <p className="text-sm font-semibold">
        {eventBannerPresentationLabel(presentation, "ko")} ·{" "}
        {eventBannerPlacementLabel("TRADE_HOME", "ko")}
      </p>
      <p className="text-xs text-sam-muted" data-admin-banner-image-guidance="1">
        {eventBannerImageGuidance(presentation, "ko")}
      </p>
      <div
        className="mx-auto overflow-hidden rounded-ui-rect border border-sam-border bg-slate-200/50 p-2"
        style={{ width: Math.min(frame.w, 720), maxWidth: "100%" }}
        data-admin-banner-preview-frame={device}
      >
        {presentation === "INLINE_BANNER" ? (
          <FeedAdFramePreview
            density="trade"
            imageUrl={imageUrl}
            headline="CUT 4 Inline proof"
            alt="CUT 4 Inline proof"
          />
        ) : (
          <DeliveryAdBanner
            inventory={heroInv}
            creative={{
              assetUrl: imageUrl,
              headline: "CUT 4 Hero proof",
              alt: "CUT 4 Hero proof",
            }}
            destination={{ href: "/events/proof-cut4-event", ctaLabel: null }}
            adLabel="dibaY"
            renderContext="admin_preview"
            campaignId="cut4-proof-hero"
            exposureToken={null}
          />
        )}
      </div>
      {landscape ? (
        <p className="text-xs font-medium text-sam-muted">가로에서도 노출 (Popup landscape deny 미적용)</p>
      ) : null}
    </div>
  );
}

export function PromotionEventOperationProofClient() {
  const activeStatus = resolveEventOperatorStatus(STATUS_FIXTURES[2]!.row, PROOF_NOW);

  return (
    <div
      className="min-h-screen space-y-6 bg-[var(--admin-console-bg,#f4f6f8)] p-4 text-sam-fg"
      data-admin="1"
      data-cut4-proof="1"
    >
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">
          CUT 4 — Event / Distribution Operation UX Proof
        </h1>
        <p className="text-xs text-sam-muted">
          Local visual harness · real Admin components · no Production deploy · shots 01–40
        </p>
      </header>

      <Shot id="01" title="Event list (operational fixture)">
        <div className="space-y-3" data-admin-platform-events-list="1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold">이벤트</h3>
            <AdminActionLink href="/admin/platform-events/new" variant="primary">
              {promotionAdminActionLabel("CREATE", "ko")}
            </AdminActionLink>
          </div>
          <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
            {STATUS_FIXTURES.map((fx) => {
              const op = resolveEventOperatorStatus(fx.row, PROOF_NOW);
              return (
                <li key={fx.id} className="px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">증명 이벤트 · {fx.id}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-sam-muted">
                        <AdminToneBadge tone={promotionOperatorStatusTone(op)}>
                          {promotionOperatorStatusLabel(op, "ko")}
                        </AdminToneBadge>
                        <span>
                          노출 시작: {formatPromotionAdminSchedule(fx.row.startsAt, "ko")}
                        </span>
                        <span>
                          노출 종료: {formatPromotionAdminSchedule(fx.row.endsAt, "ko")}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <AdminActionButton variant="secondary">
                        {promotionAdminActionLabel("PREVIEW", "ko")}
                      </AdminActionButton>
                      <AdminActionButton variant="secondary">수정</AdminActionButton>
                      <AdminActionButton variant="secondary">
                        {promotionAdminActionLabel("CONFIGURE_EXPOSURE", "ko")}
                      </AdminActionButton>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </Shot>

      <Shot id="02" title="Create Event (AdminPlatformEventEditorClient eventId=new)">
        <AdminPlatformEventEditorClient eventId="new" />
      </Shot>

      <Shot id="03" title="Event basic info (editor section basic)">
        <p className="text-xs text-sam-muted">
          Real editor above includes{" "}
          <code className="rounded bg-slate-100 px-1">data-admin-event-section=&quot;basic&quot;</code>
          — title / subtitle / hero upload.
        </p>
        <div className="rounded-ui-rect border border-dashed border-sam-border p-3 text-sm">
          <p className="font-semibold">기본 정보</p>
          <p className="mt-1 text-sam-muted">이벤트 제목 · 부제 · 히어로 이미지</p>
        </div>
      </Shot>

      <Shot id="04" title="Hero upload guidance">
        <p className="text-sm">
          권장 비율 16:9 · 권장 1200×675 · jpeg/png/webp · 최대 5MB · cover crop
        </p>
        <div className="flex flex-wrap gap-2">
          <AdminActionButton variant="secondary">이미지 교체</AdminActionButton>
          <AdminActionButton variant="quiet">이미지 삭제</AdminActionButton>
        </div>
      </Shot>

      <Shot id="05" title="Event content editor">
        <p className="text-xs text-sam-muted">
          Editor section{" "}
          <code className="rounded bg-slate-100 px-1">content</code> — intro / image / terms.
        </p>
      </Shot>

      <Shot id="06" title="Benefit editor">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
          <p className="font-semibold">혜택 정보</p>
          <p className="text-sm text-sam-muted">2,000원 할인 · 최소주문 15,000원</p>
        </div>
      </Shot>

      <Shot id="07" title="CTA destination editor">
        <p className="text-sm">
          이동 설정 · CTA: 자세히 보기 · 앱 내부 페이지 ·{" "}
          <code className="rounded bg-slate-100 px-1">/market</code>
        </p>
      </Shot>

      <Shot id="08" title="Schedule / status">
        <div className="flex flex-wrap items-center gap-3">
          <AdminToneBadge tone={promotionOperatorStatusTone(activeStatus)}>
            {promotionOperatorStatusLabel(activeStatus, "ko")}
          </AdminToneBadge>
          <span className="text-xs text-sam-muted">Timezone: Asia/Manila</span>
          <span className="text-xs text-sam-muted">
            노출 시작: {formatPromotionAdminSchedule("2026-06-01T00:00:00+08:00", "ko")}
          </span>
          <span className="text-xs text-sam-muted">
            노출 종료: {formatPromotionAdminSchedule("2026-06-30T00:00:00+08:00", "ko")}
          </span>
        </div>
      </Shot>

      <Shot id="09" title="Distribution overview">
        <div
          className="grid gap-2 rounded-ui-rect border border-sam-border bg-sam-app/30 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4"
          data-admin-dist-channel-summary="1"
        >
          {(
            [
              ["popup", "팝업", "꺼짐"],
              ["banner", "배너", "설정됨 (비활성)"],
              ["push", "Push", "꺼짐"],
              ["bell", "앱 알림", "꺼짐"],
            ] as const
          ).map(([key, label, state]) => (
            <div key={key} data-admin-dist-channel-summary-item={key}>
              <span className="font-semibold">{label}</span>: {state}
            </div>
          ))}
        </div>
        <p className="text-xs text-sam-muted">
          각 채널은 독립입니다. 이벤트 게시만으로 푸시가 나가지 않습니다.
        </p>
      </Shot>

      <Shot id="10" title="Popup OFF">
        <p className="text-xs text-sam-muted" data-admin-popup-off="1">
          팝업 꺼짐 — 저장해도 팝업 엔진이 활성화되지 않습니다.
        </p>
      </Shot>

      <Shot id="11" title="Popup ON + presentation selector">
        <DistPopupSelectorProof benefitEligible />
      </Shot>

      <Shot id="12" title="Artwork config / preview">
        <p className="mb-2 text-xs text-sam-muted">{POPUP_CHOICES[0]!.hintKo}</p>
        <AdminPlatformPopupPreview
          source={{
            campaignId: "cut4-artwork",
            creativeId: "c",
            imageUrl: POPUP_IMAGE,
            altText: "artwork",
            ctaHref: "/events/proof",
            ctaType: "event_detail",
            title: "아트워크",
            benefit: null,
            benefitEligible: false,
            surface: "GLOBAL",
            suppressionMode: "once_per_session",
            suppressionDurationSeconds: null,
            timezone: "Asia/Manila",
            presentationType: "center_modal",
            creativeMode: "artwork",
            unsaved: true,
          }}
        />
      </Shot>

      <Shot id="13" title="Card preview">
        <AdminPlatformPopupPreview
          source={{
            campaignId: "cut4-card",
            creativeId: "c",
            imageUrl: POPUP_IMAGE,
            altText: "card",
            ctaHref: "/events/proof",
            ctaType: "event_detail",
            title: "카드",
            benefit: null,
            benefitEligible: false,
            surface: "GLOBAL",
            suppressionMode: "once_per_session",
            suppressionDurationSeconds: null,
            timezone: "Asia/Manila",
            presentationType: "center_modal",
            creativeMode: "card",
            unsaved: true,
          }}
        />
      </Shot>

      <Shot id="14" title="Sheet preview">
        <AdminPlatformPopupPreview
          source={{
            campaignId: "cut4-sheet",
            creativeId: "c",
            imageUrl: POPUP_IMAGE,
            altText: "sheet",
            ctaHref: "/events/proof",
            ctaType: "event_detail",
            title: "하단 시트",
            benefit: null,
            benefitEligible: false,
            surface: "GLOBAL",
            suppressionMode: "once_per_session",
            suppressionDurationSeconds: null,
            timezone: "Asia/Manila",
            presentationType: "bottom_sheet",
            creativeMode: "card",
            unsaved: true,
          }}
        />
      </Shot>

      <Shot id="15" title="Benefit preview">
        <AdminPlatformPopupPreview
          source={{
            campaignId: "cut4-benefit",
            creativeId: "c",
            imageUrl: POPUP_IMAGE,
            altText: "benefit",
            ctaHref: "/events/proof",
            ctaType: "event_detail",
            title: "혜택",
            benefit: { title: "2,000원 할인", body: "최소주문 15,000원" },
            benefitEligible: true,
            surface: "GLOBAL",
            suppressionMode: "once_per_session",
            suppressionDurationSeconds: null,
            timezone: "Asia/Manila",
            presentationType: "benefit_dialog",
            creativeMode: "card",
            unsaved: true,
          }}
        />
      </Shot>

      <Shot id="16" title="Benefit disabled without content">
        <DistPopupSelectorProof benefitEligible={false} />
      </Shot>

      <Shot id="17" title="Banner OFF">
        <p className="text-xs text-sam-muted" data-admin-banner-off="1">
          배너 꺼짐
        </p>
      </Shot>

      <Shot id="18" title="Inline banner config">
        <div className="mb-2 grid gap-2 sm:grid-cols-2" data-admin-banner-presentation-from-registry="1">
          {listEventBannerPresentations().map((value) => (
            <div
              key={value}
              className={`rounded-ui-rect border px-3 py-2 text-sm ${
                value === "INLINE_BANNER" ? "border-sam-fg bg-sam-fg/5" : "border-sam-border"
              }`}
            >
              <div className="font-semibold">{eventBannerPresentationLabel(value, "ko")}</div>
              <div className="mt-0.5 text-xs text-sam-muted">
                {eventBannerImageGuidance(value, "ko")}
              </div>
            </div>
          ))}
        </div>
        <DistBannerProof presentation="INLINE_BANNER" />
      </Shot>

      <Shot id="19" title="Inline tablet-landscape preview">
        <DistBannerProof presentation="INLINE_BANNER" landscape />
      </Shot>

      <Shot id="20" title="Hero banner config">
        <DistBannerProof presentation="HERO_BANNER" />
      </Shot>

      <Shot id="21" title="Hero tablet-landscape preview">
        <DistBannerProof presentation="HERO_BANNER" landscape />
      </Shot>

      <Shot id="22" title="Push config">
        <div className="ml-0 grid max-w-md gap-2" data-admin-push-config="1">
          <label className="block text-sm">
            푸시 제목
            <input
              className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
              defaultValue="CUT 4 Push 제목"
              readOnly
            />
          </label>
          <label className="block text-sm">
            푸시 본문
            <textarea
              className="mt-1 h-16 w-full rounded border border-sam-border px-2 py-1.5"
              defaultValue="저장 ≠ 발송. Push 보내기만 dispatch."
              readOnly
            />
          </label>
        </div>
      </Shot>

      <Shot id="23" title="Push preview">
        <div
          className="max-w-md rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
          data-admin-push-preview="1"
        >
          <p className="text-[11px] font-medium text-sam-muted">dibaY · Push preview</p>
          <p className="mt-1 text-sm font-semibold">CUT 4 Push 제목</p>
          <p className="text-xs text-sam-muted">저장 ≠ 발송. Push 보내기만 dispatch.</p>
        </div>
      </Shot>

      <Shot id="24" title="Bell config">
        <div className="max-w-md grid gap-2" data-admin-bell-config="1">
          <label className="block text-sm">
            알림함 제목
            <input
              className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
              defaultValue="CUT 4 Bell 제목"
              readOnly
            />
          </label>
          <label className="block text-sm">
            알림함 본문
            <textarea
              className="mt-1 h-16 w-full rounded border border-sam-border px-2 py-1.5"
              defaultValue="앱 알림 · Push와 독립"
              readOnly
            />
          </label>
        </div>
      </Shot>

      <Shot id="25" title="Bell preview">
        <div
          className="max-w-md rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
          data-admin-bell-preview="1"
        >
          <p className="text-[11px] font-medium text-sam-muted">Bell · inbox row preview</p>
          <p className="mt-1 text-sm font-semibold">CUT 4 Bell 제목</p>
          <p className="text-xs text-sam-muted">앱 알림 · Push와 독립</p>
        </div>
      </Shot>

      <Shot id="26" title="Event page preview — phone">
        <ViewportFrame mode="phone">
          <PlatformEventDetailContent event={PREVIEW_EVENT} language="ko" />
        </ViewportFrame>
      </Shot>

      <Shot id="27" title="Event page preview — tablet">
        <ViewportFrame mode="tablet_portrait">
          <PlatformEventDetailContent event={PREVIEW_EVENT} language="ko" />
        </ViewportFrame>
      </Shot>

      <Shot id="28" title="Event page preview — desktop">
        <ViewportFrame mode="desktop">
          <PlatformEventDetailContent event={PREVIEW_EVENT} language="ko" />
        </ViewportFrame>
      </Shot>

      <Shot id="29" title="Operational summary">
        <div
          className="space-y-1 rounded-ui-rect border border-sam-border bg-sam-surface/95 px-3 py-2 text-sm"
          data-admin-event-op-summary="1"
        >
          <p>
            이벤트: <strong>{PREVIEW_EVENT.title}</strong>
          </p>
          <p>
            상태:{" "}
            <AdminToneBadge tone={promotionOperatorStatusTone(activeStatus)}>
              {promotionOperatorStatusLabel(activeStatus, "ko")}
            </AdminToneBadge>
          </p>
          <p className="text-xs text-sam-muted">
            기간: {formatPromotionAdminSchedule(PREVIEW_EVENT.startsAt, "ko")} –{" "}
            {formatPromotionAdminSchedule(PREVIEW_EVENT.endsAt, "ko")}
          </p>
          <p className="text-xs text-sam-muted">노출: 팝업 / 히어로 배너</p>
          <p className="text-xs text-sam-muted">위치: 거래 홈</p>
          <p className="text-xs text-sam-muted">이동: 앱 내부 페이지 · /market</p>
          <p className="text-xs text-sam-muted">Push: 미발송</p>
        </div>
      </Shot>

      <Shot id="30" title="Save / Publish / Stop / Push hierarchy">
        <div className="flex flex-wrap gap-2">
          <AdminActionButton variant="primary" data-proof-btn="save">
            {promotionAdminActionLabel("SAVE", "ko")}
          </AdminActionButton>
          <AdminActionButton variant="primary" data-proof-btn="publish">
            {promotionAdminActionLabel("PUBLISH", "ko")}
          </AdminActionButton>
          <AdminActionButton variant="danger" data-proof-btn="stop">
            {promotionAdminActionLabel("PAUSE_STOP", "ko")}
          </AdminActionButton>
          <AdminActionButton variant="danger" data-admin-push-send="1" data-proof-btn="push">
            {promotionAdminActionLabel("SEND_PUSH", "ko")}
          </AdminActionButton>
        </div>
        <p className="text-xs text-sam-muted">SAVE ≠ PUBLISH ≠ SEND · STOP ≠ DELETE</p>
      </Shot>

      {STATUS_FIXTURES.filter((f) => f.id !== "DRAFT").map((fx, i) => {
        const shotId = String(31 + i).padStart(2, "0");
        const op = resolveEventOperatorStatus(fx.row, PROOF_NOW);
        const titles: Record<string, string> = {
          "31": "Scheduled status",
          "32": "Active status",
          "33": "Paused status",
          "34": "Ended status",
        };
        return (
          <Shot key={fx.id} id={shotId} title={titles[shotId] ?? fx.id}>
            <AdminToneBadge tone={promotionOperatorStatusTone(op)}>
              {promotionOperatorStatusLabel(op, "ko")}
            </AdminToneBadge>
            <p className="mt-2 text-xs text-sam-muted">
              resolveEventOperatorStatus → {op} (fixture {fx.row.status})
            </p>
          </Shot>
        );
      })}

      <Shot id="35" title="Validation error">
        <p className="text-sm text-red-600" data-admin-dist-error="1">
          매장을 선택해 주세요.
        </p>
      </Shot>

      <Shot id="36" title="Partial-channel failure">
        <ul
          className="space-y-1 rounded-ui-rect border border-sam-border bg-sam-app/20 p-3 text-xs"
          data-admin-dist-partial-results="1"
        >
          <li data-admin-dist-channel-result="popup" data-ok="1">
            popup: OK
          </li>
          <li data-admin-dist-channel-result="banner" data-ok="0">
            banner: banner_compat_fail
          </li>
          <li data-admin-dist-channel-result="push" data-ok="1">
            push: OK
          </li>
          <li data-admin-dist-channel-result="bell" data-ok="1">
            bell: OK
          </li>
        </ul>
      </Shot>

      <Shot id="37" title="Owner-approved Event context">
        <div
          className="rounded-ui-rect border border-amber-600/40 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          data-admin-event-owner-handoff="1"
        >
          오너 요청에서 승인된 Event 초안 — 요청 채널 ≠ 최종 채널
        </div>
      </Shot>

      <Shot id="38" title="Windows / desktop editor shell">
        <ViewportFrame mode="desktop">
          <div className="space-y-2 p-3 text-sm">
            <p className="font-semibold">Desktop · editor + preview arrangement</p>
            <div className="flex flex-wrap gap-2">
              <AdminActionButton variant="primary">
                {promotionAdminActionLabel("SAVE", "ko")}
              </AdminActionButton>
              <AdminActionButton variant="primary">
                {promotionAdminActionLabel("PUBLISH", "ko")}
              </AdminActionButton>
            </div>
            <PlatformEventDetailContent event={PREVIEW_EVENT} language="ko" />
          </div>
        </ViewportFrame>
      </Shot>

      <Shot id="39" title="Tablet landscape editor shell">
        <ViewportFrame mode="tablet_landscape">
          <div className="space-y-2 p-3 text-sm">
            <p className="font-semibold">Tablet landscape · usable editor + preview</p>
            <DistBannerProof presentation="HERO_BANNER" landscape />
          </div>
        </ViewportFrame>
      </Shot>

      <Shot id="40" title="Tablet portrait editor shell">
        <ViewportFrame mode="tablet_portrait">
          <div className="space-y-2 p-3 text-sm">
            <p className="font-semibold">Tablet portrait · no clipped fields/buttons</p>
            <div className="flex flex-wrap gap-2">
              <AdminActionButton variant="primary">
                {promotionAdminActionLabel("SAVE", "ko")}
              </AdminActionButton>
              <AdminActionButton variant="danger">
                {promotionAdminActionLabel("PAUSE_STOP", "ko")}
              </AdminActionButton>
            </div>
            <PlatformEventDetailContent event={PREVIEW_EVENT} language="ko" />
          </div>
        </ViewportFrame>
      </Shot>
    </div>
  );
}
