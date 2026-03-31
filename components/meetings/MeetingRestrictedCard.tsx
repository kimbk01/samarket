export function MeetingRestrictedCard({ reason }: { reason: "kicked" | "banned" }) {
  return (
    <div className="mt-3 overflow-hidden rounded-3xl border border-red-100 bg-white shadow-sm">
      <div className="flex items-center gap-3 bg-red-50 px-5 py-4">
        <span className="text-[24px]">🚫</span>
        <div>
          <p className="text-[15px] font-bold text-red-900">접근이 제한된 오픈채팅입니다</p>
          <p className="text-[12px] text-red-600">
            {reason === "kicked" ? "채팅방에서 강퇴되었습니다." : "이 오픈채팅에서 차단되었습니다."}
          </p>
        </div>
      </div>
    </div>
  );
}
