import { redirect } from "next/navigation";

/** A2-2: legacy Care queue demoted to Support archive. */
export default function AdminMemberNotesRoutePage() {
  redirect("/admin/support/archive");
}
