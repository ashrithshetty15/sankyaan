import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM_EMAIL = process.env.FROM_EMAIL || 'Sankyaan <updates@sankyaan.com>';

/**
 * Send an email via Resend.
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML body
 */
export async function sendEmail(to, subject, html) {
  if (!resend) {
    console.warn('RESEND_API_KEY not set — skipping email send');
    return null;
  }

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html,
  });

  if (error) {
    console.error(`Failed to send email to ${to}:`, error);
    throw new Error(error.message);
  }

  return data;
}
