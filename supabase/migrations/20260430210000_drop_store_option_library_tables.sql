-- (선택) 옵션을 상품 등록 화면의 options_json 만 쓰는 경우, 미사용 라이브러리 테이블 제거
-- 이미 데이터가 있으면 백업 후 실행하세요.

DROP TABLE IF EXISTS store_option_items;
DROP TABLE IF EXISTS store_option_groups;
