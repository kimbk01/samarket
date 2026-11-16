using System.Runtime.InteropServices;
using Microsoft.UI.Xaml;

namespace DibayDesktop;

/// <summary>
/// 시안 v6 R6 (Owner 2026-11-17 승인 「맥·윈도우는 전체 화면이 아니라 최대 또는 사용자 크기」) — 창 크기 한계.
/// 값은 웹 기기 프로필 표(`lib/device/dibay-device-profile.ts` DESKTOP_WINDOWS)와 같다. 단위 = 창 안쪽(본문) DIP = 웹 CSS px.
/// - 최소 447×667: 왼쪽 세로 메뉴 72 + 가장 작은 휴대폰 화면 375×667 (본문이 휴대폰보다 좁아지지 않게).
/// - 최대 폭 1440 (높이는 화면까지): LOUNGE 카드 3열이 끝까지 차는 폭. 최대화해도 이 폭(가운데).
/// - 처음 열 때 1024×768, 그 뒤로는 마지막 크기(MainWindow 가 기억).
/// Windows App SDK 1.6 에는 최소·최대 크기 속성이 없어(OverlappedPresenter.PreferredMinimumWidth 는 1.7) 창 메시지
/// WM_GETMINMAXINFO 를 받아 정한다 (Win32 문서: WM_GETMINMAXINFO · MINMAXINFO · AdjustWindowRectExForDpi).
/// </summary>
internal sealed class WindowSizeLimits
{
    public const int MinClientWidthDip = 447;
    public const int MinClientHeightDip = 667;
    public const int MaxClientWidthDip = 1440;
    public const int DefaultClientWidthDip = 1024;
    public const int DefaultClientHeightDip = 768;

    private const uint WM_GETMINMAXINFO = 0x0024;
    private const int GWL_STYLE = -16;
    private const int GWL_EXSTYLE = -20;
    private static readonly UIntPtr SubclassId = new(0x0D1BA6);

    private readonly IntPtr _hwnd;
    /// <summary>네이티브가 부르는 대리자 — 가비지 수집되지 않게 필드로 붙잡아 둔다.</summary>
    private readonly SubclassProc _proc;

    public WindowSizeLimits(Window window)
    {
        _hwnd = WinRT.Interop.WindowNative.GetWindowHandle(window);
        _proc = WndProc;
        SetWindowSubclass(_hwnd, _proc, SubclassId, UIntPtr.Zero);
    }

    /// <summary>창 안쪽 크기(DIP) → 창 바깥 크기(실제 픽셀, 제목 표시줄·테두리 포함). 지금 모니터 배율 기준.</summary>
    public (int Width, int Height) OuterPixelsForClientDip(int widthDip, int heightDip)
    {
        var dpi = GetDpiForWindow(_hwnd);
        if (dpi == 0) dpi = 96;
        var rect = new RECT { Left = 0, Top = 0, Right = ToPixels(widthDip, dpi), Bottom = ToPixels(heightDip, dpi) };
        var style = (uint)GetWindowLongValue(_hwnd, GWL_STYLE);
        var exStyle = (uint)GetWindowLongValue(_hwnd, GWL_EXSTYLE);
        AdjustWindowRectExForDpi(ref rect, style, false, exStyle, dpi);
        return (rect.Right - rect.Left, rect.Bottom - rect.Top);
    }

    private static int ToPixels(int dip, uint dpi) => (int)Math.Round(dip * dpi / 96.0);

    private IntPtr WndProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam, UIntPtr id, UIntPtr refData)
    {
        if (msg != WM_GETMINMAXINFO) return DefSubclassProc(hWnd, msg, wParam, lParam);

        // 기본값(작업 영역 크기 등)을 먼저 채운 뒤 최소·최대만 고친다.
        var result = DefSubclassProc(hWnd, msg, wParam, lParam);
        var info = Marshal.PtrToStructure<MINMAXINFO>(lParam);
        var min = OuterPixelsForClientDip(MinClientWidthDip, MinClientHeightDip);
        var max = OuterPixelsForClientDip(MaxClientWidthDip, MinClientHeightDip);

        info.ptMinTrackSize.X = Math.Max(info.ptMinTrackSize.X, min.Width);
        info.ptMinTrackSize.Y = Math.Max(info.ptMinTrackSize.Y, min.Height);
        info.ptMaxTrackSize.X = Math.Max(min.Width, Math.Min(info.ptMaxTrackSize.X, max.Width));
        // 최대화: 화면이 1440 보다 넓으면 폭 1440 으로, 가로 가운데.
        if (info.ptMaxSize.X > max.Width)
        {
            info.ptMaxPosition.X += (info.ptMaxSize.X - max.Width) / 2;
            info.ptMaxSize.X = max.Width;
        }
        Marshal.StructureToPtr(info, lParam, false);
        return result;
    }

    private static IntPtr GetWindowLongValue(IntPtr hWnd, int index) =>
        IntPtr.Size == 8 ? GetWindowLongPtr64(hWnd, index) : new IntPtr(GetWindowLong32(hWnd, index));

    private delegate IntPtr SubclassProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam, UIntPtr id, UIntPtr refData);

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MINMAXINFO
    {
        public POINT ptReserved;
        public POINT ptMaxSize;
        public POINT ptMaxPosition;
        public POINT ptMinTrackSize;
        public POINT ptMaxTrackSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("comctl32.dll", SetLastError = true)]
    private static extern bool SetWindowSubclass(IntPtr hWnd, SubclassProc pfnSubclass, UIntPtr uIdSubclass, UIntPtr dwRefData);

    [DllImport("comctl32.dll")]
    private static extern IntPtr DefSubclassProc(IntPtr hWnd, uint uMsg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool AdjustWindowRectExForDpi(ref RECT lpRect, uint dwStyle, bool bMenu, uint dwExStyle, uint dpi);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
    private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")]
    private static extern int GetWindowLong32(IntPtr hWnd, int nIndex);
}
