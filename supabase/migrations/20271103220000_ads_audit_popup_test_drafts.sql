-- 광고 감사 A-6 마무리 (Owner 2026-11-03 「이전의 부분은 테스트 부분이다 삭제 해도 되는 부분」)
-- 백업(복원문): docs/audit/ads-popup-test-drafts-restore-2026-11-03.sql — 9행×28열 INSERT. (재감사 E-5 정정: 옛 주석은 JSON 키를 가리켰다)
--   소재 이미지 8개는 재감사 R4 에서 Storage 에서 지웠다 — 복원 시 작업 Mac 로컬 docs/audit/r4-storage-backup-2026-11-03/(git 미포함) 의 파일을 같은 경로로 다시 올린다.
-- 1) 사장님 팝업 신청 초안 9건 삭제 — 모두 테스트 매장(slug aa11) 2026-09-03~05 · 소재 문구 「P6 Owner Popup QA」·「P6 debit probe」
--    연결 캠페인 0건 · 매장/비즈 캐시 원장 참조 0건 (적용 전 조회).
-- 2) 팝업 패키지 POPUP_7D 끄기 — 사장님 팝업 신규 판매는 꺼져 있음(OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED=false).
--    승인·결제 끝난 신청 3건·반려 1건은 패키지를 다시 고르지 않으므로 영향 없음. 어드민 상업 설정에서 다시 켤 수 있다.

DELETE FROM public.platform_popup_owner_requests
 WHERE request_status = 'draft'
   AND admin_campaign_id IS NULL
   AND id IN (
     'b173b15f-de16-4fe5-8118-404e0938cf2a',
     'ef55f5eb-0883-4ec1-97a3-96c4e456fde7',
     'afc91d56-cb26-4824-a2d5-59221ecff9f3',
     '0644e4b1-d705-48bc-8848-e3dcf1078328',
     '4717079d-0d0e-40e5-816d-f0d2afbee738',
     'dfcd023a-80ec-48bd-a3bd-b0780a4bbab4',
     '9676f736-3527-498a-b957-49756a601427',
     'b1ffeb4e-99cd-4404-a181-272604dd3ca2',
     'f19a9aea-902b-422c-ae6f-69c14a5aa153'
   );

UPDATE public.platform_popup_ad_packages
   SET is_active = false,
       updated_at = now()
 WHERE code = 'POPUP_7D'
   AND is_active = true;
