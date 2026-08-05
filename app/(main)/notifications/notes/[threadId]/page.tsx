import { redirect } from "next/navigation";

type Ctx = { params: Promise<{ threadId: string }> };

/** Legacy notes detail → CS Inquiry detail (Phase 3). */
export default async function LegacyNotesThreadRedirect({ params }: Ctx) {
  const { threadId: raw } = await params;
  const threadId = String(raw ?? "").trim();
  if (!threadId) redirect("/mypage/inquiries");
  redirect(`/mypage/inquiries/${encodeURIComponent(threadId)}`);
}
