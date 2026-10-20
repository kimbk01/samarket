# A-legacy — 한국 배달앱 사장님(오너) 시스템 벤치마크 (배민 · 요기요 · 쿠팡이츠 · 참고 Grab/foodpanda PH)

작성: 2026-10-20 (PHT) · 목적: DIBAY 오너 시스템 비교용 사실 조사 · 저장소 파일 변경 없음

## 0. 조사 방법·한계 (먼저 읽을 것)

- **환경 제약**: 이 세션의 네트워크 정책상 `ceo.baemin.com`, `self.baemin.com`, `owner.yogiyo.co.kr`, `store.coupangeats.com` 및 대부분 언론사 원문 페이지가 **접속 차단(프록시 403 / DNS 실패)** 되었다. 따라서 근거는 **웹 검색 엔진이 반환한 공식 페이지·앱스토어 설명·보도 스니펫**에 한정된다.
- **검증상태 정의**
  - `VERIFIED` = 플랫폼 공식 출처(앱스토어 공식 앱 설명, 공식 가이드/약관 페이지) 또는 회사 발표를 인용한 보도에서 해당 사실이 검색 결과로 확인됨. (원문 페이지를 직접 열람하지는 못했음 — 위 제약)
  - `REFERENCE_NOT_VERIFIED` = 공식 공개 출처를 찾지 못했거나(로그인 전용 내부 화면), 2차 블로그·업체 홍보글에만 근거, 또는 단일 보도로만 확인되어 교차 확인 불가.
- 사장님 포털의 **실제 사이드메뉴 이름(IA)은 3사 모두 로그인 전용**이라 공식 공개 문서로 확인하지 못했다 → 전부 `REFERENCE_NOT_VERIFIED`. 추측으로 메뉴명을 적지 않았다.
- 수수료율 숫자는 **비교 맥락 기록용**이며 DIBAY 권고값이 아니다.

## 0-1. DIBAY 모델 요약 (비교 기준, 저장소 문서 기준)

- 고객은 **매장에 직접 결제** → 플랫폼이 매출을 수납·지급하지 않음 → **주문별 지급(정산 버튼) 없음** (`docs/store-commission-cash-settlement-ssot.md`).
- 플랫폼 수수료는 **선불 매장 캐시 잔액에서 차감**, 부과·검토 플래그는 **DB 트리거(주문 상태 UPDATE 트랜잭션)만**, 취소·환불 수수료 조정은 `admin_decide_store_commission_adjustment` 로만. Admin·Owner 동일 SQL 조회·컴포넌트.
- 광고: `store_sponsored` / `banner` 2개 유료 상품, 쿠폰·에디토리얼·배달비 프로모션은 광고 아님 (`docs/dibay-delivery-advertising-ssot.md`).
- 상품권: 매장 한정 선불 결제 자산, 쿠폰과 분리, 매출 인식은 사용 시점, 오너 단독 발행 금지(Admin 생성·승인) (`docs/dibay-gift-certificate-hard-lock.md`).

---

## (a) 항목별 비교표

