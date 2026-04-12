"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getCategoryBySlugOrId } from "@/lib/categories/getCategoryById";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { ensureClientAccessOrRedirect } from "@/lib/auth/client-access-flow";
import { TradeWriteForm } from "@/components/write/trade/TradeWriteForm";
import { JobsWriteForm } from "@/components/write/trade/JobsWriteForm";
import { ExchangeWriteForm } from "@/components/write/trade/ExchangeWriteForm";
import { CommunityWriteForm } from "@/components/write/community/CommunityWriteForm";
import { ServiceWriteForm } from "@/components/write/service/ServiceWriteForm";
import { FeatureWriteBlock } from "@/components/write/FeatureWriteBlock";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import { AppBackButton } from "@/components/navigation/AppBackButton";

export default function WriteByCategoryPage() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const rawId = typeof params?.categoryId === "string" ? params.categoryId : "";
  const categoryId = rawId === "exchang" ? "exchange" : rawId;

  const [category, setCategory] = useState<CategoryWithSettings | null>(null);
  const [status, setStatus] = useState<"loading" | "found" | "not_found" | "no_write">("loading");

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
    const user = getCurrentUser();
    if (!ensureClientAccessOrRedirect(router, user, pathname || `/write/${categoryId}`)) {
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
      const href = getCategoryHref(category);
      router.replace(href);
    },
    [category, router]
  );

  const handleCancel = useCallback(() => {
    if (category) router.push(getCategoryHref(category));
    else router.back();
  }, [category, router]);

  if (rawId === "exchang") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-[14px] text-sam-muted">
        이동 중…
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-[14px] text-sam-muted">
        불러오는 중…
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <p className="text-[15px] font-medium text-sam-fg">카테고리를 찾을 수 없습니다.</p>
        <div className="mt-4 flex justify-center">
          <AppBackButton className="text-signature hover:bg-signature/10" />
        </div>
      </div>
    );
  }

  if (status === "no_write" && category) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <p className="text-[15px] font-medium text-sam-fg">이 카테고리에는 글을 쓸 수 없습니다.</p>
        <button
          type="button"
          onClick={() => router.push(getCategoryHref(category))}
          className="mt-4 text-[14px] text-signature"
        >
          카테고리로 돌아가기
        </button>
      </div>
    );
  }

  if (status !== "found" || !category) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-[14px] text-sam-muted">카테고리 정보를 불러오는 중입니다.</p>
      </div>
    );
  }

  switch (category.type) {
    case "trade":
      if (category.icon_key === "jobs" || category.icon_key === "job") {
        return (
          <JobsWriteForm
            category={category}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
          />
        );
      }
      if (
        category.icon_key === "exchange" ||
        category.slug === "exchange" ||
        category.slug === "current"
      ) {
        return (
          <ExchangeWriteForm
            category={category}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
          />
        );
      }
      return (
        <TradeWriteForm
          category={category}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      );
    case "community":
      return (
        <CommunityWriteForm
          category={category}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
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
        <div className="flex min-h-screen items-center justify-center bg-background text-[14px] text-sam-muted">
          지원하지 않는 카테고리 타입입니다.
        </div>
      );
  }
}
