# 모임(moim) 계약 문서 (SSOT)

설계 10장 M0 「이 문서를 계약 문서로 확정」(Owner 2026-11-12 「권장안으로 진행」 D1~D10 + 신원 C안 승인).

모임 작업은 아래 문서를 **이 순서대로** 계약으로 본다. 뒤 문서가 앞 문서의 같은 항목을 바꾼다.

1. `docs/design/moim/moim-design-v1-2026-11-12.md` — 설계 본문 (도메인·데이터·권한·프로세스·알림·어드민·단계 M0~M6)
2. `docs/design/moim/moim-category-dropdown-custom-topic-2026-11-12.md` — 카테고리 드롭다운 · 「기타」 직접 주제 (만들기 4단계)
3. `docs/audit/moim-open-items-audit-2026-11-12.md` — 신고 결과 알림 결정(커뮤니티 설정 따름) · 운영자 권한 · 카테고리 13개 · 백업 삭제 · Android 링크

## 고정 사항 (요약 — 근거는 위 문서)
- 코드: `lib/moim/**`, `app/api/moim/**`, `app/(main)/moim/**`, `components/moim/**`, 어드민 `app/admin/community/moims/**`·`app/api/admin/moim/**`·`components/admin/moim/**`.
- DB: 모임 테이블은 클라이언트 직접 접근 없음 — 모든 쓰기는 service_role 전용 `moim_*` RPC. 오류는 `moim_*` 코드(`lib/moim/moim-error-codes.ts` 에 전부 등록, 시험이 마이그레이션과 대조).
- 메신저: 모임 방은 `owner_domain='moim'` — 메신저 쪽 초대·내보내기·나가기 차단(D1). 채팅 3종 경계는 `lib/chat-domain/samarket-three-chat-pillars.ts`.
- 어드민: 권한 키 `moim` 하나. 모임 삭제·복구·콘텐츠 삭제는 최고관리자. 모든 어드민 쓰기는 사유 필수 + `moim_events`·`audit_logs`.
- 숫자 상한(D6)은 `moim_policies` — NULL = 검사 안 함, 값은 Owner 지정.
