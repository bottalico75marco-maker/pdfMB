using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace PdfMB.Desktop.Services;

internal static class FormEmail
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private sealed class Message
    {
        public uint Reserved;
        [MarshalAs(UnmanagedType.LPWStr)] public string Subject = "Modulo PDF compilato";
        [MarshalAs(UnmanagedType.LPWStr)] public string Note = "In allegato il modulo PDF compilato.";
        public IntPtr MessageType, Date, Conversation;
        public uint Flags;
        public IntPtr Originator;
        public uint RecipientCount;
        public IntPtr Recipients;
        public uint FileCount = 1;
        public IntPtr Files;
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct Attachment
    {
        public uint Reserved, Flags, Position;
        [MarshalAs(UnmanagedType.LPWStr)] public string Path;
        [MarshalAs(UnmanagedType.LPWStr)] public string Name;
        public IntPtr Type;
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct Recipient
    {
        public uint Reserved, Class;
        [MarshalAs(UnmanagedType.LPWStr)] public string Name;
        [MarshalAs(UnmanagedType.LPWStr)] public string Address;
        public uint EntrySize;
        public IntPtr Entry;
    }
    [DllImport("MAPI32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern uint MAPISendMailW(IntPtr session, IntPtr parent, Message message, uint flags, uint reserved);

    internal static string DraftContent(byte[] bytes, string email)
    {
        if (email.IndexOfAny(['\r', '\n']) >= 0) throw new InvalidDataException("Destinatario non valido.");
        var encoded = Convert.ToBase64String(bytes, Base64FormattingOptions.InsertLineBreaks);
        return $"X-Unsent: 1\r\nTo: {email}\r\nSubject: Modulo PDF compilato\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=pdfmb-draft\r\n\r\n--pdfmb-draft\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nIn allegato il modulo PDF compilato.\r\n--pdfmb-draft\r\nContent-Type: application/pdf; name=modulo.pdf\r\nContent-Disposition: attachment; filename=modulo.pdf\r\nContent-Transfer-Encoding: base64\r\n\r\n{encoded}\r\n--pdfmb-draft--\r\n";
    }

    public static void Compose(IntPtr parent, byte[] bytes, string email)
    {
        PdfFile.Validate(bytes);
        var draft = DraftContent(bytes, email);
        var folder = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "PdfMB", "Email", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(folder);
        var path = System.IO.Path.Combine(folder, "modulo.pdf"); File.WriteAllBytes(path, bytes);
        var attachment = new Attachment { Path = path, Name = "modulo.pdf", Position = uint.MaxValue };
        var filePtr = Marshal.AllocHGlobal(Marshal.SizeOf<Attachment>());
        var recipientPtr = IntPtr.Zero;
        try
        {
            Marshal.StructureToPtr(attachment, filePtr, false);
            var message = new Message { Files = filePtr };
            if (email.Length > 0)
            {
                recipientPtr = Marshal.AllocHGlobal(Marshal.SizeOf<Recipient>());
                Marshal.StructureToPtr(new Recipient { Class = 1, Name = email, Address = "SMTP:" + email }, recipientPtr, false);
                message.RecipientCount = 1; message.Recipients = recipientPtr;
            }
            uint result;
            try { result = MAPISendMailW(IntPtr.Zero, parent, message, 0x9, 0); } // Always show the compose dialog.
            catch (Exception ex) when (ex is DllNotFoundException or EntryPointNotFoundException or BadImageFormatException) { result = 26; }
            if (result is 0 or 1)
            {
                // Cleanup cannot turn a successful composition into a retry.
                try { File.Delete(path); Directory.Delete(folder); } catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
                return; // MAPI has copied the attachment before returning.
            }
            var eml = System.IO.Path.Combine(folder, "modulo.eml"); File.WriteAllText(eml, draft, new UTF8Encoding(false));
            File.Delete(path);
            try { Process.Start(new ProcessStartInfo(eml) { UseShellExecute = true }); }
            catch (Exception ex) { throw new InvalidOperationException($"Il client predefinito non supporta la composizione con allegati (MAPI {result}). Bozza disponibile in: {eml}", ex); }
        }
        finally
        {
            Marshal.DestroyStructure<Attachment>(filePtr); Marshal.FreeHGlobal(filePtr);
            if (recipientPtr != IntPtr.Zero) { Marshal.DestroyStructure<Recipient>(recipientPtr); Marshal.FreeHGlobal(recipientPtr); }
        }
    }
}