| # | 항목 | 배민 (배달의민족) | 요기요 | 쿠팡이츠 | (선택) Grab / foodpanda PH | 공식 출처 URL | 검증상태 |
|---|---|---|---|---|---|---|---|
| 1 | 입점·승인·계약 | 사장님광장(별도 웹)에서 사업자 회원 가입 → 사업자·매장·메뉴 정보 + 서류(사업자등록증·영업신고증·통장사본 등) 제출 → 심사 후 승인. 서류 목록·심사기간은 공식 확인 불가 | 공개 공식 입점 절차 문서 미확인 | `store.coupangeats.com` 사장님 포털로 가입. 신규 가입 30일 프로모션 요금(1회·어뷰징 시 제외)이 사장님 사이트 안내로 인용됨 | Grab PH: 온보딩 가이드(“Complete Your Onboarding”) 공식 존재. foodpanda PH: `partner.foodpanda.ph` 셀프 가입, 가입 과정에서 수수료 패키지 선택·표시, “판매 발생 시에만 수수료” | 배민: (2차) https://blog.hansungshowcase.kr/baedal-minjok-success-guide · 쿠팡: (2차) https://www.klog.kr/info/쿠팡이츠-사장님-사이트 · Grab: https://merchant.grab.com/en-ph/guides/getting-started · foodpanda: https://www.foodpanda.ph/contents/merchant-partner-signup , https://partner.foodpanda.ph/en | 배민·요기요·쿠팡: REFERENCE_NOT_VERIFIED · Grab/foodpanda: VERIFIED |
| 2 | 오너 인증·권한(직원 계정) | 직원 계정·권한 위임 공식 공개 문서 미확인 | 미확인 | 미확인 | Grab: 앱 역할 **Owner / Store Manager / Cashier** (Cashier=주문 완료·결제 수납만, Owner·Manager=인사이트·프로모션·메뉴·환불). 직원 추가는 Owner·Store Manager만, 임시 비밀번호 이메일 발송, Owner가 “Disable”로 회수. 포털 역할은 Owner/Manager(법인 단위), 앱에서 만든 Manager는 포털 접근 불가 | https://merchant.grab.com/en-ph/guides/manage-your-store/store-owner-and-store-manager-log-in · https://mrc2022.grab.com/guides/manage-your-store/setting-different-store-access-levels-for-each-employee · https://assets.grab.com/wp-content/uploads/sites/8/2021/06/29145818/MY-GrabMerchant-Portal-User-Guide-OVERVIEW-AND-LOGIN.pdf | 한국 3사: REFERENCE_NOT_VERIFIED · Grab: VERIFIED (일부 MY/2021 문서) |
| 3 | 상품/옵션/가격/재고/품절 | 앱 셀프서비스에서 메뉴·사진 관리. 앱 공지: 품절 사유로 주문 거부·취소 시 **필요한 메뉴만 선택해 품절 처리** 권고. 옵션 단위 품절은 외부 POS(토스포스)가 배민·쿠팡 대상 지원 | 앱에서 **품절 메뉴**·임시휴무일·배달 어려운 지역 관리, 재료 소진으로 주문 거절·취소 시 **메뉴 품절을 한 번에** 처리 | 앱에서 고객 화면을 미리 보며 메뉴 **편집·숨김**, 모바일 촬영 사진 바로 등록 | Grab: 포털에서 품목 **일시 품절/삭제**, **판매 수량 제한(sales limit)**, 품목별 **판매 시간대**(영업시간과 불일치 시 매장 당일 자동 일시중지 가능) | 배민: https://apps.apple.com/kr/app/%EB%B0%B0%EB%AF%BC%EC%82%AC%EC%9E%A5%EB%8B%98/id1042003297 · 요기요: https://apps.apple.com/kr/app/%EC%9A%94%EA%B8%B0%EC%9A%94-%EC%82%AC%EC%9E%A5%EB%8B%98/id1303386801 · 쿠팡: https://apps.apple.com/kr/app/%EC%BF%A0%ED%8C%A1%EC%9D%B4%EC%B8%A0-%EC%82%AC%EC%9E%A5%EB%8B%98/id1459484517 · Grab: https://merchant.grab.com/en-ph/blog/why-the-grabmerchant-portal-is-your-best-business-partner , https://merchant.grab.com/en-my/blog/understand-the-relationship-between-menu-availability-schedule-and-operating-hours · 토스: https://tossplace.com/story/delivery-soldout | VERIFIED (각 공식 앱 설명·Grab 공식). 옵션 단위 품절의 플랫폼 자체 지원 여부: REFERENCE_NOT_VERIFIED |
| 4 | 주문 접수·거절·취소·완료 / 자동취소 타임아웃 | 주문목록에서 **[접수] → 배달 예상시간 선택**으로 접수, 항상 같은 시간 설정 가능. 받을 수 없으면 **거부 사유 선택 → 고객 알림**. 주문 유형별 알림음. **미접수 자동취소 시간(분)은 공식 공개 출처 미확인**. 배민이 주문취소율 등 운영 데이터를 수집한다는 보도 | 새 주문 알림 + **미접수 주문 리마인드 알림**. **주문 수락률**이 노출 순위 영향 지표로 앱에 표시. 자동취소 시간 미확인 | 진행 중 주문을 POS와 동일하게 앱에서 관리, 주문 수락 후 조리 시작 → 배달은 쿠팡 배달. 자동취소 시간 미확인. 2026-10 시스템 장애 시 “수락 후 시스템 오류로 최종 취소된 주문” 정상 판매액 전액 보상·자동 정산 발표 | Grab PH 행동강령: 앱은 영업시간 내 온라인 유지, 주문 즉시 처리, 조리시간 추가 필요 시 **2분 내**, 이행 불가 시 **5분 내** Grab에 통지. 회피 가능한 취소 사유 가이드(품절 미반영 등) | 배민: https://apps.apple.com/kr/app/%EB%B0%B0%EB%AF%BC%EC%82%AC%EC%9E%A5%EB%8B%98/id1042003297 · 요기요: https://apps.apple.com/kr/app/%EC%9A%94%EA%B8%B0%EC%9A%94-%EC%82%AC%EC%9E%A5%EB%8B%98/id1303386801 · 쿠팡: https://play.google.com/store/apps/details?id=com.coupang.mobile.eats.merchant , https://www.ytn.co.kr/_ln/0102_202610111808278676 · Grab: https://www.grab.com/ph/terms-policies/code-of-conduct-merchant/ , https://merchant.grab.com/en-ph/guides/default/top-3-avoidable-cancellation-reasons-and-how-you-can-prevent-them | 접수·거부사유·리마인드·수락률: VERIFIED · **한국 3사 자동취소 타임아웃 값: REFERENCE_NOT_VERIFIED** · Grab 2분/5분: VERIFIED |
| 5 | 배달 범위·배달비·배달 상태 (자체 vs 플랫폼) | 두 축: **배민배달(배민1플러스, 플랫폼 배달)** vs **가게배달(자체 배달)**. 2024-08 배민1플러스 요금제 개편(중개수수료+업주부담 배달비 구조), 2025 상생안으로 매출 구간별 차등 수수료·배달비 조정 | 요기요도 2024-11 상생협의체 합의로 중개수수료 차등화. 앱에서 **배달 어려운 지역** 관리 | 기본 플랫폼 배달(쿠팡 배달 처리). 2025-04 차등 수수료 적용 보도 | Grab PH: 플랫폼 라이더 + **셀프 픽업·예약 주문** 별도 가이드 | 배민: https://byline.network/2024/07/10_291828719 , https://designcompass.org/2024/07/12/baemin-price-increase/ · 상생안: https://heraldk.com/?p=2460887 , https://www.fnnews.com/news/202501220931217471 · Grab: https://merchant.grab.com/en-ph/guides/default/managing-self-pick-up-orders-and-scheduled-orders | 배달 모델 구분·상생안 시행: VERIFIED(보도) · 반경 설정 방식·배달 상태 단계 UI: REFERENCE_NOT_VERIFIED |
| 6 | 영업시간·휴무·임시중단 | 앱/주문접수 PC에서 **임시휴무·영업 임시중지** 설정. 2026-09-29부터 **사유 선택 의무화**(임시중지 6개: 기상악화·주문폭주·주문저조·재료소진·배차지연·개인사정 / 임시휴무 8개), 배민주문접수 PC·배민사장님앱 우선 적용, “서비스 개선 기초자료” 활용 | 앱에서 **영업 일시중지 설정/해제**(v2.2.6, 2024-05 개선), **임시휴무일** 관리 | 앱 기능 설명에서 일시중지 명시 미확인 | Grab: 상태바에서 **Normal / Busy(조리시간 연장) / Pause(최대 30일)**, 장기 휴무는 **Special Hours**(선택 날짜, 최대 5구간). 행동강령: Pause·Busy 주간 사용 ≤ 주간 영업시간 1%. foodpanda: 혼잡 시 오프라인 + 복귀 시간 지정 | 배민: https://sateconomy.co.kr/news/view/1065612617752561 · 요기요: https://apps.apple.com/kr/app/%EC%9A%94%EA%B8%B0%EC%9A%94-%EC%82%AC%EC%9E%A5%EB%8B%98/id1303386801 · Grab: https://merchant.grab.com/en-my/grabacademy/default/start-receiving-orders-heres-how , https://merchant.grab.com/en-ph/guides/manage-your-store , https://www.grab.com/ph/terms-policies/code-of-conduct-merchant/ · foodpanda: https://integration.foodpanda.com/en/ | 요기요·Grab: VERIFIED · 배민 사유 의무화: REFERENCE_NOT_VERIFIED (단일 보도 2026-09-26, 공식 공지 미열람) · 쿠팡: REFERENCE_NOT_VERIFIED |
| 7 | 매출·수수료·정산·환불 (주기·보류) | 플랫폼이 고객 결제 수납 → 수수료·배달비 공제 후 지급. **2019-04 일 단위 정산 도입, 2022 정산 주기 4일→3일 단축**(보도). 명절 조기 지급(예: 영업일 2일 후 지급) 반복 발표. 정산 보류 조건 공식 미확인 | 앱에서 **최근 3개월 주문 정산내역** 확인. 정산 주기 공식 미확인. 부가세 신고자료 메뉴 존재(2차) | 앱에서 **정산 정보 확인 + 정산금 모바일 인출**, 매출 내역 대시보드. 정산 주기 공식 미확인. 정산액 = 판매액 − 중개이용료·결제수수료·업주부담 배달비·부가세 (2차) | Grab PH: 배달·인스토어 결제 **익일(calendar day) 정산**, 은행계좌 변경은 merchant support 메일. 포털 Finance > Transactions/Transfers, 정산 ID·이체 상태·CSV(MY 가이드). foodpanda: 인보이스(수수료·순지급 내역)·**Payment Advice** 다운로드 | 배민: https://byline.network/2023/01/19_570570/ , https://biz.sbs.co.kr/amp/article/20000334761 , https://www.inews24.com/view/1167865 · 요기요: https://apps.apple.com/kr/app/%EC%9A%94%EA%B8%B0%EC%9A%94-%EC%82%AC%EC%9E%A5%EB%8B%98/id1303386801 · 쿠팡: https://apps.apple.com/kr/app/%EC%BF%A0%ED%8C%A1%EC%9D%B4%EC%B8%A0-%EC%82%AC%EC%9E%A5%EB%8B%98/id1459484517 · Grab: https://www.grab.com/ph/merchant/payment-solutions/ , https://assets.grab.com/wp-content/uploads/sites/8/2021/06/29143442/MY-GrabMerchant-Portal-User-Guide-FINANCE-compressed.pdf · foodpanda: https://partner.foodpanda.ph/en | 배민 주기·조기지급: VERIFIED(회사 발표 보도) · 요기요 3개월 내역·쿠팡 인출: VERIFIED · **정산 보류 조건(3사): REFERENCE_NOT_VERIFIED** · 쿠팡 정산 공식 구성식: REFERENCE_NOT_VERIFIED |
| 8 | 광고·쿠폰·프로모션·상품권 | 정액형(울트라콜)·정률형(오픈리스트)·CPC형(**우리가게클릭**, 클릭당 과금, 희망가 입찰로 순위 결정, 2025-02 단가 범위 조정 공지 보도). 울트라콜 종료·정률제 일원화 보도(시행 시점 공식 미확인). 쿠폰·상품권 오너 메뉴 공식 미확인 | 미확인 | 사장님 광고 메뉴·쿠폰(즉시할인) 공식 공개 문서 미확인. 앱에 “와우 매장 혜택” 현황 표시 | Grab: 역할상 Owner/Manager가 **프로모션 생성** 권한 | 배민: https://www.newsis.com/view/NISX20220517_0001874629 , https://www.mt.co.kr/tech/2025/02/11/2025021018095024119 · 쿠팡: https://apps.apple.com/kr/app/%EC%BF%A0%ED%8C%A1%EC%9D%B4%EC%B8%A0-%EC%82%AC%EC%9E%A5%EB%8B%98/id1459484517 · Grab: https://mrc2022.grab.com/guides/manage-your-store/setting-different-store-access-levels-for-each-employee | 배민 CPC 존재: VERIFIED(보도) · 울트라콜 종료 시점·쿠폰/상품권 오너 흐름(3사): REFERENCE_NOT_VERIFIED |
| 9 | 리뷰·고객응대·분쟁 | 사장님 신고 시 **리뷰 30일 게시중단(임시조치)**, 작성자 동의 시 삭제·미동의 시 30일 후 복원, 근거 정보통신망법 §44-2. 2026-02 배달플랫폼 자율분쟁조정협의회 권고: 주관적 맛 평가는 임시조치 대상 제외 | 앱에 **최근 리뷰 평점**을 노출순위 영향 지표로 표시 | 앱스토어상 리뷰 답변 기능 공식 설명 미확인. 2021 악성리뷰 관련 점주 집단 반발 보도 | Grab: 환불 관리는 Owner/Manager 권한 | 배민: https://v.daum.net/v/20260211232324625?f=p , https://www.etoday.co.kr/news/view/2061840 · 요기요: https://apps.apple.com/kr/app/%EC%9A%94%EA%B8%B0%EC%9A%94-%EC%82%AC%EC%9E%A5%EB%8B%98/id1303386801 · 쿠팡: https://v.daum.net/v/20210621200212170 | 30일 임시조치·2026 권고: VERIFIED(보도) · 사장님 댓글·고객센터 분쟁 처리 절차: REFERENCE_NOT_VERIFIED |
| 10 | 대시보드·사이드메뉴 IA | 앱: 주문접수 + **셀프서비스** + 파트너 정보 탭 구성(앱 설명). 웹 셀프서비스 실제 메뉴명 미확인 | 앱 설명 기준 기능군: 영업 일시중지 / 메뉴 관리 / 정산내역 / 리뷰·수락률 지표 / 가게 관리. 웹 “내 업소 관리” 하위에 부가가치세 신고자료(2차) | 앱 설명 기준 기능군: 매장 현황(매출·와우 혜택) / 주문 관리 / 메뉴 관리 / 정산·인출 | Grab 앱: 탭 **Orders**(상단 상태바) / **Store**(Business hours 등) / Home > **Employees**. 포털: **Finance**(Transactions, Transfers) 등. foodpanda: Merchant Dashboard(주문·배달·메뉴·분석) | 위 각 앱스토어 URL · 요기요 웹(2차): https://help.bznav.com/hc/ko/articles/900007650023 · Grab: https://merchant.grab.com/en-ph/guides/manage-your-store | 한국 3사 웹 사이드메뉴 실제 명칭: **REFERENCE_NOT_VERIFIED** · 앱 기능군: VERIFIED · Grab 탭명: VERIFIED |
| 11 | 모바일/태블릿/PC (POS·주문접수) | **배민사장님 앱(iOS/Android) + 배민주문접수 PC(+ PC LITE, Windows 전용)**, 멀티채널 동시 사용 시 주문 연동. 2024-12-18 POS 자동연동→수동 전환(토스플레이스 안내) | 요기요 사장님 앱 + 사장님 웹 | 쿠팡이츠 사장님 앱(구 “쿠팡이츠 스토어”, iPad 지원) + 웹 포털 + POS 연동 | Grab: GrabMerchant 앱 + 포털 + IM 디바이스. foodpanda: POS 통합 API·파트너 앱 | 배민: https://apps.apple.com/kr/app/%EB%B0%B0%EB%AF%BC%EC%82%AC%EC%9E%A5%EB%8B%98/id1042003297 , https://tossplace.com/story/windows_baemin , https://tossplace.com/story/32363 · 쿠팡: https://apps.apple.com/kr/app/%EC%BF%A0%ED%8C%A1%EC%9D%B4%EC%B8%A0-%EC%82%AC%EC%9E%A5%EB%8B%98/id1459484517?platform=ipad · Grab: https://www.grab.com/ph/community/your-ultimate-guide-to-using-the-grabfood-and-grabmart-im-device/ · foodpanda: https://integration.foodpanda.com/en/ | 앱·PC 채널 존재: VERIFIED · POS 연동 변경: REFERENCE_NOT_VERIFIED(제3자 POS사 안내) |
| 12 | 관리자 개입·감사 | 임시중지 사유 수집(운영 데이터), 주문취소율 수집 보도. 리뷰 임시조치는 플랫폼이 법적 요건 판단. 공정위 신고·제재 착수 보도(배민배달 유도 등) | 수락률·평점을 노출 순위에 반영 | 장애 시 일괄 보상·자동 정산(플랫폼 일괄 개입) | Grab 행동강령: Pause/Busy 사용 한도·응답 시간 의무 → 위반 시 조치 근거. 고객 주문을 골라 받을 수 없음(IM 가이드) | 배민: https://sateconomy.co.kr/news/view/1065612617752561 , https://www.smarttoday.co.kr/ko-kr/articles/96507 · 쿠팡: https://www.ytn.co.kr/_ln/0102_202610111808278676 · Grab: https://www.grab.com/ph/terms-policies/code-of-conduct-merchant/ | Grab·쿠팡 보상: VERIFIED · 한국 3사 관리자 감사 로그·제재 단계 내부 절차: REFERENCE_NOT_VERIFIED |

