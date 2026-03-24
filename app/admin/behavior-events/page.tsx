import { redirect } from "next/navigation";

export default function BehaviorEventsPage() {
  redirect("/admin/recommendation-analytics?tab=events");
}
