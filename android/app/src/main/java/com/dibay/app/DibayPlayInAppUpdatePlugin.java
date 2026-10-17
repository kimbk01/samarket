package com.dibay.app;

import android.app.Activity;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.dibay.app.call.DibayActiveCallSessionManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.InstallState;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;

/**
 * Google Play In-App Updates (official Play Core App Update API).
 * Android-only Capacitor surface — iOS must never invoke this plugin.
 */
@CapacitorPlugin(name = "DibayPlayInAppUpdate")
public class DibayPlayInAppUpdatePlugin extends Plugin {
  private static final String EVENT_INSTALL_STATUS = "installStatus";
  private static final String EVENT_FLEXIBLE_DOWNLOADED = "flexibleUpdateDownloaded";

  private AppUpdateManager appUpdateManager;
  private ActivityResultLauncher<IntentSenderRequest> updateFlowLauncher;
  private PluginCall pendingFlowCall;
  private String pendingFlowType;
  private boolean installListenerRegistered = false;
  private boolean flowInFlight = false;

  private final InstallStateUpdatedListener installStateListener = this::onInstallState;

  @Override
  public void load() {
    appUpdateManager = AppUpdateManagerFactory.create(getContext());
    ensureUpdateFlowLauncher();
  }

  private void ensureUpdateFlowLauncher() {
    if (updateFlowLauncher != null) return;
    Activity activity = getActivity();
    if (!(activity instanceof ComponentActivity)) return;
    ComponentActivity componentActivity = (ComponentActivity) activity;
    try {
      updateFlowLauncher =
        componentActivity
          .getActivityResultRegistry()
          .register(
            "dibay-play-in-app-update-flow",
            new ActivityResultContracts.StartIntentSenderForResult(),
            this::onUpdateFlowActivityResult
          );
    } catch (IllegalStateException ignored) {
      // Registry registration must happen before STARTED; leave null and reject at call time.
    }
  }

  @Override
  protected void handleOnDestroy() {
    unregisterInstallListener();
    if (updateFlowLauncher != null) {
      try {
        updateFlowLauncher.unregister();
      } catch (RuntimeException ignored) {
        // Registry may already be torn down with the Activity.
      }
      updateFlowLauncher = null;
    }
    pendingFlowCall = null;
    pendingFlowType = null;
    flowInFlight = false;
    super.handleOnDestroy();
  }

  @Override
  protected void handleOnResume() {
    super.handleOnResume();
    if (appUpdateManager == null) return;
    appUpdateManager
      .getAppUpdateInfo()
      .addOnSuccessListener(this::onResumeAppUpdateInfo)
      .addOnFailureListener(e -> {
        // Resume probing is best-effort; JS can re-check explicitly.
      });
  }

  @PluginMethod
  public void getInstalledVersion(PluginCall call) {
    try {
      call.resolve(readInstalledVersionObject());
    } catch (Exception e) {
      call.reject("installed_version_failed", e.getMessage() != null ? e.getMessage() : "installed_version_failed", e);
    }
  }

  @PluginMethod
  public void getUpdateInfo(PluginCall call) {
    if (appUpdateManager == null) {
      call.reject("update_manager_unavailable", "AppUpdateManager is not available");
      return;
    }
    appUpdateManager
      .getAppUpdateInfo()
      .addOnSuccessListener(info -> call.resolve(toUpdateInfoObject(info)))
      .addOnFailureListener(e ->
        call.reject(
          "update_info_failed",
          e.getMessage() != null ? e.getMessage() : "Play update info request failed",
          e
        )
      );
  }

  @PluginMethod
  public void startFlexibleUpdate(PluginCall call) {
    startUpdateFlow(call, AppUpdateType.FLEXIBLE, "flexible");
  }

  @PluginMethod
  public void startImmediateUpdate(PluginCall call) {
    startUpdateFlow(call, AppUpdateType.IMMEDIATE, "immediate");
  }

  @PluginMethod
  public void completeFlexibleUpdate(PluginCall call) {
    if (appUpdateManager == null) {
      call.reject("update_manager_unavailable", "AppUpdateManager is not available");
      return;
    }
    if (isCallBlockingUpdateUi()) {
      call.reject("call_in_progress", "Update install deferred while a call is active");
      return;
    }
    appUpdateManager.completeUpdate();
    JSObject ret = new JSObject();
    ret.put("ok", true);
    call.resolve(ret);
  }

