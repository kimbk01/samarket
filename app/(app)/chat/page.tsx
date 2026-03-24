import { redirect } from "next/navigation";

/** 6단계: 채팅 목록을 /chats 로 통일 */
export default function ChatPage() {
  redirect("/chats");
}
