-- 고객센터 문의 유형 「매장 입점 문의」(STORE_PARTNERSHIP, 대상 MEMBER) 안내 시드 (Owner 2026-11-10)
--
-- 유형 정의는 코드 레지스트리(lib/support/support-category-registry.ts)가 단일 정의이고,
-- support_cases.category / support_guidance_entries.category 에는 DB CHECK 제약이 없다
-- (20261202170000_support_cases_ssot.sql · 20261203010000_support_phase3a_semantic_authority.sql 확인).
-- 따라서 제약 변경은 없고, 문의 창 「안내」 단계에 보일 안내 행만 넣는다.
--
-- - 무료 종료일은 어드민 설정값이라 문구에 날짜를 넣지 않는다 (배달 화면 안내로 연결).
-- - 같은 (audience, category, issue_type) 행이 이미 있으면 넣지 않는다 (어드민 수정분 보존 · 재실행 안전).
-- - 이후 수정·비활성화는 어드민 API `/api/admin/support/guidance` 경로 (전용 어드민 화면은 현재 없음).

INSERT INTO public.support_guidance_entries
  (audience, category, issue_type, title, body, enabled, sort_order, cta_kind, cta_target, escalation_allowed)
SELECT v.audience, v.category, v.issue_type, v.title, v.body, true, 0, v.cta_kind, v.cta_target, true
FROM (
  VALUES
    (
      'MEMBER',
      'STORE_PARTNERSHIP',
      'FEE',
      '입점 수수료와 오픈 혜택',
      E'지금 입점하시면 오픈 기념으로 일정 기간 주문 수수료가 무료입니다.\n'
      || E'무료 적용 조건과 종료일은 배달 화면의 안내를 확인해 주세요.\n\n'
      || E'무료 기간이 끝나면 매장 업종별 수수료가 적용됩니다.\n'
      || E'더 궁금한 점은 아래 「상담사에게 문의」로 남겨 주세요.',
      'NONE',
      NULL
    ),
    (
      'MEMBER',
      'STORE_PARTNERSHIP',
      'HOW_TO_APPLY',
      '매장 신청 방법과 준비물',
      E'매장 신청 전에 아래 항목을 준비해 주세요.\n'
      || E'· 전화번호 인증\n'
      || E'· 표시 이름\n'
      || E'· 대표 주소\n'
      || E'· 매장 업종\n\n'
      || E'준비가 되면 「관련 화면 열기」에서 매장 신청을 시작할 수 있습니다.\n'
      || E'오픈 기념 수수료 무료 조건과 종료일은 배달 화면의 안내를 확인해 주세요.',
      'INTERNAL_ROUTE',
      '/stores/owner/apply'
    )
) AS v (audience, category, issue_type, title, body, cta_kind, cta_target)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.support_guidance_entries g
  WHERE g.audience = v.audience
    AND g.category = v.category
    AND g.issue_type = v.issue_type
);
