/**
 * Template per la notifica di errore durante la spedizione di una lettera.
 *
 * Inviata all'utente che ha richiesto la spedizione quando Poste Italiane
 * rifiuta o segnala un errore lato H2H. Contiene tutti gli identificativi
 * necessari al supporto per investigare (codePdf, errore Poste, link al PDF).
 */

export interface LetterErrorEmailData {
    username: string;
    sender_name: string;
    document_url: string;
    letter: {
        subject: string;
        kind: string;
        codePdf: string;
        sendAt: string;
    };
    error: {
        title: string;
        content: string;
        data: string;
    };
}

export interface RenderedEmail {
    subject: string;
    html: string;
    text: string;
}

export function letterErrorEmail(data: LetterErrorEmailData): RenderedEmail {
    const username = escapeHtml(data.username);
    const senderName = escapeHtml(data.sender_name);
    const documentUrl = escapeUrl(data.document_url);
    const letterSubject = escapeHtml(data.letter.subject);
    const letterKind = escapeHtml(data.letter.kind);
    const codePdf = escapeHtml(data.letter.codePdf);
    const sendAt = escapeHtml(data.letter.sendAt);
    const errorTitle = escapeHtml(data.error.title);
    const errorContent = escapeHtml(data.error.content);
    const errorData = escapeHtml(data.error.data);

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Errore spedizione ${codePdf}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2d3d;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);max-width:600px;">
          <tr>
            <td style="background-color:#b8392f;padding:24px 32px;color:#ffffff;">
              <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:600;">Errore spedizione</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">
                Ciao ${username},<br>
                durante l'invio di una lettera Poste Italiane ha restituito un errore.
              </p>

              <h3 style="margin:24px 0 8px 0;font-size:16px;line-height:1.4;color:#0b4f8a;">Dettagli spedizione</h3>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;line-height:1.6;border-collapse:collapse;">
                <tr><td style="padding:4px 8px 4px 0;color:#7a8aa1;width:140px;">Codice PDF</td><td style="padding:4px 0;"><strong>${codePdf}</strong></td></tr>
                <tr><td style="padding:4px 8px 4px 0;color:#7a8aa1;">Oggetto</td><td style="padding:4px 0;">${letterSubject}</td></tr>
                <tr><td style="padding:4px 8px 4px 0;color:#7a8aa1;">Tipo</td><td style="padding:4px 0;">${letterKind}</td></tr>
                <tr><td style="padding:4px 8px 4px 0;color:#7a8aa1;">Data invio</td><td style="padding:4px 0;">${sendAt}</td></tr>
                <tr><td style="padding:4px 8px 4px 0;color:#7a8aa1;">Mittente</td><td style="padding:4px 0;">${senderName}</td></tr>
              </table>

              <h3 style="margin:24px 0 8px 0;font-size:16px;line-height:1.4;color:#b8392f;">Errore Poste</h3>
              <p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;"><strong>${errorTitle}</strong></p>
              <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;">${errorContent}</p>
              <pre style="background-color:#f4f6f8;padding:12px;border-radius:4px;font-size:12px;line-height:1.5;color:#1f2d3d;white-space:pre-wrap;word-break:break-word;margin:0;font-family:monospace;">${errorData}</pre>

              <p style="margin:24px 0 0 0;">
                <a href="${documentUrl}" style="display:inline-block;background-color:#0b4f8a;color:#ffffff;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:600;font-size:15px;">Scarica documento</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #e5e9f0;color:#7a8aa1;font-size:12px;line-height:1.5;">
              Questa è una notifica automatica. Per assistenza scrivi a
              <a href="mailto:info@portalepostale.it" style="color:#0b4f8a;text-decoration:none;">info@portalepostale.it</a>
              citando il codice PDF <strong>${codePdf}</strong>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `Errore spedizione PortalePostale

Ciao ${data.username},
durante l'invio di una lettera Poste Italiane ha restituito un errore.

DETTAGLI SPEDIZIONE
-------------------
Codice PDF:  ${data.letter.codePdf}
Oggetto:     ${data.letter.subject}
Tipo:        ${data.letter.kind}
Data invio:  ${data.letter.sendAt}
Mittente:    ${data.sender_name}

ERRORE POSTE
------------
${data.error.title}
${data.error.content}

${data.error.data}

Scarica documento: ${data.document_url}

Per assistenza scrivi a info@portalepostale.it citando il codice PDF ${data.letter.codePdf}.`;

    return {
        subject: `Errore spedizione ${data.letter.codePdf}`,
        html,
        text
    };
}

function escapeHtml(s: string): string {
    return (s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeUrl(s: string): string {
    if (!s) return "#";
    if (!/^https?:\/\//i.test(s)) return "#";
    return s.replace(/"/g, "%22").replace(/'/g, "%27");
}
