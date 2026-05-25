/**
 * Template HTML per la mail di benvenuto inviata a un utente appena registrato.
 *
 * Best practice per le email transazionali:
 *  - CSS inline (i client mail moderni — Gmail incluso — non supportano <style>
 *    esterni o anche <style> in <head> in modo affidabile)
 *  - Max-width 600px (standard per la maggior parte dei client desktop/mobile)
 *  - Font-family sans-serif fallback (Arial / Helvetica funzionano ovunque)
 *  - Versione plain text inclusa (alcuni client la preferiscono o la ricevono
 *    quando l'HTML viene strippato — es. filtri antispam aggressivi)
 */

export interface RegistrationEmailData {
    username: string;
}

export interface RenderedEmail {
    subject: string;
    html: string;
    text: string;
}

export function registrationEmail(data: RegistrationEmailData): RenderedEmail {
    const username = escapeHtml(data.username);

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Benvenuto in PortalePostale</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2d3d;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);max-width:600px;">
          <tr>
            <td style="background-color:#0b4f8a;padding:24px 32px;color:#ffffff;">
              <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:600;">PortalePostale</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 16px 0;font-size:20px;line-height:1.4;">Benvenuto, ${username}!</h2>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">
                Il tuo account su PortalePostale è stato creato con successo.
              </p>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">
                Puoi accedere al portale per gestire le tue spedizioni postali,
                consultare lo storico delle lettere inviate e scaricare le rendicontazioni.
              </p>
              <p style="margin:24px 0 0 0;">
                <a href="https://portalepostale.it" style="display:inline-block;background-color:#0b4f8a;color:#ffffff;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:600;font-size:15px;">Accedi al portale</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px;border-top:1px solid #e5e9f0;color:#7a8aa1;font-size:12px;line-height:1.5;">
              Questa è una notifica automatica. Per assistenza scrivi a
              <a href="mailto:info@portalepostale.it" style="color:#0b4f8a;text-decoration:none;">info@portalepostale.it</a>.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `Benvenuto in PortalePostale, ${data.username}!

Il tuo account su PortalePostale è stato creato con successo.
Puoi accedere al portale per gestire le tue spedizioni postali,
consultare lo storico delle lettere inviate e scaricare le rendicontazioni.

Accedi al portale: https://portalepostale.it

Per assistenza scrivi a info@portalepostale.it.`;

    return {
        subject: "Benvenuto in PortalePostale",
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
