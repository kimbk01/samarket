import { permanentRedirect } from "next/navigation";

/**
 * P1-3 — ORPHAN quarantine closed for ops entry.
 * Page file kept historically; canonical entry is Domain SSOT menus → /admin.
 * Do not delete this route file (IA C4); redirect only.
 */
export default function AdminOperationsPage() {
  permanentRedirect("/admin");
}
