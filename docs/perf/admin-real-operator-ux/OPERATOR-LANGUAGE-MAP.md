# OPERATOR LANGUAGE MAP

| INTERNAL | SHOW? | OPERATOR LABEL (ko) | SECONDARY |
|---|---|---|---|
| WAITING_ADMIN | yes | 관리자 검토 대기 | technical |
| SUBMITTED | yes | 신청 접수 | |
| SALE_EARN | yes | 판매 Coin 적립 | |
| CONVERT_TO_BUSINESS_CASH | yes | Coin → Cash 전환 | |
| ledger | soften | 원장 기록 | prefer hide as status |
| applied_rate=NOT_AVAILABLE | soften | 당시 적용 환율 기록 없음 | or hide |
| store_order:{uuid} | hide | — | 기술 정보 |
| community_reports | hide as id | 커뮤니티 신고 | |
| DAILY_CRITICAL / FREQUENT / OCCASIONAL / CONFIGURATION | hide | remove from UI | sort only |
| reason_required | never | 사유를 입력해 주세요. | |
| general_direct | yes | 일반 1:1 채팅 | |
| UUID as title | never | store/member/room type | copy in 기술 정보 |
| [QA]… / __QA_… | badge | [테스트] + shortened | |

Implementation: `lib/admin/operator-ux/operator-labels.ts`
