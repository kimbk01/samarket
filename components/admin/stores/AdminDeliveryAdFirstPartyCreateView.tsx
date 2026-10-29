"use client";

import { AdminListItemButton } from "@/components/admin/ui/AdminListItemButton";
import { AdminActionButton, AdminActionLabel } from "@/components/admin/ui/AdminActionButton";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminDeliveryAdsSectionNav } from "@/components/admin/stores/AdminDeliveryAdsSectionNav";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { adminFetch } from "@/lib/admin/admin-fetch-client";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { DeliveryAdBanner } from "@/components/stores/advertising/DeliveryAdBanner";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import {
  ADMIN_FIRST_PARTY_BANNER_INVENTORY_KEYS,
  type AdminFirstPartyBannerInventoryKey,
} from "@/lib/stores/advertising/admin-first-party-banner-inventory";
import { fetchStoresTaxonomyDeduped } from "@/lib/stores/store-delivery-api-client";
import { manilaLocalToIso } from "@/lib/launch-intro/schedule";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import {
  adminDeliveryAdInventoryHumanLabel,
  R4_STORE_PROMOTION_FIRST_PARTY,
} from "@/lib/stores/advertising/delivery-ad-admin-r3-presentation";
import {
  DELIVERY_AD_BANNER_PIXEL_GUIDE,
  formatBannerPixelGuideLine,
} from "@/lib/stores/advertising/delivery-ad-open-event-commercial";
import { bannerGeometryRejectMessage } from "@/lib/stores/advertising/validate-banner-creative-geometry";

/**
 * Admin DIBAY first-party Banner — single-page workspace (no step wizard).
 */