---

## (b) 검증된 업계 공통 패턴

공식/회사발 출처로 2개 이상 플랫폼에서 확인된 것만 적는다.

1. **영업 상태를 3단계 이상으로 나눈다**: 정상 / 임시중지(복귀 시각 지정 또는 수동 해제) / 임시휴무·특별 영업시간(날짜 지정). 혼잡 시 대응으로 “조리시간 연장(Busy)”을 별도로 두기도 한다. — 요기요 앱, Grab 가이드, foodpanda 통합 페이지, 배민(보도).
2. **임시중지·휴무 사유를 구조화해서 받고**(배민 보도), **사용 한도를 정책으로 둔다**(Grab: 주간 영업시간의 1%). 플랫폼이 운영 품질 데이터로 쓴다.
3. **품절은 메뉴(품목) 단위 토글이 기본**이고, 주문 거절·취소 흐름 안에서 바로 품절 처리하게 연결한다. — 배민·요기요 앱 설명, Grab. Grab은 판매 수량 제한과 품목별 판매 시간대까지 둔다.
4. **주문 접수 = 수락 + 예상 시간 입력**, **거절 = 사유 선택 필수 → 고객 자동 통지**. — 배민 앱 설명. Grab은 시간 연장 2분·이행 불가 5분 내 통지 의무.
5. **미접수 주문은 알림을 반복한다**(요기요 리마인드), **수락률·취소율·평점을 오너에게 지표로 보여주고 노출 순위에 반영한다**(요기요 앱 설명, 배민 취소율 수집 보도).
   - ※ “N분 미접수 시 자동취소” 자체는 업계 통념이지만 **한국 3사의 공식 타임아웃 값은 공개 출처로 확인하지 못했다 (REFERENCE_NOT_VERIFIED)**.
