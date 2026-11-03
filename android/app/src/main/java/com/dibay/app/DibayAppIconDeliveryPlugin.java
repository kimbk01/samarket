package com.dibay.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor bridge for Android Delivery Adapter v1.
 * JS passes projected appIconTotal only — no Kernel recalculation.
 */
@CapacitorPlugin(name = "DibayAppIconDelivery")
public class DibayAppIconDeliveryPlugin extends Plugin {

  @PluginMethod
  public void apply(PluginCall call) {
    Integer count = call.getInt("count");
    if (count == null) {
      call.reject("count_required");
      return;
    }
    DibayAppIconDeliveryAdapter.apply(getContext(), count);
    JSObject ret = new JSObject();
    ret.put("ok", true);
    ret.put("count", Math.max(0, count));
    call.resolve(ret);
  }

  /**
   * 앱이 백그라운드로 갈 때 마지막 총수로 다시 계산 — 앱 안에서 알림을 읽어 알림창 카드가 지워진 뒤(웹 경로,
   * 순서 보장 없음)의 알림창 기준으로 요약 카드 숫자를 맞춘다. docs/audit/app-icon-badge-plus1-proof-and-design-2026-11-04.md
   */
  @Override
  protected void handleOnStop() {
    super.handleOnStop();
    DibayAppIconDeliveryAdapter.reapplyLast(getContext());
  }
}