export function AdminDeliveryAdFirstPartyCreateView() {
  const { language, safeT } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();

  const [inventoryKey, setInventoryKey] = useState<AdminFirstPartyBannerInventoryKey>("STORES_HOME_HERO");
  /** B-01 — 업종 상단 대상 업종 (빈 값 = 전체 업종) */
  const [browsePrimarySlug, setBrowsePrimarySlug] = useState("");
  const [browseSecondarySlug, setBrowseSecondarySlug] = useState("");
  const [taxonomy, setTaxonomy] = useState<{
    categories: { id: string; slug: string; name: string }[];
    topics: { store_category_id: string; slug: string; name: string }[];
  }>({ categories: [], topics: [] });
  /** B-06 — 연결 매장 (노출·클릭 집계·매장 이동) */
  const [storeQuery, setStoreQuery] = useState("");
  const [storeResults, setStoreResults] = useState<{ id: string; store_name: string; slug: string }[]>([]);
  const [destinationStore, setDestinationStore] = useState<{ id: string; name: string; slug: string } | null>(null);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [headline, setHeadline] = useState("");
  const [subcopy, setSubcopy] = useState("");
  const [ctaHref, setCtaHref] = useState("/stores");
  const [assetPath, setAssetPath] = useState("");
  const [sourceWidth, setSourceWidth] = useState(0);
  const [sourceHeight, setSourceHeight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (inventoryKey !== "STORES_CATEGORY_TOP" || taxonomy.categories.length > 0) return;
    let cancelled = false;
    void fetchStoresTaxonomyDeduped().then(({ json }) => {
      const j = json as { categories?: unknown; topics?: unknown };
      if (cancelled || !Array.isArray(j.categories) || !Array.isArray(j.topics)) return;
      setTaxonomy({
        categories: j.categories as { id: string; slug: string; name: string }[],
        topics: j.topics as { store_category_id: string; slug: string; name: string }[],
      });
    });
    return () => {
      cancelled = true;
    };
  }, [inventoryKey, taxonomy.categories.length]);

  const ko = lang !== "en";
  /** v4 UI-15 — 오류 코드는 운영자 문구로만 표시 (원문·detail 노출 금지) */
  const showCodeError = (code: string | null | undefined) => setError(adminOperatorErrorMessage(code, ko));

  const searchStores = async () => {
    const q = storeQuery.trim();
    if (!q) return;
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/stores?q=${encodeURIComponent(q)}`, { credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        stores?: { id: string; store_name: string; slug: string }[];
      };
      if (!res.ok || !j.ok) {
        setStoreResults([]);
        showCodeError(j.error || "load_failed");
        return;
      }
      setStoreResults(Array.isArray(j.stores) ? j.stores.slice(0, 20) : []);
    } catch {
      setStoreResults([]);
      showCodeError("network_error");
    }
  };

  const inventory = useMemo(() => inventoryViewFromKey(inventoryKey), [inventoryKey]);
  const selectedPrimaryId = taxonomy.categories.find((c) => c.slug === browsePrimarySlug)?.id ?? null;
  const secondaryOptions = selectedPrimaryId
    ? taxonomy.topics.filter((t) => t.store_category_id === selectedPrimaryId)
    : [];
  const guide = DELIVERY_AD_BANNER_PIXEL_GUIDE[inventoryKey];
  const scheduleOk =
    Boolean(startAt && endAt) && new Date(endAt).getTime() > new Date(startAt).getTime();
  const canSubmit = Boolean(
    inventoryKey && scheduleOk && headline.trim() && assetPath.trim() && ctaHref.trim() && !busy
  );

  const upload = async (file: File) => {
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("inventoryKey", inventoryKey);
    let res: Response;
    try {
      res = await adminFetch("/api/admin/delivery-ads/upload-banner-image", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
    } catch {
      showCodeError("network_error");
      return;
    }
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      url?: string;
      width?: number;
      height?: number;
      error?: string;
    };
    if (!res.ok || !j.ok || !j.url) {
      if (
        j.error === "aspect_mismatch" ||
        j.error === "below_min_pixels" ||
        j.error === "invalid_dimensions"
      ) {
        setError(
          bannerGeometryRejectMessage({
            error: j.error as "aspect_mismatch" | "below_min_pixels" | "invalid_dimensions",
            guide,
            lang,
            placementLabel: adminDeliveryAdInventoryHumanLabel(inventoryKey, lang),
          })
        );
        return;
      }
      showCodeError(j.error ?? "upload_failed");
      return;
    }
    setAssetPath(j.url);
    setSourceWidth(Number(j.width ?? 0));
    setSourceHeight(Number(j.height ?? 0));
  };

  const submit = async () => {
    if (!canSubmit) {
      if (!scheduleOk) {
        setError(
          safeT("admin_delivery_ads_fp_schedule_invalid", {
            fallbackKo: "종료 일시는 시작 일시보다 이후여야 합니다.",
            fallbackEn: "End must be after start.",
          })
        );
      }
      return;
    }
    const startIso = manilaLocalToIso(startAt);
    const endIso = manilaLocalToIso(endAt);
    if (!startIso || !endIso) {
      setError(
        safeT("admin_delivery_ads_fp_schedule_invalid", {
          fallbackKo: "종료 일시는 시작 일시보다 이후여야 합니다.",
          fallbackEn: "End must be after start.",
        })
      );
      return;
    }
    if (busy) return;
    /** 기간 안에 앱 배달 화면에 노출이 시작되는 생성 — 노출 시작(L2) 확인 · 사유는 API reason 으로 감사 기록. */
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("exposeStart"),
      ko,
      title: ko ? "자사 배너를 등록할까요?" : "Register this first-party banner?",
      description: ko
        ? "지정한 기간(필리핀 시간)에 배달 화면에 노출됩니다."
        : "It is shown on delivery screens during the period (Manila time).",
      confirmLabel: adminCta("create", ko),
    });
    if (!confirmed.ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/delivery-ads/first-party", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: "banner",
          reason: confirmed.reason ?? undefined,
          inventoryKey,
          /** H-05 과 같은 계약 — 어드민 입력 = 필리핀 시간 */
          startAt: startIso,
          endAt: endIso,
          assetPath,
          sourceWidth,
          sourceHeight,
          headline: headline || null,
          subcopy: subcopy || null,
          ctaHref,
          ...(destinationStore
            ? {
                destinationStoreId: destinationStore.id,
                destinationStoreSlug: destinationStore.slug,
                ctaType: "store_detail",
              }
            : {}),
          ...(inventoryKey === "STORES_CATEGORY_TOP"
            ? {
                browsePrimarySlug: browsePrimarySlug || null,
                browseSecondarySlug: browsePrimarySlug && browseSecondarySlug ? browseSecondarySlug : null,
              }
            : {}),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        campaignId?: string;
        detailHref?: string;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !j.ok || !j.campaignId) {
        showCodeError(j.error ?? "create_failed");
        return;
      }
      router.push(j.detailHref ?? DELIVERY_AD_ADMIN_ROUTES.detail(j.campaignId));
    } catch {
      showCodeError("network_error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminDeliveryCmsChrome>
      <div
        className="space-y-4 pb-10"
        data-admin-first-party-create="design-board"
        data-admin-first-party-wizard="single-page"
      >
        <div>
          <p className="text-[12px] text-sam-muted">Delivery › Ads › First-party</p>
          <h1 className="text-[20px] font-bold text-sam-fg">
            {safeT("admin_delivery_ads_first_party_title", {
              fallbackKo: "디바이 광고 만들기",
              fallbackEn: "Create DIBAY ad",
            })}
          </h1>
          <p className="mt-1 text-[13px] text-sam-muted">
            {safeT("admin_delivery_ads_first_party_single_desc", {
              fallbackKo:
                "DIBAY가 직접 운영하는 배너 광고입니다. Owner 결제와 Cash를 사용하지 않습니다.",
              fallbackEn:
                "DIBAY-operated banner. No Owner payment and no Cash.",
            })}
          </p>
          <p className="mt-2 text-[12px] text-sam-muted" data-store-promotion-fp="NOT_IMPLEMENTED_MODEL_BLOCKED">
            {safeT("admin_delivery_ads_first_party_store_promo_blocked", {
              fallbackKo: `매장 홍보 first-party: ${R4_STORE_PROMOTION_FIRST_PARTY.status}`,
              fallbackEn: `Store promotion first-party: ${R4_STORE_PROMOTION_FIRST_PARTY.status}`,
            })}
          </p>
        </div>

        <AdminDeliveryAdsSectionNav />

        {error ? (
          <p className="text-[13px] text-sam-danger" role="alert">
            {error}
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
          <div className="space-y-4 min-w-0">
            <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <h2 className="text-[14px] font-bold text-sam-fg">
                {safeT("admin_delivery_ads_first_party_placement", {
                  fallbackKo: "노출 위치",
                  fallbackEn: "Placement",
                })}
              </h2>
              <div className="space-y-2">
                {ADMIN_FIRST_PARTY_BANNER_INVENTORY_KEYS.map((k) => {
                  const selected = inventoryKey === k;
                  const g = DELIVERY_AD_BANNER_PIXEL_GUIDE[k];
                  return (
                    <AdminListItemButton selected={selected} className="flex flex-col items-start border border-sam-border px-3 py-2.5"
                      key={k}
                      aria-pressed={selected}
                      onClick={() => {
                        setInventoryKey(k);
                        setAssetPath("");
                        setSourceWidth(0);
                        setSourceHeight(0);
                      }}
                    >
                      <span className="text-[14px] font-semibold">
                        {selected ? "● " : "○ "}
                        {adminDeliveryAdInventoryHumanLabel(k, lang)}
                      </span>
                      <span className="mt-0.5 text-[12px] text-sam-muted">
                        {k === "STORES_HOME_HERO"
                          ? safeT("admin_fp_home_hero_ops", {
                              fallbackKo: "슬라이드 배너 · 5초 · 1장 · dots · swipe · loop",
                              fallbackEn: "Carousel · 5s · 1 visible · dots · swipe · loop",
                            })
                          : k === "STORES_HOME_INLINE_1"
                            ? lang === "ko"
                              ? "홈 「더 많은 매장」 위 · 1장"
                              : "Above home remaining stores · 1 visible"
                            : lang === "ko"
                              ? "업종 목록 상단 · 업종별 지정 · 1장"
                              : "Top of category list · per category · 1 visible"}{" "}
                        · {formatBannerPixelGuideLine(g, lang)}
                      </span>
                    </AdminListItemButton>
                  );
                })}
              </div>
            </section>

            {inventoryKey === "STORES_CATEGORY_TOP" ? (
              <section
                className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4"
                data-admin-fp-browse-target
              >
                <h2 className="text-[14px] font-bold text-sam-fg">{lang === "ko" ? "대상 업종" : "Target category"}</h2>
                <label className="block text-[12px] text-sam-muted">
                  {lang === "ko" ? "1차 업종 (비우면 전체 업종)" : "Primary (empty = all categories)"}
                  <select
                    className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px] text-sam-fg"
                    value={browsePrimarySlug}
                    onChange={(e) => {
                      setBrowsePrimarySlug(e.target.value);
                      setBrowseSecondarySlug("");
                    }}
                  >
                    <option value="">{lang === "ko" ? "전체 업종" : "All categories"}</option>
                    {taxonomy.categories.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[12px] text-sam-muted">
                  {lang === "ko" ? "2차 업종 (비우면 1차 전체)" : "Secondary (empty = whole primary)"}
                  <select
                    disabled={!browsePrimarySlug}
                    className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[13px] text-sam-fg disabled:opacity-50"
                    value={browseSecondarySlug}
                    onChange={(e) => setBrowseSecondarySlug(e.target.value)}
                  >
                    <option value="">{lang === "ko" ? "1차 전체" : "Whole primary"}</option>
                    {secondaryOptions.map((t) => (
                      <option key={t.slug} value={t.slug}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
            ) : null}

            <section
              className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4"
              data-admin-fp-destination-store
            >
              <h2 className="text-[14px] font-bold text-sam-fg">
                {lang === "ko" ? "연결 매장 (선택)" : "Linked store (optional)"}
              </h2>
              <p className="text-[12px] text-sam-muted">
                {lang === "ko"
                  ? "매장을 연결하면 배너가 그 매장 상세로 이동하고 노출·클릭이 집계됩니다."
                  : "Linking a store opens its detail page and records impressions and clicks."}
              </p>
              {destinationStore ? (
                <div className="flex items-center justify-between gap-2 rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]">
                  <span className="truncate text-sam-fg">{destinationStore.name}</span>
                  <AdminActionButton variant="ghost" size="sm" onClick={() => setDestinationStore(null)}>
                    {lang === "ko" ? "연결 해제" : "Unlink"}
                  </AdminActionButton>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-ui-rect border border-sam-border px-3 py-2 text-[13px] text-sam-fg"
                      value={storeQuery}
                      placeholder={lang === "ko" ? "매장명 검색" : "Search store name"}
                      onChange={(e) => setStoreQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void searchStores();
                      }}
                    />
                    <AdminActionButton variant="secondary" size="sm" onClick={() => void searchStores()}>
                      {lang === "ko" ? "조회" : "Search"}
                    </AdminActionButton>
                  </div>
                  {storeResults.length > 0 ? (
                    <ul className="max-h-48 space-y-1 overflow-y-auto">
                      {storeResults.map((st) => (
                        <li key={st.id}>
                          <AdminListItemButton
                            selected={false}
                            className="w-full border border-sam-border px-3 py-2 text-left text-[13px]"
                            onClick={() => {
                              setDestinationStore({ id: st.id, name: st.store_name, slug: st.slug });
                              setStoreResults([]);
                            }}
                          >
                            {st.store_name}
                          </AdminListItemButton>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </section>

            <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <h2 className="text-[14px] font-bold text-sam-fg">
                {safeT("admin_delivery_ads_first_party_schedule", {
                  fallbackKo: "일정",
                  fallbackEn: "Schedule",
                })}
              </h2>
              <label className="block text-[12px] text-sam-muted">
                {safeT("admin_delivery_ads_first_party_start", {
                  fallbackKo: "시작",
                  fallbackEn: "Start",
                })}
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[14px]"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                />
              </label>
              <label className="block text-[12px] text-sam-muted">
                {safeT("admin_delivery_ads_first_party_end", {
                  fallbackKo: "종료",
                  fallbackEn: "End",
                })}
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[14px]"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                />
              </label>
              {startAt && endAt && !scheduleOk ? (
                <p className="text-[12px] text-sam-danger" data-admin-fp-schedule-invalid="1">
                  {safeT("admin_delivery_ads_fp_schedule_invalid", {
                    fallbackKo: "종료 일시는 시작 일시보다 이후여야 합니다.",
                    fallbackEn: "End must be after start.",
                  })}
                </p>
              ) : null}
            </section>

            <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <h2 className="text-[14px] font-bold text-sam-fg">
                {safeT("admin_delivery_ads_first_party_creative", {
                  fallbackKo: "배너 이미지",
                  fallbackEn: "Banner image",
                })}
              </h2>
              <p className="text-[12px] text-sam-muted" data-admin-fp-pixel-guide="1">
                {formatBannerPixelGuideLine(guide, lang)}
                <br />
                {lang === "en" ? guide.safeAreaNoteEn : guide.safeAreaNoteKo}
              </p>
              <AdminActionLabel variant="secondary">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                    e.target.value = "";
                  }}
                />
                {safeT("admin_delivery_ads_fp_pc_upload", {
                  fallbackKo: "내 PC에서 이미지 불러오기",
                  fallbackEn: "Upload from PC",
                })}
              </AdminActionLabel>
              {assetPath ? (
                <div className="space-y-2">
                  <div className="overflow-hidden rounded-ui-rect border border-sam-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={assetPath}
                      alt=""
                      className="w-full object-cover aspect-[39/16]"
                    />
                  </div>
                  <p className="text-[12px] tabular-nums text-sam-muted">
                    {sourceWidth}×{sourceHeight}px
                  </p>
                  <AdminActionButton variant="secondary" size="sm"
                    onClick={() => {
                      setAssetPath("");
                      setSourceWidth(0);
                      setSourceHeight(0);
                    }}
                  >
                    {safeT("admin_delivery_ads_fp_remove_image", {
                      fallbackKo: "이미지 삭제",
                      fallbackEn: "Remove image",
                    })}
                  </AdminActionButton>
                </div>
              ) : null}
            </section>

            <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
              <h2 className="text-[14px] font-bold text-sam-fg">
                {safeT("admin_delivery_ads_first_party_copy_dest", {
                  fallbackKo: "배너 문구 / 목적지",
                  fallbackEn: "Copy / destination",
                })}
              </h2>
              <label className="block text-[12px] text-sam-muted">
                {safeT("admin_delivery_ads_first_party_headline", {
                  fallbackKo: "헤드라인",
                  fallbackEn: "Headline",
                })}
                <input
                  className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[14px]"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                />
              </label>
              <label className="block text-[12px] text-sam-muted">
                {safeT("admin_delivery_ads_first_party_subcopy", {
                  fallbackKo: "서브카피",
                  fallbackEn: "Subcopy",
                })}
                <input
                  className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[14px]"
                  value={subcopy}
                  onChange={(e) => setSubcopy(e.target.value)}
                />
              </label>
              <label className="block text-[12px] text-sam-muted">
                {safeT("admin_delivery_ads_first_party_destination", {
                  fallbackKo: "이동 경로 (앱 내부)",
                  fallbackEn: "Destination (in-app path)",
                })}
                <input
                  className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 text-[14px]"
                  value={ctaHref}
                  onChange={(e) => setCtaHref(e.target.value)}
                  placeholder="/stores/..."
                />
              </label>
            </section>
          </div>

          <div className="space-y-4 min-w-0 lg:sticky lg:top-4">
            <section className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
              <p className="mb-2 text-[12px] font-semibold text-sam-muted">
                {safeT("admin_delivery_ads_first_party_preview", {
                  fallbackKo: "고객 화면 미리보기",
                  fallbackEn: "Customer preview",
                })}
              </p>
              {assetPath ? (
                <DeliveryAdBanner
                  inventory={inventory}
                  creative={{
                    assetUrl: assetPath,
                    headline: headline || null,
                    subcopy: subcopy || null,
                  }}
                  destination={{ href: ctaHref, ctaLabel: null }}
                  adLabel={lang === "en" ? "Ad" : "광고"}
                  renderContext="admin_preview"
                  campaignId="preview"
                />
              ) : (
                <p className="text-[13px] text-sam-muted">—</p>
              )}
            </section>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <AdminActionButton variant="secondary"
            onClick={() => router.push(DELIVERY_AD_ADMIN_ROUTES.hub)}
          >
            {safeT("admin_delivery_ads_fp_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" })}
          </AdminActionButton>
          <AdminActionButton variant="primary" className="flex-1"
            disabled={!canSubmit}
            data-first-party-submit="1"
            onClick={() => void submit()}
          >
            {busy
              ? "…"
              : /* v4 재감사 UI-15 — 입력은 PHT 벽시계: 기기 시간대가 아니라 PHT 로 해석해 지금과 비교 */
                Date.parse(manilaLocalToIso(startAt) ?? "") <= Date.now()
                ? safeT("admin_delivery_ads_first_party_go_live", {
                    fallbackKo: "즉시 노출",
                    fallbackEn: "Go live now",
                  })
                : safeT("admin_delivery_ads_first_party_schedule_submit", {
                    fallbackKo: "예약 등록",
                    fallbackEn: "Schedule registration",
                  })}
          </AdminActionButton>
        </div>
      </div>
    </AdminDeliveryCmsChrome>
  );
}
