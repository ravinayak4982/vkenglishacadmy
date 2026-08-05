import nodemailer from 'nodemailer';
const transport = () => nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: String(process.env.SMTP_SECURE) === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
export async function sendMail({ to, subject, text }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) { console.warn(`Email skipped (${subject}) for ${to}`); return; }
  await transport().sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text });
}
