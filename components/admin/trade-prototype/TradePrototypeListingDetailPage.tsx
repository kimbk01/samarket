"use client";

import Link from "next/link";
import { useState } from "react";
import { getMockListing } from "./mock-data";
import { TRADE_PROTOTYPE_BASE } from "./trade-prototype-nav";
import { ProtoButton, TradePromoBadge, TradeStatusBadge } from "./trade-prototype-ui";
import { TradePrototypeDeleteFlowMock } from "./TradePrototypeDeleteFlowMock";

const DETAIL_TABS = [
  "개요",
  "상품 정보",
  "판매자",
  "거래",
  "찜",
  "신고",
  "후기",
  "광고·노출",
  "관리 이력",
] as const;

type DetailTab = (typeof DETAIL_TABS)[number];

export function TradePrototypeListingDetailPage({ listingId }: { listingId: string }) {
  const listing = getMockListing(listingId);
  const [tab, setTab] = useState<DetailTab>("개요");
  const [deleteMode, setDeleteMode] = useState<"none" | "soft" | "hard-preview" | "hard-confirm">("none");

  if (!listing) {
    return <p className="sam-text-body text-sam-muted">fixture 없음</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`${TRADE_PROTOTYPE_BASE}/listings`}
            prefetch={false}
            className="sam-text-body-secondary text-signature hover:underline"
          >
            ← 게시물 관리
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="sam-text-page-title font-semibold text-sam-fg">{listing.title}</h1>
            <Link href={`/post/${listing.id}`} prefetch={false} className="sam-text-body-secondary text-signature hover:underline">
              사용자 화면 보기
            </Link>
          </div>
          <p className="mt-1 sam-text-section-title font-semibold tabular-nums text-sam-fg">{listing.price}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <TradeStatusBadge status={listing.status} />
            <span className="inline-flex items-center rounded border border-sam-border px-1.5 py-0.5 sam-text-xxs">
              {listing.visibility === "public" ? "공개" : "비공개"}
            </span>
            <TradePromoBadge active={listing.promoted} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ProtoButton variant="secondary">수정</ProtoButton>
          <ProtoButton variant="secondary">숨기기</ProtoButton>
          <ProtoButton variant="secondary" onClick={() => setDeleteMode("soft")}>
            운영 삭제
          </ProtoButton>
          <ProtoButton variant="ghost">⋯</ProtoButton>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <aside className="lg:col-span-4">
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
            <div className="mb-3 aspect-[4/3] rounded-ui-rect bg-sam-surface-muted" />
            <dl className="grid gap-2 sam-text-body-secondary">
              <div>
                <dt className="sam-text-xxs text-sam-muted">게시물 ID</dt>
                <dd className="font-mono sam-text-xxs break-all">{listing.id}</dd>
              </div>
              <div>
                <dt className="sam-text-xxs text-sam-muted">판매자</dt>
                <dd>
                  {listing.sellerName}{" "}
                  <span className="font-mono text-sam-muted">@{listing.sellerHandle}</span>
                </dd>
              </div>
              <div>
                <dt className="sam-text-xxs text-sam-muted">지역</dt>
                <dd>{listing.region}</dd>
              </div>
              <div>
                <dt className="sam-text-xxs text-sam-muted">등록</dt>
                <dd>{listing.registeredAt}</dd>
              </div>
            </dl>
          </div>

          <div className="mt-3 rounded-ui-rect border border-red-200 bg-red-50/50 p-3">
            <p className="sam-text-body font-semibold text-red-800">위험 영역</p>
            <p className="mt-1 sam-text-xxs text-red-900/80">
              DB 영구 삭제 — dependency preview 계약 미완. 버튼은 NOT_READY mock.
            </p>
            <ProtoButton
              variant="danger"
              size="sm"
              className="mt-2"
              onClick={() => setDeleteMode("hard-preview")}
            >
              영구 삭제 (NOT_READY)
            </ProtoButton>
          </div>
        </aside>

        <div className="lg:col-span-8">
          <div className="mb-3 flex flex-wrap gap-1 border-b border-sam-border pb-2">
            {DETAIL_TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={[
                  "rounded-ui-rect px-2.5 py-1 sam-text-body-secondary",
                  tab === t ? "bg-signature/15 font-medium text-signature" : "text-sam-muted hover:bg-sam-surface-muted",
                ].join(" ")}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            {tab === "개요" ? <OverviewTab listing={listing} /> : null}
            {tab === "상품 정보" ? <ProductInfoTab listing={listing} /> : null}
            {tab === "판매자" ? <SellerTab listing={listing} /> : null}
            {tab === "거래" ? <TradeTab /> : null}
            {tab === "찜" ? <FavoritesTab /> : null}
            {tab === "신고" ? <ReportsTab /> : null}
            {tab === "후기" ? <ReviewsTab /> : null}
            {tab === "광고·노출" ? <AdsTab listing={listing} /> : null}
            {tab === "관리 이력" ? <AuditTab /> : null}
          </div>
        </div>
      </div>

      <TradePrototypeDeleteFlowMock mode={deleteMode} onClose={() => setDeleteMode("none")} listingTitle={listing.title} />
    </div>
  );
}

