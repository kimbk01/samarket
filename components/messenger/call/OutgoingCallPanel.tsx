"use client";

/**
 * 발신 중(벨 울림) 전용 패널 — `OutgoingCallView` 를 제품 경계로 고정해
 * 네이티브 앱에서 동일 컴포넌트명으로 매핑하기 쉽게 한다.
 */

import type { CallScreenViewModel } from "./call-ui.types";
import { OutgoingCallView } from "./OutgoingCallView";

export type OutgoingCallPanelProps = {
  vm: CallScreenViewModel;
};

export function OutgoingCallPanel(props: OutgoingCallPanelProps) {
  return <OutgoingCallView vm={props.vm} />;
}
