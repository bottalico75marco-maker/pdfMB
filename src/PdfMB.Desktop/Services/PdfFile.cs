using System.Text;
using System.Security.Cryptography;

namespace PdfMB.Desktop.Services;

internal sealed record FileStamp(bool Exists, string? Hash);
internal sealed class FileChangedException() : IOException("Il file su disco è cambiato. Usare Salva con nome per non sovrascrivere modifiche esterne.");

internal sealed record PdfFile(string Path, byte[] Bytes)
{
    public const int MaximumBytes = 64 * 1024 * 1024;
    public string Name => System.IO.Path.GetFileName(Path);
    public string Fingerprint { get; } = Convert.ToHexString(SHA256.HashData(Bytes));

    public static async Task<PdfFile> ReadAsync(string path)
    {
        string fullPath = System.IO.Path.GetFullPath(path);
        await using var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read,
            81920, FileOptions.Asynchronous | FileOptions.SequentialScan);
        if (stream.Length > MaximumBytes)
            throw new InvalidDataException("Sono supportati PDF fino a 64 MB.");
        if (stream.Length < 8)
            throw new InvalidDataException("Il file non contiene un PDF valido.");
        var bytes = new byte[checked((int)stream.Length)];
        await stream.ReadExactlyAsync(bytes);
        Validate(bytes);
        return new PdfFile(fullPath, bytes);
    }

    public static void Validate(byte[] bytes)
    {
        if (bytes.Length < 8 || bytes.Length > MaximumBytes)
            throw new InvalidDataException("Dimensione PDF non valida (massimo 64 MB).");
        if (!Encoding.ASCII.GetString(bytes, 0, Math.Min(1024, bytes.Length)).Contains("%PDF-", StringComparison.Ordinal))
            throw new InvalidDataException("Intestazione PDF non trovata.");
    }

    public static async Task<FileStamp> GetStampAsync(string path)
    {
        if (!File.Exists(path)) return new FileStamp(false, null);
        await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete,
            81920, FileOptions.Asynchronous | FileOptions.SequentialScan);
        return new FileStamp(true, Convert.ToHexString(await SHA256.HashDataAsync(stream)));
    }

    public static async Task WriteAtomicAsync(string destination, byte[] bytes, FileStamp expected)
    {
        Validate(bytes);
        await WriteDataAtomicAsync(destination, bytes, expected);
    }

    internal static async Task WriteDataAtomicAsync(string destination, byte[] bytes, FileStamp expected)
    {
        string path = System.IO.Path.GetFullPath(destination);
        string temporaryPath = System.IO.Path.Combine(System.IO.Path.GetDirectoryName(path)!,
            $".pdfmb-{Guid.NewGuid():N}.tmp");
        try
        {
            await using (var stream = new FileStream(temporaryPath, FileMode.CreateNew, FileAccess.Write,
                FileShare.None, 81920, FileOptions.Asynchronous | FileOptions.WriteThrough))
            {
                await stream.WriteAsync(bytes);
                await stream.FlushAsync();
                stream.Flush(flushToDisk: true);
            }
            if (expected.Exists)
            {
                if (!File.Exists(path)) throw new FileChangedException();
                // Deny concurrent writes during the fingerprint check and replacement.
                await using var existing = new FileStream(path, FileMode.Open, FileAccess.Read,
                    FileShare.Read | FileShare.Delete, 81920, FileOptions.Asynchronous | FileOptions.SequentialScan);
                var actual = Convert.ToHexString(await SHA256.HashDataAsync(existing));
                if (!string.Equals(expected.Hash, actual, StringComparison.Ordinal)) throw new FileChangedException();
                File.Replace(temporaryPath, path, destinationBackupFileName: null);
            }
            else
            {
                if (File.Exists(path)) throw new FileChangedException();
                File.Move(temporaryPath, path);
            }
        }
        finally
        {
            if (File.Exists(temporaryPath)) File.Delete(temporaryPath);
        }
    }
}
