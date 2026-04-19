import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function CommunityWritePage() {
  redirect("/philife/write");
}
