"use client";

import { usePathname } from "next/navigation";
import { resolveMainHubPtrDomain } from "@/lib/layout/resolve-main-hub-ptr-domain";

export function useMainHubPtrDomain() {
  const pathname = usePathname();
  return resolveMainHubPtrDomain(pathname);
}
