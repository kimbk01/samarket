"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { parseSlug } from "@/lib/validate-params";
import { ShopHomePage } from "@/components/business/ShopHomePage";

export default function ShopSlugRoute() {
  const params = useParams();
  const slug = parseSlug(params.slug);

  if (!slug) {
    return (
      <div className="px-4 py-8 text-center text-[14px] text-sam-muted">
        <Link href="/home" className="text-signature">홈으로</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex items-center border-b border-sam-border-soft bg-sam-surface px-4 py-3">
        <AppBackButton backHref="/" />
        <h1 className="flex-1 text-center text-[16px] font-semibold text-sam-fg">
          상점
        </h1>
        <span className="w-11 shrink-0" />
      </header>
      <div className="px-4 py-4">
        <ShopHomePage slug={slug} />
      </div>
    </div>
  );
}
