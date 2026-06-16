package com.dibay.app;

import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

/** Safe-area helpers for incoming call surfaces. */
public final class IncomingCallUiInsets {
  private IncomingCallUiInsets() {}

  public static void applyTopSafeArea(View target, int extraTopDp) {
    if (target == null) return;
    final int extraPx = dpToPx(target, extraTopDp);
    ViewCompat.setOnApplyWindowInsetsListener(
        target,
        (view, insets) -> {
          Insets bars =
              insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
          view.setPadding(view.getPaddingLeft(), bars.top + extraPx, view.getPaddingRight(), view.getPaddingBottom());
          return insets;
        });
    ViewCompat.requestApplyInsets(target);
  }

  public static void applyBottomSafeArea(View target, int extraBottomDp) {
    if (target == null) return;
    final int extraPx = dpToPx(target, extraBottomDp);
    ViewCompat.setOnApplyWindowInsetsListener(
        target,
        (view, insets) -> {
          Insets nav =
              insets.getInsets(
                  WindowInsetsCompat.Type.navigationBars()
                      | WindowInsetsCompat.Type.systemGestures()
                      | WindowInsetsCompat.Type.displayCutout());
          view.setPadding(view.getPaddingLeft(), view.getPaddingTop(), view.getPaddingRight(), nav.bottom + extraPx);
          return insets;
        });
    ViewCompat.requestApplyInsets(target);
  }

  private static int dpToPx(View view, int dp) {
    return Math.round(dp * view.getResources().getDisplayMetrics().density);
  }
}
