import type { ReactNode } from "react";
import { StoreConsumerShell } from "@/components/stores/StoreConsumerShell";

export default async function StoreSlugLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const safe = typeof slug === "string" ? slug : "";
  return <StoreConsumerShell slug={safe}>{children}</StoreConsumerShell>;
}
