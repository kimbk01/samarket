"use client";

import { useEffect, useState } from "react";
import {
  BUYER_TO_SELLER_NEGATIVE,
  BUYER_TO_SELLER_POSITIVE,
  tradeReviewTagLabel,
} from "@/lib/trade/trade-review-tags";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

interface ReviewPayload {
  public_review_type: string;
  positive_tag_keys: string[] | null;
  negative_tag_keys: string[] | null;
  review_comment: string | null;
  created_at: string;
}

export function BuyerReviewReadSheet({
  chatId,
  perspective,
  onClose,
}: {
  chatId: string;
  perspective: "buyer_self" | "seller_sees_buyer";
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rev, setRev] = useState<ReviewPayload | null>(null);

  useEffect(() => {
    const u = getCurrentUser()?.id?.trim();
    if (!u) {
      setErr(t("mypage_comp_login_required"));
      setLoading(false);
      return;
    }
    const path =
      perspective === "buyer_self"
        ? `/api/my/buyer-review?chatId=${encodeURIComponent(chatId)}`
        : `/api/my/seller-sees-buyer-review?chatId=${encodeURIComponent(chatId)}`;
    runSingleFlight(`mypage:buyer-review-read:${path}`, () =>
      fetch(path, { credentials: "include", cache: "no-store" })
    )
      .then(async (res) => {
        const data = (await res.clone().json().catch(() => ({}))) as {
          review?: ReviewPayload;
          error?: string;
        };
        if (!res.ok) {
          setErr(data.error ?? t("mypage_comp_orders_list_load_failed"));
          return;
        }
        setRev(data.review ?? null);
      })
      .catch(() => setErr(t("mypage_comp_product_network_error_short")))
      .finally(() => setLoading(false));
  }, [chatId, perspective, t]);

  const title =
    perspective === "buyer_self" ? t("mypage_comp_purchase_card_review_prompt_p2") : t("mypage_comp_review_buy_heading");

  return (
    <DibayBottomSheet open onClose={onClose} title={title} anchor="above-bottom-nav">
      {loading ? (
        <p className={`py-8 text-center ${OverlayUi.bodySecondary}`}>{t("mypage_comp_loading_short")}</p>
      ) : err ? (
        <p className="py-8 text-center text-sm text-[color:var(--overlay-danger)]">{err}</p>
      ) : rev ? (
        <div className={`space-y-3 ${OverlayUi.body}`}>
          <p>
            <span className={OverlayUi.caption}>{t("mypage_comp_review_overall")}</span>{" "}
            <span className="font-medium">
              {rev.public_review_type === "good"
                ? t("mypage_comp_review_positive")
                : rev.public_review_type === "bad"
                  ? t("mypage_comp_review_negative")
                  : t("mypage_comp_review_none")}
            </span>
          </p>
          {(rev.positive_tag_keys?.length ?? 0) > 0 ? (
            <div>
              <p className={`mb-1 font-medium ${OverlayUi.caption}`}>{t("mypage_comp_review_positive")}</p>
              <ul className="flex flex-wrap gap-1">
                {(rev.positive_tag_keys ?? []).map((k) => (
                  <li
                    key={k}
                    className="rounded-full bg-[color:var(--overlay-secondary)] px-2 py-0.5 text-[11px] text-[color:var(--overlay-text-primary)]"
                  >
                    {tradeReviewTagLabel(t, "buyer_to_seller", k)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {(rev.negative_tag_keys?.length ?? 0) > 0 ? (
            <div>
              <p className={`mb-1 font-medium ${OverlayUi.caption}`}>{t("mypage_comp_review_negative")}</p>
              <ul className="flex flex-wrap gap-1">
                {(rev.negative_tag_keys ?? []).map((k) => (
                  <li
                    key={k}
                    className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900"
                  >
                    {tradeReviewTagLabel(t, "buyer_to_seller", k)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {rev.review_comment ? (
            <p className={`whitespace-pre-wrap ${OverlayUi.bodySecondary}`}>{rev.review_comment}</p>
          ) : null}
          <p className={OverlayUi.caption}>
            {rev.created_at ? new Date(rev.created_at).toLocaleString() : ""}
          </p>
        </div>
      ) : (
        <p className={`py-8 text-center ${OverlayUi.bodySecondary}`}>{t("mypage_comp_review_none")}</p>
      )}
    </DibayBottomSheet>
  );
}
