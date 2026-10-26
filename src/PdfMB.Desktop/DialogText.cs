namespace PdfMB.Desktop;

internal static class DialogText
{
    // Shortens a file name in the middle so it fits on one line, keeping the start and the extension readable.
    public static string FitFileName(string name, Font font, int maxWidth)
    {
        const TextFormatFlags flags = TextFormatFlags.SingleLine | TextFormatFlags.NoPrefix;
        bool Fits(string text) => TextRenderer.MeasureText(text, font, Size.Empty, flags).Width <= maxWidth;
        if (Fits(name)) return name;
        string extension = Path.GetExtension(name);
        if (extension.Length > 8) extension = "";
        string stem = name[..^extension.Length];
        string Shorten(int keep) => stem[..((keep + 1) / 2)] + "…" + stem[(stem.Length - keep / 2)..] + extension;
        int low = 0, high = stem.Length - 1;
        while (low < high)
        {
            int mid = (low + high + 1) / 2;
            if (Fits(Shorten(mid))) low = mid; else high = mid - 1;
        }
        return Shorten(low);
    }
}
