"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getCategoryBySlugOrId } from "@/lib/categories/getCategoryById";
import type { CategoryWithSettings } from "@/lib/categories/types";
import type { OwnerEditPostSnapshot, TradePolicyClient } from "@/lib/posts/owner-edit-post-snapshot";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  ensureClientAccessOrRedirect,
  redirectForBlockedAction,
} from "@/lib/auth/client-access-flow";
import { TradeWriteForm } from "@/components/write/trade/TradeWriteForm";
import { ExchangeWriteForm } from "@/components/write/trade/ExchangeWriteForm";
import { JobsWriteForm } from "@/components/write/trade/JobsWriteForm";
import { AppBackButton } from "@/components/navigation/AppBackButton";

type Props = {
  /** 서버 `app/(main)/products/[id]/edit/page.tsx`에서 `parseId`로 검증된 글 id */
  postId: string;
};

export function ProductTradeEditPageClient({ postId: id }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [snapshot, setSnapshot] = useState<OwnerEditPostSnapshot | null>(null);
  const [tradePolicy, setTradePolicy] = useState<TradePolicyClient | null>(null);
  const [category, setCategory] = useState<CategoryWithSettings | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "locked" | "ready" | "no_write">(
    "loading"
  );
  const [errorMessage, setErrorMessage] = useState("");

  const load = useCallback(async () => {
    const user = getCurrentUser();
    if (!ensureClientAccessOrRedirect(router, user, pathname || `/products/${id}/edit`)) {
      return;
    }
    setStatus("loading");
    let res: Response;
    try {
      res = await fetch(`/api/posts/${encodeURIComponent(id)}/owner-edit`, { credentials: "include" });
    } catch {
      setStatus("error");
      setErrorMessage("네트워크 오류가 났습니다.");
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
        redirectForBlockedAction(router, err || (res.status === 401 ? "로그인이 필요합니다." : null), pathname || `/products/${id}/edit`)
      ) {
        return;
      }
      if (res.status === 403 && data.locked) {
        setStatus("locked");
        setErrorMessage(err || "지금은 수정할 수 없는 상태입니다.");
        return;
      }
      setStatus("error");
      setErrorMessage(err || "불러오지 못했습니다.");
      return;
    }
    const post = data.post;
    if (!post) {
      setStatus("error");
      setErrorMessage("글 정보를 받지 못했습니다.");
      return;
    }
    let c: CategoryWithSettings | null = null;
    try {
      c = await getCategoryBySlugOrId(post.trade_category_id);
    } catch {
      setStatus("error");
      setErrorMessage("카테고리를 찾을 수 없습니다.");
      return;
    }
    if (!c) {
      setStatus("error");
      setErrorMessage("카테고리를 찾을 수 없습니다.");
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
  }, [id, router, pathname]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSuccess = useCallback(
    (postId: string) => {
      router.replace(`/products/${postId}`);
    },
    [router]
  );

  const handleCancel = useCallback(() => {
    if (id) router.push(`/products/${id}`);
    else router.back();
  }, [id, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-[14px] text-gray-500">
        불러오는 중…
      </div>
    );
  }

  if (status === "locked" || status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-[14px] text-gray-700">{errorMessage}</p>
        <AppBackButton className="text-signature hover:bg-signature/10" />
      </div>
    );
  }

  if (status === "no_write" && category && snapshot && id) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <p className="text-[15px] font-medium text-gray-700">이 카테고리에는 글을 쓸 수 없습니다.</p>
        <button
          type="button"
          onClick={() => router.push(`/products/${id}`)}
          className="mt-4 text-[14px] text-signature"
        >
          상품으로 돌아가기
        </button>
      </div>
    );
  }

  if (status !== "ready" || !category || !snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-[14px] text-gray-500">카테고리 정보를 불러오는 중입니다.</p>
      </div>
    );
  }

  if (category.type !== "trade") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-[14px] text-gray-600">이 상품은 이 화면에서 수정할 수 없습니다.</p>
        <Link href={`/products/${id}`} className="text-[14px] font-medium text-signature">
          상품으로
        </Link>
      </div>
    );
  }

  if (category.icon_key === "jobs" || category.icon_key === "job") {
    return (
      <JobsWriteForm
        category={category}
        onSuccess={handleSuccess}
        onCancel={handleCancel}
        editPostId={id}
        ownerEditSnapshot={snapshot}
        tradePolicy={tradePolicy}
      />
    );
  }

  if (category.icon_key === "exchange" || category.slug === "exchange") {
    return (
      <ExchangeWriteForm
        category={category}
        onSuccess={handleSuccess}
        onCancel={handleCancel}
        editPostId={id}
        ownerEditSnapshot={snapshot}
        tradePolicy={tradePolicy}
      />
    );
  }

  return (
    <TradeWriteForm
      category={category}
      onSuccess={handleSuccess}
      onCancel={handleCancel}
      editPostId={id}
      ownerEditSnapshot={snapshot}
      tradePolicy={tradePolicy}
    />
  );
}
