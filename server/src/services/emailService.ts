import nodemailer from 'nodemailer';

// Variáveis de ambiente obrigatórias para envio real de e-mail:
//   SMTP_USER — endereço Gmail (ex: pericia.lavras@gmail.com)
//   SMTP_PASS — App Password de 16 caracteres gerada no Google
//   APP_URL   — URL pública do sistema (ex: https://evidenceos.pc.mg.gov.br)

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const APP_NAME = 'EvidenceOS';
const APP_URL = (process.env.APP_URL || 'https://evidenceos-web.2bwwuq.easypanel.host').replace(/\/$/, '');
const FROM_ADDRESS = `"${APP_NAME} – Não Responda" <${process.env.SMTP_USER}>`;

export const sendPasswordResetEmail = async (
  toEmail: string,
  toName: string,
  resetToken: string,
): Promise<void> => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('[emailService] SMTP_USER e SMTP_PASS não configurados. Verifique as variáveis de ambiente.');
  }

  const resetLink = `${APP_URL}/?token=${resetToken}`;

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperação de Senha – ${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#18181b;border:1px solid #27272a;border-radius:12px;overflow:hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background:#18181b;border-bottom:1px solid #27272a;padding:28px 36px;">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#f59e0b22;border:1px solid #f59e0b55;border-radius:8px;width:40px;height:40px;text-align:center;vertical-align:middle;">
                    <span style="font-size:20px;">🔐</span>
                  </td>
                  <td style="padding-left:14px;vertical-align:middle;">
                    <span style="color:#ffffff;font-size:20px;font-weight:900;letter-spacing:-0.5px;">
                      Evidence<span style="color:#f59e0b;">OS</span>
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 36px 24px;">
              <p style="color:#a1a1aa;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 16px;">Recuperação de Acesso</p>
              <h1 style="color:#ffffff;font-size:22px;font-weight:800;margin:0 0 16px;line-height:1.3;">
                Redefinição de senha solicitada
              </h1>
              <p style="color:#a1a1aa;font-size:14px;line-height:1.7;margin:0 0 8px;">
                Olá, <strong style="color:#e4e4e7;">${toName}</strong>.
              </p>
              <p style="color:#a1a1aa;font-size:14px;line-height:1.7;margin:0 0 28px;">
                Recebemos uma solicitação para redefinir a senha da sua conta no <strong style="color:#e4e4e7;">EvidenceOS</strong>. Clique no botão abaixo para criar uma nova senha. O link é válido por <strong style="color:#f59e0b;">1 hora</strong>.
              </p>
              
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="background:#ffffff;border-radius:0;">
                    <a href="${resetLink}" style="display:inline-block;background:#ffffff;color:#000000;font-size:13px;font-weight:800;text-decoration:none;padding:14px 32px;letter-spacing:0.5px;text-transform:uppercase;">
                      REDEFINIR MINHA SENHA →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Security note -->
              <div style="background:#09090b;border:1px solid #27272a;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
                <p style="color:#71717a;font-size:12px;margin:0 0 6px;font-weight:600;">⚠️ Aviso de segurança</p>
                <p style="color:#52525b;font-size:12px;line-height:1.6;margin:0;">
                  Se você não solicitou a recuperação de senha, ignore este e-mail. Sua senha permanece a mesma e nenhuma alteração foi feita.
                </p>
              </div>

              <!-- Fallback link -->
              <p style="color:#52525b;font-size:11px;line-height:1.6;margin:0;">
                Se o botão não funcionar, copie e cole este link no navegador:<br>
                <a href="${resetLink}" style="color:#f59e0b;word-break:break-all;">${resetLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top:1px solid #27272a;padding:20px 36px;">
              <p style="color:#3f3f46;font-size:11px;margin:0;line-height:1.6;">
                ${APP_NAME} · URC Lavras/MG · Polícia Civil MG<br>
                Este é um e-mail automático. Não responda a esta mensagem.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  await transporter.sendMail({
    from: FROM_ADDRESS,
    to: toEmail,
    subject: `[${APP_NAME}] Redefinição de senha`,
    html,
    text: `Olá, ${toName}.\n\nAcesse o link abaixo para redefinir sua senha (válido por 1 hora):\n\n${resetLink}\n\nSe você não solicitou, ignore este e-mail.\n\n— EvidenceOS`,
  });
};