6. **멀티채널 동시 접수**: 모바일 앱 + PC 접수 프로그램(또는 태블릿/POS)에서 같은 주문이 연동된다. — 배민 앱 설명, 쿠팡(iPad·POS), Grab(앱·포털·IM 디바이스).
7. **정산은 짧은 주기(일 단위~영업일 기준 수일)로 돌리고 일자별 내역을 보여준다**, 명절 등에는 조기 지급 공지. 오너는 **정산 내역 조회(요기요 최근 3개월)·명세 다운로드(foodpanda 인보이스·Payment Advice, Grab CSV/이체 상태)** 를 쓴다.
8. **역할 기반 직원 계정**: Owner / Manager / Cashier 구분, 직원 추가·해제는 Owner(·Manager)만. — Grab 공식 (한국 3사는 공개 문서 미확인).
9. **리뷰는 플랫폼이 법적 요건으로 임시조치(게시중단) 여부를 판단**하고, 오너 요청만으로 지우지 않는다. 주관적 평가는 대상에서 빼는 방향(2026-02 권고).
10. **오너 IA 기능군(앱 설명 기준 공통)**: 주문(접수·진행) / 가게·영업 상태 / 메뉴(품절·숨김·사진) / 매출·정산 / 리뷰·운영 지표 / (광고·프로모션) / 직원·설정. 웹 포털 사이드메뉴의 실제 명칭은 로그인 전용이라 미확인.
11. **장애·플랫폼 귀책 취소는 플랫폼이 일괄 보상**하고 증빙 없이 자동 반영한다(쿠팡 2026-10).

