"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getCategoryBySlugOrId } from "@/lib/categories/getCategoryById";
import type { CategoryWithSettings } from "@/lib/categories/types";
import type { OwnerEditPostSnapshot, TradePolicyClient } from "@/lib/posts/owner-edit-post-snapshot";
import {
  ensureClientAccessOrRedirectAsync,
  redirectForBlockedAction,
} from "@/lib/auth/client-access-flow";
import { TradeCategoryWriteForm } from "@/components/write/trade/TradeCategoryWriteForm";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { beginRouteEntryPerf } from "@/lib/runtime/samarket-runtime-debug";

type Props = {
  /** 서버 `app/(main)/products/[id]/edit/page.tsx`에서 `parseId`로 검증된 글 id */
  postId: string;
};

export function ProductTradeEditPageClient({ postId: id }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const detailHref = `/post/${id}`;

  const [snapshot, setSnapshot] = useState<OwnerEditPostSnapshot | null>(null);
  const [tradePolicy, setTradePolicy] = useState<TradePolicyClient | null>(null);
  const [category, setCategory] = useState<CategoryWithSettings | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "locked" | "ready" | "no_write">(
    "loading"
  );
  const [errorMessage, setErrorMessage] = useState("");

  const load = useCallback(async () => {
    if (!(await ensureClientAccessOrRedirectAsync(router, pathname || `/products/${id}/edit`))) {
      return;
    }
    setStatus("loading");
    let res: Response;
    try {
      res = await fetch(`/api/posts/${encodeURIComponent(id)}/owner-edit`, { credentials: "include" });
    } catch {
      setStatus("error");
      setErrorMessage(t("common_network_error"));
      return;
    }
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      locked?: boolean;
      post?: OwnerEditPostSnapshot;
      tradePolicy?: TradePolicyClient;
    };
    if (!res.ok || !data.ok) {
      const err = typeof data.error === "string" ? data.error : "";
      if (
        redirectForBlockedAction(router, err || (res.status === 401 ? t("common_login_required") : null), pathname || `/products/${id}/edit`)
      ) {
        return;
      }
      if (res.status === 403 && data.locked) {
        setStatus("locked");
        setErrorMessage(err || t("ui_product_edit_cannot_edit"));
        return;
      }
      setStatus("error");
      setErrorMessage(err || t("ui_product_edit_load_failed"));
      return;
    }
    const post = data.post;
    if (!post) {
      setStatus("error");
      setErrorMessage(t("ui_product_edit_no_payload"));
      return;
    }
    let c: CategoryWithSettings | null = null;
    try {
      c = await getCategoryBySlugOrId(post.trade_category_id);
    } catch {
      setStatus("error");
      setErrorMessage(t("trade_120"));
      return;
    }
    if (!c) {
      setStatus("error");
      setErrorMessage(t("trade_120"));
      return;
    }
    if (c.settings && !c.settings.can_write) {
      setSnapshot(post);
      setTradePolicy(data.tradePolicy ?? null);
      setCategory(c);
      setStatus("no_write");
      return;
    }
    setSnapshot(post);
    setTradePolicy(data.tradePolicy ?? null);
    setCategory(c);
    setStatus("ready");
  }, [id, router, pathname, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSuccess = useCallback(
    (postId: string) => {
      router.replace(`/post/${postId}`);
    },
    [router]
  );

  const handleCancel = useCallback(() => {
    if (id) router.push(`/post/${id}`);
    else router.back();
  }, [id, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background sam-text-body text-sam-muted">
        {t("common_loading")}
      </div>
    );
  }

  if (status === "locked" || status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="sam-text-body text-sam-fg">{errorMessage}</p>
        <AppBackButton className="text-signature hover:bg-signature/10" />
      </div>
    );
  }

  if (status === "no_write" && category && snapshot && id) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <p className="sam-text-body font-medium text-sam-fg">{t("trade_098")}</p>
        <button
          type="button"
          onPointerEnter={() => void router.prefetch(detailHref)}
          onFocus={() => void router.prefetch(detailHref)}
          onClick={() => {
            beginRouteEntryPerf("product_detail", detailHref);
            router.push(detailHref);
          }}
          className="mt-4 sam-text-body text-signature"
        >
          {t("ui_product_edit_back_to_product")}
        </button>
      </div>
    );
  }

  if (status !== "ready" || !category || !snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="sam-text-body text-sam-muted">{t("trade_119")}</p>
      </div>
    );
  }

  if (category.type !== "trade") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="sam-text-body text-sam-muted">{t("ui_product_edit_cannot_edit")}</p>
        <Link
          href={detailHref}
          onPointerEnter={() => void router.prefetch(detailHref)}
          onFocus={() => void router.prefetch(detailHref)}
          onClick={() => beginRouteEntryPerf("product_detail", detailHref)}
          className="sam-text-body font-medium text-signature"
        >
          {t("ui_product_edit_back_short")}
        </Link>
      </div>
    );
  }

  return (
    <TradeCategoryWriteForm
      category={category}
      onSuccess={handleSuccess}
      onCancel={handleCancel}
      editPostId={id}
      ownerEditSnapshot={snapshot}
      tradePolicy={tradePolicy}
    />
  );
}
