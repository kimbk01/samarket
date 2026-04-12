export function MeetingRestrictedCard({ reason }: { reason: "kicked" | "banned" }) {
  return (
    <div className="mt-3 overflow-hidden rounded-ui-rect border border-red-100 bg-sam-surface shadow-sm">
      <div className="flex items-center gap-3 bg-red-50 px-5 py-4">
        <span className="text-[24px]">🚫</span>
        <div>
          <p className="text-[15px] font-bold text-red-900">접근이 제한된 모임입니다</p>
          <p className="text-[12px] text-red-600">
            {reason === "kicked" ? "모임에서 제외되었습니다." : "이 모임에서 차단되었습니다."}
          </p>
        </div>
      </div>
    </div>
  );
}
