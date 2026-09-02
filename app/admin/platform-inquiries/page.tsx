import { redirect } from "next/navigation";

/** A2-2: legacy platform inquiry queue demoted to Support archive. */
export default function AdminPlatformInquiriesRoute() {
  redirect("/admin/support/archive");
}
