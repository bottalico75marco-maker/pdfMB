using System.Runtime.InteropServices;

namespace PdfMB.Desktop.Services;

internal static class WindowCaption
{
    // DWMWA_TEXT_COLOR is supported starting with Windows 11 build 22000.
    // The document header inside the window also shows the color on older Windows.
    public static void SetModifiedColor(IntPtr handle, bool modified)
    {
        if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000)) return;
        uint color = modified ? unchecked((uint)ColorTranslator.ToWin32(Color.Firebrick)) : 0xFFFFFFFF;
        _ = DwmSetWindowAttribute(handle, 36, ref color, sizeof(uint));
    }

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr window, uint attribute, ref uint value, int size);
}
