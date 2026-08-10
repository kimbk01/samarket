"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getCategoryBySlugOrId } from "@/lib/categories/getCategoryById";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { ensureClientAccessOrRedirectAsync } from "@/lib/auth/client-access-flow";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import { TradeCategoryWriteForm } from "@/components/write/trade/TradeCategoryWriteForm";
import { ServiceWriteForm } from "@/components/write/service/ServiceWriteForm";
import { FeatureWriteBlock } from "@/components/write/FeatureWriteBlock";
import { getCategoryHref, getCanonicalCommunityWriteHref } from "@/lib/categories/getCategoryHref";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export default function WriteByCategoryPage() {
  const { t } = useI18n();
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const rawId = typeof params?.categoryId === "string" ? params.categoryId : "";
  const categoryId = rawId === "exchang" ? "exchange" : rawId;

  const [category, setCategory] = useState<CategoryWithSettings | null>(null);
  const [status, setStatus] = useState<"loading" | "redirecting" | "found" | "not_found" | "no_write">("loading");

  useEffect(() => {
    if (rawId === "exchang") {
      router.replace("/write/exchange");
    }
  }, [rawId, router]);

  const load = useCallback(async () => {
    if (!categoryId?.trim()) {
      setStatus("not_found");
      return;
    }
    if (!(await ensureClientAccessOrRedirectAsync(router, pathname || `/write/${categoryId}`))) {
      return;
    }
    setStatus("loading");
    let c;
    try {
      c = await getCategoryBySlugOrId(categoryId.trim());
    } catch {
      setStatus("not_found");
      return;
    }
    if (!c) {
      setStatus("not_found");
      return;
    }
    /** Legacy community create isolated — canonical Philife neighborhood writer only. */
    if (c.type === "community") {
      setStatus("redirecting");
      router.replace(getCanonicalCommunityWriteHref());
      return;
    }
    const nextPath = pathname || `/write/${categoryId}`;
    const profileAction = c.type === "trade" ? "trade_create_item" : null;
    if (profileAction) {
      const profileOk = await requireAuthAction(profileAction, async () => {}, { next: nextPath });
      if (!profileOk) {
        setStatus("redirecting");
        return;
      }
    }
    // settings가 있으면 can_write 반영, 없으면 글쓰기 허용
    if (c.settings && !c.settings.can_write) {
      setCategory(c);
      setStatus("no_write");
      return;
    }
    setCategory(c);
    setStatus("found");
  }, [categoryId, router, pathname]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSuccess = useCallback(
    (_postId: string) => {
      if (!category) return;
      router.replace(getCategoryHref(category));
    },
    [category, router]
  );

  const handleCancel = useCallback(() => {
    if (category) router.push(getCategoryHref(category));
    else router.back();
  }, [category, router]);

  if (rawId === "exchang") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background sam-text-body text-sam-muted">
        이동 중…
      </div>
    );
  }

  if (status === "loading" || status === "redirecting") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background sam-text-body text-sam-muted">
        {status === "redirecting" ? t("ui_write_auth_checking") : "불러오는 중…"}
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <p className="sam-text-body font-medium text-sam-fg">{t("trade_120")}</p>
        <div className="mt-4 flex justify-center">
          <AppBackButton className="text-signature hover:bg-signature/10" />
        </div>
      </div>
    );
  }

  if (status === "no_write" && category) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <p className="sam-text-body font-medium text-sam-fg">{t("trade_098")}</p>
        <button
          type="button"
          onClick={() => router.push(getCategoryHref(category))}
          className="mt-4 sam-text-body text-signature"
        >
          카테고리로 돌아가기
        </button>
      </div>
    );
  }

  if (status !== "found" || !category) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="sam-text-body text-sam-muted">{t("trade_119")}</p>
      </div>
    );
  }

  switch (category.type) {
    case "trade":
      return (
        <TradeCategoryWriteForm
          category={category}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      );
    case "community":
      // Should redirect in load(); keep as safety net without legacy form.
      return (
        <div className="flex min-h-screen items-center justify-center bg-background sam-text-body text-sam-muted">
          {t("ui_write_auth_checking")}
        </div>
      );
    case "service":
      return (
        <ServiceWriteForm
          category={category}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      );
    case "feature":
      return <FeatureWriteBlock category={category} />;
    default:
      return (
        <div className="flex min-h-screen items-center justify-center bg-background sam-text-body text-sam-muted">
          지원하지 않는 카테고리 타입입니다.
        </div>
      );
  }
}
