"use client";

import { useCallback, useState, useEffect } from "react";
import type { Product, ProductStatusLog } from "@/lib/types/product";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminProductActionPanel } from "./AdminProductActionPanel";
import { AdminProductStatusLogList } from "./AdminProductStatusLogList";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  buildAdminTradeChatsHref,
  buildAdminTradeFlowHref,
} from "@/lib/admin-products/admin-trade-deep-link";
import {
  ConsoleButton,
  DisconnectedValue,
  TradePromoBadge,
  TradeStatusBadge,
} from "@/components/admin/trade-console/trade-console-ui";

interface AdminProductDetailPageProps {
  productId: string;
  initialProduct?: Product | null;
}

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

function adminProductLocale(language: string): string {
  if (language === "en") return "en-US";
  if (language === "zh-CN") return "zh-CN";
  return "ko-KR";
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 sam-text-xxs text-sam-muted">{label}</dt>
      <dd className="min-w-0 sam-text-body-secondary text-sam-fg">{value}</dd>
    </div>
  );
}

export function AdminProductDetailPage({
  productId,
  initialProduct = null,
}: AdminProductDetailPageProps) {
  const { t, language, safeT } = useI18n();
  const locale = adminProductLocale(language);
  const [product, setProduct] = useState<Product | null>(initialProduct);
  const [loading, setLoading] = useState(!initialProduct);
  const [logs, setLogs] = useState<ProductStatusLog[]>([]);
  const [tab, setTab] = useState<DetailTab>("개요");

  const refreshDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch(
        `/api/admin/posts-management?id=${encodeURIComponent(productId)}`,
        {
          cache: "no-store",
          credentials: "include",
          cacheTtlMs: 0,
          dedupeKey: `admin:posts-management:by-id:${productId}`,
        }
      );
      const raw = (await res.json().catch(() => ({}))) as {
        products?: Product[];
      };
      const row = Array.isArray(raw.products) ? raw.products[0] : null;
      setProduct(row && row.id === productId ? row : null);
    } catch {
      setProduct(null);
    }
    setLogs([]);
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    if (initialProduct?.id === productId) return;
    void refreshDetail();
  }, [initialProduct, productId, refreshDetail]);

  if (loading && !product) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        {t("admin_dashboard_loading")}
      </div>
    );
  }

  if (!product) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        {t("admin_products_not_found")}
      </div>
    );
  }

  const images = product.images?.length
    ? product.images
    : product.thumbnail
      ? [product.thumbnail]
      : [];
  const promoActive = Boolean(
    product.hasPromotionOverlay || product.isPromoted || product.isBoosted
  );
  const visibilityPublic =
    product.visibility !== "hidden" && product.status !== "hidden";

  return (
    <div className="space-y-3" data-admin>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/posts-management"
            prefetch={false}
            className="sam-text-body-secondary text-signature hover:underline"
          >
            ← {t("admin_posts_mgmt_page_title")}
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="sam-text-page-title font-semibold text-sam-fg">{product.title}</h1>
            <Link
              href={`/post/${product.id}`}
              prefetch={false}
              className="sam-text-body-secondary text-signature hover:underline"
            >
              {t("admin_products_view_on_web")}
            </Link>
          </div>
          <p className="mt-1 sam-text-section-title font-semibold tabular-nums text-sam-fg">
            {formatMoneyPhp(product.price)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <TradeStatusBadge status={product.status} />
            <span className="inline-flex items-center rounded border border-sam-border px-1.5 py-0.5 sam-text-xxs">
              {visibilityPublic
                ? safeT("admin_posts_mgmt_visibility_visible", {
                    fallbackKo: "공개",
                    fallbackEn: "Public",
                  })
                : t("admin_posts_mgmt_visibility_hidden")}
            </span>
            <TradePromoBadge active={promoActive} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <AdminProductActionPanel product={product} onActionSuccess={refreshDetail} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <aside className="lg:col-span-4">
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
            {images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element -- admin ops media
              <img
                src={images[0]}
                alt=""
                className="mb-3 aspect-[4/3] w-full rounded-ui-rect object-cover"
              />
            ) : (
              <div className="mb-3 aspect-[4/3] rounded-ui-rect bg-sam-surface-muted" />
            )}
            <dl className="grid gap-2 sam-text-body-secondary">
              <div>
                <dt className="sam-text-xxs text-sam-muted">게시물 ID</dt>
                <dd className="break-all font-mono sam-text-xxs">{product.id}</dd>
              </div>
              <div>
                <dt className="sam-text-xxs text-sam-muted">{t("admin_products_dt_nickname")}</dt>
                <dd>
                  {product.seller?.nickname ?? product.sellerId ?? "—"}{" "}
                  {product.seller?.username ? (
                    <span className="font-mono text-sam-muted">@{product.seller.username}</span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="sam-text-xxs text-sam-muted">{t("admin_products_dt_region")}</dt>
                <dd>{product.location || "—"}</dd>
              </div>
              <div>
                <dt className="sam-text-xxs text-sam-muted">
                  {safeT("admin_products_dt_registered", {
                    fallbackKo: "등록",
                    fallbackEn: "Registered",
                  })}
                </dt>
                <dd>{new Date(product.createdAt).toLocaleString(locale)}</dd>
              </div>
            </dl>
          </div>

          <div className="mt-3 rounded-ui-rect border border-red-200 bg-red-50/50 p-3">
            <p className="sam-text-body font-semibold text-red-800">위험 영역</p>
            <p className="mt-1 sam-text-xxs text-red-900/80">
              DB 영구 삭제 — dependency preview 계약 미완. NOT_READY.
            </p>
            <ConsoleButton variant="danger" size="sm" className="mt-2" disabled>
              영구 삭제 (NOT_READY)
            </ConsoleButton>
          </div>
        </aside>

        <div className="lg:col-span-8">
          <div className="mb-3 flex flex-wrap gap-1 border-b border-sam-border pb-2">
            {DETAIL_TABS.map((tabLabel) => (
              <button
                key={tabLabel}
                type="button"
                onClick={() => setTab(tabLabel)}
                className={[
                  "rounded-ui-rect px-2.5 py-1 sam-text-body-secondary",
                  tab === tabLabel
                    ? "bg-signature/15 font-medium text-signature"
                    : "text-sam-muted hover:bg-sam-surface-muted",
                ].join(" ")}
              >
                {tabLabel}
              </button>
            ))}
          </div>

          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            {tab === "개요" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <section>
                  <h3 className="mb-2 sam-text-body font-semibold">상품 상태</h3>
                  <dl className="grid gap-1.5">
                    <Row label="판매 상태" value={<TradeStatusBadge status={product.status} />} />
                    <Row
                      label="공개 상태"
                      value={visibilityPublic ? "공개" : "비공개"}
                    />
                    <Row
                      label="거래 표시"
                      value={product.sellerListingState ?? "—"}
                    />
                    <Row label="광고" value={<TradePromoBadge active={promoActive} />} />
                    <Row
                      label="신고"
                      value={
                        (product.reportCount ?? 0) > 0 ? (
                          <Link
                            href={`/admin/reports?target=${product.id}`}
                            className="text-signature hover:underline"
                          >
                            {product.reportCount}건
                          </Link>
                        ) : (
                          "0"
                        )
                      }
                    />
                    <Row
                      label="찜"
                      value={
                        product.likesCount != null ? (
                          String(product.likesCount)
                        ) : (
                          <DisconnectedValue />
                        )
                      }
                    />
                    <Row label="채팅" value={String(product.chatCount ?? 0)} />
                  </dl>
                </section>
                <section>
                  <h3 className="mb-2 sam-text-body font-semibold">분류</h3>
                  <dl className="grid gap-1.5">
                    <Row
                      label="카테고리"
                      value={product.categoryName ?? product.category ?? product.categorySlug ?? "—"}
                    />
                    <Row label="service" value={product.serviceType ?? product.serviceSlug ?? "—"} />
                  </dl>
                </section>
              </div>
            ) : null}

            {tab === "상품 정보" ? (
              <dl className="grid gap-3 sam-text-body-secondary">
                <Row label="제목" value={product.title} />
                <Row
                  label="본문"
                  value={
                    product.description ? (
                      <span className="whitespace-pre-wrap">{product.description}</span>
                    ) : (
                      "—"
                    )
                  }
                />
                <Row label="가격" value={formatMoneyPhp(product.price)} />
                <Row label="지역" value={product.location || "—"} />
                <Row
                  label="예약 구매자"
                  value={
                    product.reservedBuyerId ? (
                      <Link
                        href={`/admin/users/${product.reservedBuyerId}`}
                        className="font-mono text-signature hover:underline"
                      >
                        {product.reservedBuyerId}
                      </Link>
                    ) : (
                      "—"
                    )
                  }
                />
                <Row
                  label="완료 구매자"
                  value={
                    product.soldBuyerId ? (
                      <Link
                        href={`/admin/users/${product.soldBuyerId}`}
                        className="font-mono text-signature hover:underline"
                      >
                        {product.soldBuyerId}
                      </Link>
                    ) : (
                      "—"
                    )
                  }
                />
                <p className="sam-text-xxs text-sam-muted">
                  상태/노출 변경은 상단 액션 패널(기존 writer). 새 writer 없음.
                </p>
              </dl>
            ) : null}

            {tab === "판매자" ? (
              <div className="space-y-3 sam-text-body-secondary">
                <p className="font-medium text-sam-fg">
                  {product.seller?.nickname ?? product.sellerId ?? "—"}{" "}
                  {product.seller?.username ? (
                    <span className="font-mono sam-text-xxs">@{product.seller.username}</span>
                  ) : null}
                </p>
                {product.sellerId || product.seller?.id ? (
                  <Link href={`/admin/users/${product.seller?.id ?? product.sellerId}`}>
                    <ConsoleButton variant="secondary" size="sm">
                      회원 상세 보기
                    </ConsoleButton>
                  </Link>
                ) : null}
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {[
                    "현재 판매중",
                    "판매완료",
                    "숨김",
                    "받은 신고",
                    "받은 찜",
                    "거래 채팅",
                  ].map((k) => (
                    <div key={k} className="rounded-ui-rect border border-sam-border-soft px-2 py-2">
                      <dt className="sam-text-xxs text-sam-muted">{k}</dt>
                      <dd>
                        <DisconnectedValue />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            {tab === "거래" ? (
              <div className="space-y-3 sam-text-body-secondary">
                <dl className="grid gap-1.5">
                  <Row
                    label="예약 구매자"
                    value={product.reservedBuyerId ? product.reservedBuyerId.slice(0, 8) + "…" : "—"}
                  />
                  <Row
                    label="완료 구매자"
                    value={product.soldBuyerId ? product.soldBuyerId.slice(0, 8) + "…" : "—"}
                  />
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Link href={buildAdminTradeChatsHref(product)}>
                    <ConsoleButton variant="secondary" size="sm">
                      {t("admin_posts_mgmt_link_trade_chats")}
                    </ConsoleButton>
                  </Link>
                  <Link href={buildAdminTradeFlowHref(product)}>
                    <ConsoleButton variant="secondary" size="sm">
                      {t("admin_posts_mgmt_link_trade_flow")}
                    </ConsoleButton>
                  </Link>
                </div>
              </div>
            ) : null}

            {tab === "찜" ? (
              <div className="space-y-3">
                <p className="sam-text-body">
                  현재 찜{" "}
                  {product.likesCount != null ? (
                    <span className="font-semibold tabular-nums">{product.likesCount}</span>
                  ) : (
                    <DisconnectedValue />
                  )}
                </p>
                <p className="sam-text-body-secondary text-sam-muted">
                  live favorites relation — Admin 목록 미연결. 변경 로그는{" "}
                  <Link href="/admin/favorites" className="text-signature hover:underline">
                    /admin/favorites
                  </Link>{" "}
                  (favorite_audit_log).
                </p>
              </div>
            ) : null}

            {tab === "신고" ? (
              <div className="space-y-3 sam-text-body-secondary">
                <p>
                  신고 수:{" "}
                  <span className="font-semibold tabular-nums">{product.reportCount ?? 0}</span>
                </p>
                <Link href={`/admin/reports?target=${product.id}`}>
                  <ConsoleButton variant="secondary" size="sm">
                    신고 검토 화면으로
                  </ConsoleButton>
                </Link>
                <p className="sam-text-xxs text-sam-muted">
                  신고 writer/복제 없음 — 기존 /admin/reports authority LINK.
                </p>
              </div>
            ) : null}

            {tab === "후기" ? (
              <div className="space-y-3 sam-text-body-secondary">
                <p className="text-sam-muted">
                  transaction_reviews — listing embed 미연결. 기존 화면 LINK만.
                </p>
                <Link href="/admin/reviews">
                  <ConsoleButton variant="secondary" size="sm">
                    후기 관리
                  </ConsoleButton>
                </Link>
              </div>
            ) : null}

            {tab === "광고·노출" ? (
              <div className="grid gap-4 sm:grid-cols-2 sam-text-body-secondary">
                <section className="rounded-ui-rect border border-sam-border-soft p-3">
                  <h4 className="font-semibold">더 알리기</h4>
                  <dl className="mt-2 grid gap-1">
                    <Row label="표시" value={<TradePromoBadge active={promoActive} />} />
                    <Row label="포인트" value={<DisconnectedValue />} />
                  </dl>
                  <Link href="/admin/ad-applications" className="mt-2 inline-block">
                    <ConsoleButton variant="secondary" size="sm">
                      신청 목록
                    </ConsoleButton>
                  </Link>
                </section>
                <section className="rounded-ui-rect border border-sam-border-soft p-3">
                  <h4 className="font-semibold">거래 광고</h4>
                  <Row label="상태" value={<DisconnectedValue />} />
                  <Link href="/admin/trade-post-ads" className="mt-2 inline-block">
                    <ConsoleButton variant="secondary" size="sm">
                      trade_post_ads
                    </ConsoleButton>
                  </Link>
                </section>
              </div>
            ) : null}

            {tab === "관리 이력" ? (
              <div className="space-y-2">
                <AdminProductStatusLogList logs={logs} />
                {logs.length === 0 ? (
                  <p className="sam-text-body-secondary text-sam-muted">
                    {t("admin_products_status_log_db_pending")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