---

## (c) DIBAY 에 복사하면 안 되는 패턴 (사업 모델 차이)

| 업계 패턴 | 복사하면 안 되는 이유 (DIBAY 기준) |
|---|---|
| 플랫폼이 고객 결제를 수납하고 수수료를 뺀 뒤 **정산금을 매장에 지급**(일/3영업일 주기, 조기 지급, 모바일 인출) | DIBAY는 **고객이 매장에 직접 결제** → 플랫폼이 지급할 매출 대금이 없다. 주문별 지급 버튼·정산 예정액·지급 큐를 만들면 SSOT 위반(4차에서 구 `store_settlements` 지급 큐 UI를 걷어낸 이유와 같음). |
| **정산 보류**(분쟁·환불 대비 지급 유보) | 유보할 지급금이 없다. DIBAY에서 같은 위험 통제는 **매장 캐시 잔액·미납·주문 제한 정책**과 **취소·환불 수수료 결정(`admin_decide_store_commission_adjustment`)** 이 맡는다. |
| 정산액에서 중개수수료·결제수수료·업주부담 배달비·부가세를 **공제**하는 계산식 | DIBAY 수수료는 **선불 캐시에서 DB 트리거가 차감**. TS·UI에서 수수료 금액을 계산·기록하면 안 된다. 결제대행 수수료는 플랫폼이 결제를 대행하지 않으므로 해당 없음. |
| 플랫폼 귀책 취소 시 “정상 판매액 전액 보상 자동 정산” | 판매 대금이 매장에 직접 들어가므로 보상 경로가 다르다. 보상이 필요하면 수수료 환급/면제(캐시 원장) 범위로만 다뤄야 한다. 판매액 보전 지급 상품을 새로 만들지 않는다. |
| 한국 수수료 요율·**매출 구간별 차등 수수료**·업주부담 배달비 구간 | 한국 상생협의체 합의·공정위 환경의 산물. PH 시장·직접결제 모델과 비용 구조가 다르다. 숫자를 기준값으로 쓰지 않는다. |
| 정액 깃발형(울트라콜)·정률형(오픈리스트)·CPC 입찰(우리가게클릭) 광고 체계 | DIBAY 광고는 `store_sponsored` / `banner` 2개 상품·인벤토리 레지스트리로 고정. 한국식 깃발·입찰 상품을 들여오면 광고 SSOT의 이중 권한 금지에 어긋난다. 또 한국에서 클릭당 과금 불만이 반복 보도된 상품이다. |
| 배민 상품권·브랜드 쿠폰 수수료 모델 | DIBAY 상품권은 매장 한정 **선불 결제 자산**, 쿠폰과 분리, **사용 시점 매출 인식**, 오너 단독 발행 금지. 한국 앱의 쿠폰/상품권 운영 방식을 그대로 섞지 않는다. |
| 리뷰 게시중단 30일 = **한국 정보통신망법 §44-2 임시조치** | 한국 법 근거 제도. PH는 법 체계가 다르므로 기간·절차를 그대로 옮기지 않는다(필리핀 법령 기준으로 따로 정해야 함 — 본 조사 범위 밖). |
| 사업자등록증·영업신고증·통신판매업신고증 등 한국 서류 기반 입점 심사 | PH는 DTI/SEC 등록, Mayor's/Business Permit, BIR 등록 등 서류 체계가 다르다(본 조사에서 PH 서류 요건은 검증하지 않음 — REFERENCE_NOT_VERIFIED). |
| 한국 POS 연동(토스포스 등)·배민주문접수 PC(Windows) 전제 | PH 매장 기기 환경(안드로이드 폰·태블릿 위주 여부 등)은 별도 확인 필요. 한국 POS 생태계 전제를 설계 기준으로 쓰지 않는다. |
| 부가세 신고자료 메뉴(요기요) 등 한국 세무 기능 | PH 세무(BIR) 체계와 다르다. |