  private void startUpdateFlow(PluginCall call, int updateType, String flowType) {
    if (appUpdateManager == null) {
      call.reject("update_manager_unavailable", "AppUpdateManager is not available");
      return;
    }
    ensureUpdateFlowLauncher();
    if (updateFlowLauncher == null) {
      call.reject("activity_result_unavailable", "Activity result launcher is not registered");
      return;
    }
    if (flowInFlight || pendingFlowCall != null) {
      call.reject("update_flow_in_flight", "Another Play update flow is already in progress");
      return;
    }
    if (isCallBlockingUpdateUi()) {
      call.reject("call_in_progress", "Play update UI blocked while a call is active");
      return;
    }

    flowInFlight = true;
    pendingFlowCall = call;
    pendingFlowType = flowType;

    appUpdateManager
      .getAppUpdateInfo()
      .addOnSuccessListener(info -> {
        if (info.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE
          && info.updateAvailability() != UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) {
          failPendingFlow("update_not_available", "No Play Store update is available");
          return;
        }
        if (!info.isUpdateTypeAllowed(updateType)) {
          failPendingFlow("update_type_not_allowed", "Requested update type is not allowed by Play");
          return;
        }
        if (updateType == AppUpdateType.FLEXIBLE) {
          registerInstallListener();
        }
        try {
          boolean started =
            appUpdateManager.startUpdateFlowForResult(
              info,
              updateFlowLauncher,
              AppUpdateOptions.newBuilder(updateType).build()
            );
          if (!started) {
            failPendingFlow("update_flow_not_started", "Play declined to start the update flow");
          }
        } catch (Exception e) {
          failPendingFlow(
            "update_flow_start_failed",
            e.getMessage() != null ? e.getMessage() : "Failed to start Play update flow"
          );
        }
      })
      .addOnFailureListener(e ->
        failPendingFlow(
          "update_info_failed",
          e.getMessage() != null ? e.getMessage() : "Play update info request failed"
        )
      );
  }

  private void onUpdateFlowActivityResult(ActivityResult result) {
    PluginCall call = pendingFlowCall;
    String flowType = pendingFlowType;
    pendingFlowCall = null;
    pendingFlowType = null;
    flowInFlight = false;

    int resultCode = result.getResultCode();
    JSObject ret = new JSObject();
    ret.put("flowType", flowType != null ? flowType : "");
    ret.put("resultCode", resultCode);

    if (call == null) {
      return;
    }

    if (resultCode == Activity.RESULT_OK) {
      ret.put("ok", true);
      ret.put("status", "accepted");
      call.resolve(ret);
      return;
    }
    if (resultCode == Activity.RESULT_CANCELED) {
      ret.put("ok", false);
      ret.put("status", "canceled");
      call.resolve(ret);
      return;
    }
    // Play documents Activity.RESULT_IN_APP_UPDATE_FAILED as 1 in some paths;
    // treat any non-OK / non-CANCEL as failed without looping forever.
    ret.put("ok", false);
    ret.put("status", "failed");
    call.resolve(ret);
  }

