namespace PdfMB.Desktop.Services;

internal static class PdfDropFiles
{
    public static string? GetPath(IDataObject? data) =>
        data?.GetData(DataFormats.FileDrop) is string[] { Length: 1 } files &&
        string.Equals(Path.GetExtension(files[0]), ".pdf", StringComparison.OrdinalIgnoreCase) && File.Exists(files[0])
            ? files[0] : null;
}