DIBAY 에도 그대로 쓸 수 있는 쪽(모델과 무관한 운영 패턴): (b)의 1·2·3·4·6·8·10 — 영업 상태 단계, 사유 구조화, 품목 단위 품절, 수락/거절 사유, 멀티채널 접수, 역할 기반 직원 계정, 기능군 IA. 단, 미접수 자동취소 시간 값은 업계 공식 수치가 확인되지 않았으므로 DIBAY 자체 기준으로 정해야 한다.

---

## 출처 목록 (검색으로 확인한 URL)

- 배민사장님 앱(App Store): https://apps.apple.com/kr/app/%EB%B0%B0%EB%AF%BC%EC%82%AC%EC%9E%A5%EB%8B%98/id1042003297
- 요기요 사장님 앱(App Store): https://apps.apple.com/kr/app/%EC%9A%94%EA%B8%B0%EC%9A%94-%EC%82%AC%EC%9E%A5%EB%8B%98/id1303386801
- 쿠팡이츠 사장님 앱(App Store / Google Play): https://apps.apple.com/kr/app/%EC%BF%A0%ED%8C%A1%EC%9D%B4%EC%B8%A0-%EC%82%AC%EC%9E%A5%EB%8B%98/id1459484517 · https://play.google.com/store/apps/details?id=com.coupang.mobile.eats.merchant
- 배민 임시중지 사유 의무화(2026-09-26 보도): https://sateconomy.co.kr/news/view/1065612617752561
- 배민 정산 주기·조기 지급: https://www.inews24.com/view/1167865 · https://byline.network/2023/01/19_570570/ · https://byline.network/2024/02/06_woowahan · https://biz.sbs.co.kr/amp/article/20000334761
- 배민 2024 요금제 개편: https://byline.network/2024/07/10_291828719 · https://designcompass.org/2024/07/12/baemin-price-increase/
- 상생안(차등 수수료): https://heraldk.com/?p=2460887 · https://www.fnnews.com/news/202501220931217471 · https://news.bizwatch.co.kr/article/consumer/2025/01/22/0015
- 배민 우리가게클릭: https://www.newsis.com/view/NISX20220517_0001874629 · https://www.mt.co.kr/tech/2025/02/11/2025021018095024119
- 리뷰 임시조치·2026 권고: https://v.daum.net/v/20260211232324625?f=p · https://www.etoday.co.kr/news/view/2061840
- 쿠팡이츠 장애 보상(2026-10): https://www.ytn.co.kr/_ln/0102_202610111808278676
- 배민 PC 접수·POS 연동(제3자): https://tossplace.com/story/windows_baemin · https://tossplace.com/story/32363 · https://tossplace.com/story/delivery-soldout
- Grab PH: https://www.grab.com/ph/terms-policies/code-of-conduct-merchant/ · https://merchant.grab.com/en-ph/guides/manage-your-store · https://merchant.grab.com/en-ph/guides/manage-your-store/store-owner-and-store-manager-log-in · https://merchant.grab.com/en-ph/guides/getting-started · https://merchant.grab.com/en-ph/guides/default/managing-self-pick-up-orders-and-scheduled-orders · https://merchant.grab.com/en-ph/guides/default/top-3-avoidable-cancellation-reasons-and-how-you-can-prevent-them · https://merchant.grab.com/en-my/grabacademy/default/start-receiving-orders-heres-how · https://www.grab.com/ph/merchant/payment-solutions/
- foodpanda PH: https://www.foodpanda.ph/contents/merchant-partner-signup · https://partner.foodpanda.ph/en · https://integration.foodpanda.com/en/
