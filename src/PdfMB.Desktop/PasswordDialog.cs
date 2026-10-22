namespace PdfMB.Desktop;

internal sealed class PasswordDialog : Form
{
    private readonly TextBox _password = new() { UseSystemPasswordChar = true, Dock = DockStyle.Fill, MaxLength = 127, AccessibleName = "Password" };
    public string Password => _password.Text;

    public PasswordDialog(bool create, string? message = null)
    {
        Text = create ? "Proteggi PDF con password" : "Apri PDF protetto";
        AppIcon.Apply(this); StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = MinimizeBox = false;
        ClientSize = new Size(460, create ? 245 : 175); Font = new Font("Segoe UI", 10);
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(18), ColumnCount = 1, RowCount = create ? 5 : 3 };
        layout.Controls.Add(new Label { Text = message ?? (create ? "Inserire e confermare la password richiesta all’apertura.\nLa protezione sarà applicata con Salva." : "Inserire la password del documento."), AutoSize = true, MaximumSize = new Size(420, 0) });
        layout.Controls.Add(_password);
        var confirm = new TextBox { UseSystemPasswordChar = true, Dock = DockStyle.Fill, MaxLength = 127, AccessibleName = "Conferma password" };
        if (create) { layout.Controls.Add(new Label { Text = "Conferma password", AutoSize = true }); layout.Controls.Add(confirm); }
        var actions = new FlowLayoutPanel { FlowDirection = FlowDirection.RightToLeft, Dock = DockStyle.Fill, AutoSize = true };
        var ok = new Button { Text = create ? "Applica" : "Apri", AutoSize = true };
        var cancel = new Button { Text = "Annulla", DialogResult = DialogResult.Cancel, AutoSize = true };
        ok.Click += (_, _) =>
        {
            if (System.Text.Encoding.UTF8.GetByteCount(Password) > 127 || Password.Contains('\0')) { MessageBox.Show(this, "Password troppo lunga: massimo 127 byte UTF-8."); return; }
            if (create && Password != confirm.Text) { MessageBox.Show(this, "Le password non coincidono."); return; }
            DialogResult = DialogResult.OK;
        };
        actions.Controls.Add(ok); actions.Controls.Add(cancel); layout.Controls.Add(actions); Controls.Add(layout);
        AcceptButton = ok; CancelButton = cancel;
        CommandIcons.ConfigureDialog(this);
    }
}
