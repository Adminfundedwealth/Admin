/**
 * Transactional email templates for trader notifications.
 * Minimal inline-CSS for maximum email client compatibility.
 */

const BASE_STYLE = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #1a1a2e;
  line-height: 1.6;
`;

const BUTTON_STYLE = `
  display: inline-block;
  padding: 12px 24px;
  background-color: #2563eb;
  color: #ffffff;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 600;
  margin-top: 16px;
`;

function wrap(title: string, body: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:#ffffff;border-radius:8px;padding:32px;${BASE_STYLE}">
      <img src="https://fundedwealth.com/logo.png" alt="FundedWealth" style="height:32px;margin-bottom:24px;" />
      ${body}
      <hr style="border:none;border-top:1px solid #e4e4e7;margin:32px 0 16px;" />
      <p style="font-size:12px;color:#71717a;">
        This is an automated email from FundedWealth. Do not reply directly.<br/>
        If you need help, contact support@fundedwealth.com
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// KYC
// ---------------------------------------------------------------------------

export function kycApprovedEmail(userName: string): { subject: string; html: string } {
  return {
    subject: 'KYC Verified — Your identity has been confirmed',
    html: wrap('KYC Approved', `
      <h2 style="margin:0 0 16px;">Identity Verified ✓</h2>
      <p>Hi ${userName || 'Trader'},</p>
      <p>Your KYC documents have been reviewed and <strong>approved</strong>. Your account is now fully verified.</p>
      <p>You can proceed with all platform features including payouts.</p>
      <a href="https://fundedwealth.com/dashboard" style="${BUTTON_STYLE}">Go to Dashboard</a>
    `),
  };
}

export function kycRejectedEmail(userName: string, reasons: string[]): { subject: string; html: string } {
  const reasonList = reasons.length > 0
    ? `<ul>${reasons.map(r => `<li>${r}</li>`).join('')}</ul>`
    : '<p>Please resubmit clearer documents.</p>';

  return {
    subject: 'KYC Review — Additional documents required',
    html: wrap('KYC Rejected', `
      <h2 style="margin:0 0 16px;">Documents Not Accepted</h2>
      <p>Hi ${userName || 'Trader'},</p>
      <p>We were unable to verify your identity with the documents provided. Reason(s):</p>
      ${reasonList}
      <p>Please resubmit your documents. You have up to 3 submission attempts.</p>
      <a href="https://fundedwealth.com/kyc" style="${BUTTON_STYLE}">Resubmit Documents</a>
    `),
  };
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

export function payoutApprovedEmail(userName: string, amount: number, currency: string): { subject: string; html: string } {
  return {
    subject: `Payout Approved — ₹${amount.toLocaleString()} is being processed`,
    html: wrap('Payout Approved', `
      <h2 style="margin:0 0 16px;">Payout Approved ✓</h2>
      <p>Hi ${userName || 'Trader'},</p>
      <p>Your payout request for <strong>${currency} ${amount.toLocaleString()}</strong> has been approved and is now being processed.</p>
      <p>Funds will arrive in your registered bank account within 1-3 business days.</p>
      <a href="https://fundedwealth.com/dashboard/payouts" style="${BUTTON_STYLE}">View Payout Status</a>
    `),
  };
}

export function payoutRejectedEmail(userName: string, amount: number, reason: string): { subject: string; html: string } {
  return {
    subject: 'Payout Request — Action Required',
    html: wrap('Payout Rejected', `
      <h2 style="margin:0 0 16px;">Payout Not Approved</h2>
      <p>Hi ${userName || 'Trader'},</p>
      <p>Your payout request for <strong>₹${amount.toLocaleString()}</strong> was not approved.</p>
      <p><strong>Reason:</strong> ${reason}</p>
      <p>If you believe this is an error, please contact support.</p>
      <a href="https://fundedwealth.com/support" style="${BUTTON_STYLE}">Contact Support</a>
    `),
  };
}

// ---------------------------------------------------------------------------
// Account Status
// ---------------------------------------------------------------------------

export function accountBreachedEmail(userName: string, accountId: string, reason: string): { subject: string; html: string } {
  return {
    subject: 'Trading Account Breached — Action Required',
    html: wrap('Account Breached', `
      <h2 style="margin:0 0 16px;color:#dc2626;">Account Breached</h2>
      <p>Hi ${userName || 'Trader'},</p>
      <p>Your trading account <strong>${accountId.slice(0, 8).toUpperCase()}</strong> has been closed due to a rule breach.</p>
      <p><strong>Reason:</strong> ${reason || 'Drawdown limit exceeded'}</p>
      <p>If you have questions, please reach out to our support team.</p>
      <a href="https://fundedwealth.com/support" style="${BUTTON_STYLE}">Contact Support</a>
    `),
  };
}

export function accountSuspendedEmail(userName: string, accountId: string, reason: string): { subject: string; html: string } {
  return {
    subject: 'Trading Account Suspended — Review Required',
    html: wrap('Account Suspended', `
      <h2 style="margin:0 0 16px;color:#d97706;">Account Suspended</h2>
      <p>Hi ${userName || 'Trader'},</p>
      <p>Your trading account <strong>${accountId.slice(0, 8).toUpperCase()}</strong> has been temporarily suspended.</p>
      <p><strong>Reason:</strong> ${reason || 'Under review'}</p>
      <p>Our team is reviewing your account. You will be notified once the review is complete.</p>
      <a href="https://fundedwealth.com/dashboard" style="${BUTTON_STYLE}">View Dashboard</a>
    `),
  };
}
