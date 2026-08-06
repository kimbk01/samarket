import Link from "next/link";
import { MyWrittenReviewsView } from "@/components/mypage/reviews/MyWrittenReviewsView";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { translate } from "@/lib/i18n/messages";

export default function PhilifeReviewsPage() {
  const lang = resolveServerInitialLanguage({});
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader title={translate(lang, "philife_reviews_title")} backHref="/philife" />
      <div className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-24">
        <p className="sam-text-body leading-relaxed text-sam-muted">
          <strong className="text-sam-fg">{translate(lang, "philife_reviews_intro_1")}</strong>{" "}
          {translate(lang, "philife_reviews_intro_2")}{" "}
          <Link href="/mypage/trade" className="font-medium text-signature underline">
            {translate(lang, "philife_reviews_shortcut_purchases")}
          </Link>
        </p>
        <MyWrittenReviewsView />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
          <p className="mb-2 sam-text-body-secondary font-medium text-sam-fg">
            {translate(lang, "philife_reviews_shortcut_title")}
          </p>
          <ul className="space-y-2">
            <li>
              <Link
                href="/mypage/trade"
                className="block rounded-ui-rect border border-sam-border bg-sam-primary-soft px-3 py-2.5 sam-text-body font-medium text-foreground"
              >
                {translate(lang, "philife_reviews_shortcut_purchases")}
              </Link>
            </li>
            <li>
              <Link
                href="/mypage/trade/sales"
                className="block rounded-ui-rect border border-sam-border bg-sam-primary-soft px-3 py-2.5 sam-text-body font-medium text-foreground"
              >
                {translate(lang, "philife_reviews_shortcut_sales")}
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
