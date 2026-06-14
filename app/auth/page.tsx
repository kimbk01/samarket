import { redirect } from "next/navigation";

/** 스펙 `/auth` — 로그인 UI는 `/login` */
export default function AuthEntryAliasPage() {
  redirect("/login");
}
