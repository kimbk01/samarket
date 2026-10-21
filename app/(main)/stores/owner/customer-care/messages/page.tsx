import { redirect } from "next/navigation";
import { buildOwnerCareCenterRedirectHref } from "@/lib/business/owner-routes";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** 목록 URL 호환 — 고객센터 `tab=messages` 로 서버 redirect (IA-12, 1홉). 스레드 상세는 하위 경로 유지. */
export default async function OwnerCustomerCareMessagesPage({ searchParams }: PageProps) {
  redirect(buildOwnerCareCenterRedirectHref("messages", await searchParams));
}
