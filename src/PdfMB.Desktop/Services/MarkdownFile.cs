using System.Security.Cryptography;
using System.Text;

namespace PdfMB.Desktop.Services;

internal static class MarkdownFile
{
    public const int MaximumBytes = 8 * 1024 * 1024;
    private static readonly UTF8Encoding Utf8 = new(false, true);

    public static async Task<(string Text, FileStamp Stamp)> ReadAsync(string path)
    {
        if (!File.Exists(path)) return ("", new FileStamp(false, null));
        await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete,
            81920, FileOptions.Asynchronous);
        if (stream.Length > MaximumBytes) throw new InvalidDataException("Il Markdown supera il limite di 8 MB.");
        var bytes = new byte[checked((int)stream.Length)];
        await stream.ReadExactlyAsync(bytes);
        return (Utf8.GetString(bytes).TrimStart('\uFEFF'), new FileStamp(true, Convert.ToHexString(SHA256.HashData(bytes))));
    }

    public static Task WriteAsync(string path, string text, FileStamp stamp)
    {
        if (!path.EndsWith(".md", StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Scegliere un file con estensione .md.");
        var bytes = Utf8.GetBytes(text);
        if (bytes.Length > MaximumBytes) throw new InvalidDataException("Il Markdown supera il limite di 8 MB.");
        return PdfFile.WriteDataAtomicAsync(path, bytes, stamp);
    }
}
