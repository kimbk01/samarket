using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.Windows.AppLifecycle;

namespace DibayDesktop;

/// <summary>
/// W2 단일 실행 — 로그인 복귀(dibay://auth/callback)로 앱이 다시 실행되면, 이미 켜진 창으로 활성화를 넘기고 종료한다.
/// 창이 두 개가 되지 않게 한다. Microsoft 「Windows App SDK 앱 단일 인스턴스」 방식(AppInstance.FindOrRegisterForKey).
/// </summary>
public static class Program
{
    private const string InstanceKey = "dibay-main";

    [STAThread]
    private static int Main(string[] args)
    {
        WinRT.ComWrappersSupport.InitializeComWrappers();
        if (RedirectToExistingInstance())
        {
            return 0;
        }

        // 람다 매개변수를 `_` 로 두면 아래 `_ = new App()` 이 버림이 아니라 매개변수 대입이 되어 CS0029 (2026-11-08 노트북 빌드 오류)
        Application.Start(p =>
        {
            var context = new DispatcherQueueSynchronizationContext(DispatcherQueue.GetForCurrentThread());
            SynchronizationContext.SetSynchronizationContext(context);
            _ = new App();
        });
        return 0;
    }

    /// <returns>다른 인스턴스로 넘겼으면 true (이 프로세스는 끝낸다)</returns>
    private static bool RedirectToExistingInstance()
    {
        var activationArgs = AppInstance.GetCurrent().GetActivatedEventArgs();
        var keyInstance = AppInstance.FindOrRegisterForKey(InstanceKey);
        if (keyInstance.IsCurrent)
        {
            keyInstance.Activated += App.OnRedirectedActivation;
            return false;
        }

        var redirectDone = CreateEvent(IntPtr.Zero, true, false, null);
        Task.Run(() =>
        {
            keyInstance.RedirectActivationToAsync(activationArgs).AsTask().Wait();
            SetEvent(redirectDone);
        });
        const uint CwmoDefault = 0;
        const uint Infinite = 0xFFFFFFFF;
        _ = CoWaitForMultipleObjects(CwmoDefault, Infinite, 1, new[] { redirectDone }, out _);

        // 사용자가 방금 브라우저에서 넘어왔으므로 이 프로세스가 앞으로 보낼 권한이 있다.
        try
        {
            var process = Process.GetProcessById((int)keyInstance.ProcessId);
            if (process.MainWindowHandle != IntPtr.Zero)
            {
                SetForegroundWindow(process.MainWindowHandle);
            }
        }
        catch (ArgumentException)
        {
            // 기존 프로세스가 막 끝난 경우 — 무시.
        }
        return true;
    }

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateEvent(IntPtr lpEventAttributes, bool bManualReset, bool bInitialState, string? lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetEvent(IntPtr hEvent);

    [DllImport("ole32.dll")]
    private static extern uint CoWaitForMultipleObjects(uint dwFlags, uint dwMilliseconds, ulong nHandles, IntPtr[] pHandles, out uint dwIndex);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);
}