  private void onResumeAppUpdateInfo(AppUpdateInfo info) {
    if (info == null) return;

    if (info.installStatus() == InstallStatus.DOWNLOADED) {
      notifyFlexibleDownloaded(info);
    }

    if (info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
      && info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)
      && updateFlowLauncher != null
      && !flowInFlight
      && !isCallBlockingUpdateUi()) {
      flowInFlight = true;
      pendingFlowType = "immediate_resume";
      try {
        appUpdateManager.startUpdateFlowForResult(
          info,
          updateFlowLauncher,
          AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build()
        );
      } catch (Exception ignored) {
        flowInFlight = false;
        pendingFlowType = null;
      }
    }
  }

  private void onInstallState(InstallState state) {
    if (state == null) return;
    JSObject payload = new JSObject();
    payload.put("installStatus", installStatusName(state.installStatus()));
    payload.put("bytesDownloaded", state.bytesDownloaded());
    payload.put("totalBytesToDownload", state.totalBytesToDownload());
    notifyListeners(EVENT_INSTALL_STATUS, payload, true);

    if (state.installStatus() == InstallStatus.DOWNLOADED) {
      JSObject downloaded = new JSObject();
      downloaded.put("installStatus", "DOWNLOADED");
      notifyListeners(EVENT_FLEXIBLE_DOWNLOADED, downloaded, true);
    }
    if (state.installStatus() == InstallStatus.INSTALLED
      || state.installStatus() == InstallStatus.CANCELED
      || state.installStatus() == InstallStatus.FAILED) {
      unregisterInstallListener();
    }
  }

  private void notifyFlexibleDownloaded(AppUpdateInfo info) {
    JSObject downloaded = new JSObject();
    downloaded.put("installStatus", "DOWNLOADED");
    downloaded.put("availableVersionCode", info.availableVersionCode());
    notifyListeners(EVENT_FLEXIBLE_DOWNLOADED, downloaded, true);
  }

  private void registerInstallListener() {
    if (appUpdateManager == null || installListenerRegistered) return;
    appUpdateManager.registerListener(installStateListener);
    installListenerRegistered = true;
  }

  private void unregisterInstallListener() {
    if (appUpdateManager == null || !installListenerRegistered) return;
    try {
      appUpdateManager.unregisterListener(installStateListener);
    } catch (RuntimeException ignored) {
      // Listener may already be gone.
    }
    installListenerRegistered = false;
  }

  private void failPendingFlow(String code, String message) {
    PluginCall call = pendingFlowCall;
    pendingFlowCall = null;
    pendingFlowType = null;
    flowInFlight = false;
    unregisterInstallListener();
    if (call != null) {
      call.reject(code, message);
    }
  }

  private boolean isCallBlockingUpdateUi() {
    String activeId = DibayActiveCallSessionManager.getActiveCallId();
    return activeId != null && !activeId.trim().isEmpty();
  }

  private JSObject readInstalledVersionObject() throws PackageManager.NameNotFoundException {
    PackageManager pm = getContext().getPackageManager();
    String packageName = getContext().getPackageName();
    PackageInfo info;
    if (Build.VERSION.SDK_INT >= 33) {
      info = pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0));
    } else {
      info = pm.getPackageInfo(packageName, 0);
    }
    long versionCode;
    if (Build.VERSION.SDK_INT >= 28) {
      versionCode = info.getLongVersionCode();
    } else {
      versionCode = info.versionCode;
    }
    JSObject ret = new JSObject();
    ret.put("versionName", info.versionName != null ? info.versionName : "");
    ret.put("versionCode", versionCode);
    ret.put("packageName", packageName);
    return ret;
  }

  private JSObject toUpdateInfoObject(AppUpdateInfo info) {
    JSObject ret = new JSObject();
    ret.put("updateAvailability", updateAvailabilityName(info.updateAvailability()));
    ret.put("updateAvailabilityCode", info.updateAvailability());
    ret.put("installStatus", installStatusName(info.installStatus()));
    ret.put("installStatusCode", info.installStatus());
    ret.put("availableVersionCode", info.availableVersionCode());
    ret.put("packageName", info.packageName());
    Integer staleness = info.clientVersionStalenessDays();
    if (staleness != null) {
      ret.put("clientVersionStalenessDays", staleness.intValue());
    }
    ret.put("updatePriority", info.updatePriority());
    ret.put("flexibleAllowed", info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE));
    ret.put("immediateAllowed", info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE));
    ret.put("callInProgress", isCallBlockingUpdateUi());
    try {
      JSObject installed = readInstalledVersionObject();
      ret.put("installedVersionName", installed.getString("versionName"));
      ret.put("installedVersionCode", installed.getLong("versionCode"));
    } catch (Exception ignored) {
      // Installed version is optional on this payload.
    }
    return ret;
  }

  private static String updateAvailabilityName(int code) {
    if (code == UpdateAvailability.UPDATE_AVAILABLE) return "UPDATE_AVAILABLE";
    if (code == UpdateAvailability.UPDATE_NOT_AVAILABLE) return "UPDATE_NOT_AVAILABLE";
    if (code == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) {
      return "DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS";
    }
    if (code == UpdateAvailability.UNKNOWN) return "UNKNOWN";
    return "OTHER_" + code;
  }

  private static String installStatusName(int code) {
    if (code == InstallStatus.UNKNOWN) return "UNKNOWN";
    if (code == InstallStatus.PENDING) return "PENDING";
    if (code == InstallStatus.DOWNLOADING) return "DOWNLOADING";
    if (code == InstallStatus.DOWNLOADED) return "DOWNLOADED";
    if (code == InstallStatus.INSTALLING) return "INSTALLING";
    if (code == InstallStatus.INSTALLED) return "INSTALLED";
    if (code == InstallStatus.FAILED) return "FAILED";
    if (code == InstallStatus.CANCELED) return "CANCELED";
    if (code == InstallStatus.REQUIRES_UI_INTENT) return "REQUIRES_UI_INTENT";
    return "OTHER_" + code;
  }
}