function OverviewTab({ listing }: { listing: ReturnType<typeof getMockListing> }) {
  if (!listing) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section>
        <h3 className="mb-2 sam-text-body font-semibold">상품 상태</h3>
        <dl className="grid gap-1.5 sam-text-body-secondary">
          <Row label="판매 상태" value={<TradeStatusBadge status={listing.status} />} />
          <Row label="공개 상태" value={listing.visibility === "public" ? "공개" : "비공개"} />
          <Row label="거래 상태" value="negotiating (fixture)" />
          <Row label="광고" value={listing.promoted ? "더 알리기 활성 (fixture)" : "—"} />
          <Row label="신고" value="2건 (fixture)" />
          <Row label="찜" value="— / 집계 미연결" />
          <Row label="채팅" value={String(listing.chats ?? "—")} />
        </dl>
      </section>
      <section>
        <h3 className="mb-2 sam-text-body font-semibold">분류</h3>
        <dl className="grid gap-1.5 sam-text-body-secondary">
          <Row label="주제" value={listing.subject} />
          <Row label="카테고리" value={listing.categoryPath.split(" › ")[0] ?? listing.categoryPath} />
          <Row label="토픽" value={listing.categoryPath.split(" › ")[1] ?? "— (child 없으면 —)"} />
        </dl>
      </section>
    </div>
  );
}

function ProductInfoTab({ listing }: { listing: ReturnType<typeof getMockListing> }) {
  if (!listing) return null;
  return (
    <div className="space-y-4 sam-text-body-secondary">
      <Field label="제목" value={listing.title} editable />
      <Field label="본문" value="(본문 fixture — Admin form은 WRITE UI 복사 금지)" editable />
      <Field label="가격" value={listing.price} editable />
      <Field label="주제 · 카테고리 · 토픽" value={`${listing.subject} / ${listing.categoryPath}`} editable />
      <Field label="옵션 / Composition" value="— / 집계 미연결" editable />
      <Field label="지역" value={listing.region} editable />
      <div className="rounded-ui-rect border border-dashed border-sam-border p-3 sam-text-xxs text-sam-muted">
        잠금: 판매자 user_id · 예약/완료 구매자 ID · 완료 거래 history — 일반 수정 form에서 변경 불가
      </div>
    </div>
  );
}

