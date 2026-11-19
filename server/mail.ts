import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null | undefined;

function getTransporter() {
  if (transporter !== undefined) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  const port = Number(SMTP_PORT) || 465;
  transporter = SMTP_HOST
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port,
        secure: port === 465,
        auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
      })
    : null;
  return transporter;
}

export const mailConfigured = () => Boolean(process.env.SMTP_HOST);

/** Envía un correo. Devuelve false si no hay SMTP configurado o falla el envío. */
export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  const smtp = getTransporter();
  if (!smtp) return false;
  try {
    await smtp.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, html });
    return true;
  } catch (error) {
    console.error("Error enviando correo:", error);
    return false;
  }
}
