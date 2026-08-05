import { redirect } from "next/navigation";

/** Legacy notes list → CS Inquiry (Phase 3). */
export default function LegacyNotesListRedirect() {
  redirect("/mypage/inquiries");
}