function SellerTab({ listing }: { listing: ReturnType<typeof getMockListing> }) {
  if (!listing) return null;
  return (
    <div className="space-y-3 sam-text-body-secondary">
      <p className="font-medium text-sam-fg">
        {listing.sellerName} <span className="font-mono sam-text-xxs">@{listing.sellerHandle}</span>
      </p>
      <ProtoButton variant="secondary" size="sm">
        회원 상세 보기
      </ProtoButton>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {[
          ["현재 판매중", "—"],
          ["판매완료", "—"],
          ["숨김", "—"],
          ["받은 신고", "—"],
          ["받은 찜", "—"],
          ["거래 채팅", "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-ui-rect border border-sam-border-soft px-2 py-2">
            <dt className="sam-text-xxs text-sam-muted">{k}</dt>
            <dd className="font-semibold tabular-nums text-sam-muted">{v}</dd>
            <dd className="sam-text-xxs text-sam-muted">집계 미연결</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function TradeTab() {
  return (
    <div className="space-y-4 sam-text-body-secondary">
      <dl className="grid gap-1.5">
        <Row label="예약 구매자" value="—" />
        <Row label="완료 구매자" value="—" />
      </dl>
      <table className="w-full sam-text-body-secondary">
        <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
          <tr>
            <th className="py-2 text-left">구매자</th>
            <th className="py-2 text-left">흐름</th>
            <th className="py-2 text-left"> </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-sam-border-soft">
            <td className="py-2 font-mono sam-text-xxs">user22</td>
            <td className="py-2 font-mono sam-text-xxs">negotiating</td>
            <td className="py-2">
              <ProtoButton variant="ghost" size="sm">
                채팅 보기
              </ProtoButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function FavoritesTab() {
  return (
    <div className="space-y-4">
      <p className="sam-text-body font-semibold">
        현재 찜 <span className="text-sam-muted">— / 집계 미연결</span>
      </p>
      <table className="w-full sam-text-body-secondary">
        <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
          <tr>
            <th className="py-2 text-left">user</th>
            <th className="py-2 text-left">찜한 시각</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={2} className="py-6 text-center text-sam-muted">
              favorites relation query 미연결
            </td>
          </tr>
        </tbody>
      </table>
      <div className="border-t border-sam-border pt-3">
        <h4 className="mb-2 sam-text-body font-semibold">찜 변경 로그</h4>
        <p className="sam-text-xxs text-sam-muted">favorite_audit_log — secondary 영역 (중복 row는 관계 수로 계산하지 않음)</p>
      </div>
    </div>
  );
}

function ReportsTab() {
  return (
    <table className="w-full sam-text-body-secondary">
      <thead className="border-b border-sam-border sam-text-xxs text-sam-muted">
        <tr>
          <th className="py-2 text-left">상태</th>
          <th className="py-2 text-left">사유</th>
          <th className="py-2 text-left">신고자</th>
          <th className="py-2 text-left">시각</th>
          <th className="py-2 text-left">처리</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-sam-border-soft">
          <td className="py-2">
            <span className="rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 sam-text-xxs text-orange-800">대기</span>
          </td>
          <td className="py-2">허위 상품 (fixture)</td>
          <td className="py-2 font-mono sam-text-xxs">user21</td>
          <td className="py-2">—</td>
          <td className="py-2">
            <Link href="/admin/reports" prefetch={false}>
              <ProtoButton variant="secondary" size="sm">
                검토
              </ProtoButton>
            </Link>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function ReviewsTab() {
  return (
    <p className="sam-text-body-secondary text-sam-muted">
      transaction_reviews authority — listing detail embed 미연결. /admin/reviews 링크만.
    </p>
  );
}

function AdsTab({ listing }: { listing: ReturnType<typeof getMockListing> }) {
  if (!listing) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 sam-text-body-secondary">
      <section className="rounded-ui-rect border border-sam-border-soft p-3">
        <h4 className="font-semibold">더 알리기 (point_promotion_orders)</h4>
        <dl className="mt-2 grid gap-1">
          <Row label="상태" value={listing.promoted ? "활성 (fixture)" : "—"} />
          <Row label="포인트" value="— / 집계 미연결" />
        </dl>
      </section>
      <section className="rounded-ui-rect border border-sam-border-soft p-3">
        <h4 className="font-semibold">거래 광고 (trade_post_ads)</h4>
        <Row label="상태" value="— / 집계 미연결" />
      </section>
    </div>
  );
}

function AuditTab() {
  return (
    <p className="sam-text-body-secondary text-sam-muted">
      Admin 필드 변경 audit — 감사 결과 MISSING. fake 이력 표시하지 않음.
    </p>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 sam-text-xxs text-sam-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Field({ label, value, editable }: { label: string; value: string; editable?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="sam-text-xxs font-semibold text-sam-muted">{label}</span>
        {editable ? (
          <span className="rounded border border-sam-border px-1 sam-text-xxs text-sam-muted">수정 가능</span>
        ) : (
          <span className="rounded border border-amber-200 bg-amber-50 px-1 sam-text-xxs text-amber-900">잠금</span>
        )}
      </div>
      <p>{value}</p>
    </div>
  );
}
