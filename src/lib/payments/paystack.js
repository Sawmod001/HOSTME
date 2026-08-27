/**
 * Paystack API integration.
 *
 * Handles:
 * - Payment initialization (generating authorization URL)
 * - Transaction verification
 * - Transfer (payout to hosts) — placeholder for when Paystack transfers are enabled
 */

const PAYSTACK_BASE = "https://api.paystack.co";

/**
 * Initialize a Paystack transaction.
 * @param {Object} params
 * @param {number} params.amountKobo - Amount in kobo
 * @param {string} params.email - Customer email
 * @param {string} params.reference - Unique reference
 * @param {string} [params.callbackUrl] - Redirect URL after payment
 * @param {Object} [params.metadata] - Extra metadata
 * @returns {{ authorizationUrl: string, accessCode: string } | { error: string }}
 */
export async function initializeTransaction({ amountKobo, email, reference, callbackUrl, metadata = {} }) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    // Mock mode: return a mock URL
    return {
      authorizationUrl: `/api/payments/mock-confirm`,
      accessCode: "mock_access_code",
      mock: true,
    };
  }

  try {
    const response = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountKobo,
        email,
        reference,
        callback_url: callbackUrl,
        metadata,
      }),
    });

    const data = await response.json();

    if (!data.status) {
      return { error: data.message || "Paystack initialization failed" };
    }

    return {
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
    };
  } catch (error) {
    console.error("Paystack initialize error:", error);
    return { error: "Failed to initialize payment" };
  }
}

/**
 * Verify a Paystack transaction.
 * @param {string} reference - Transaction reference
 * @returns {{ status: string, amount: number, gatewayRef: string, paidAt: string } | { error: string }}
 */
export async function verifyTransaction(reference) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    // Mock mode: return success
    return {
      status: "success",
      amount: 0,
      gatewayRef: `mock_${reference}`,
      paidAt: new Date().toISOString(),
      mock: true,
    };
  }

  try {
    const response = await fetch(`${PAYSTACK_BASE}/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    });

    const data = await response.json();

    if (!data.status) {
      return { error: data.message || "Verification failed" };
    }

    const tx = data.data;
    return {
      status: tx.status,
      amount: tx.amount,
      gatewayRef: tx.id?.toString() || tx.reference,
      paidAt: tx.paid_at || tx.created_at,
      channel: tx.channel,
      currency: tx.currency,
      fees: tx.fees,
    };
  } catch (error) {
    console.error("Paystack verify error:", error);
    return { error: "Failed to verify payment" };
  }
}

/**
 * Initiate a transfer (payout to host).
 * Placeholder — requires Paystack Transfer Recipients and Transfers API.
 * @param {Object} params
 * @param {number} params.amountKobo
 * @param {string} params.recipientCode - Paystack recipient code
 * @param {string} params.reference
 * @param {string} [params.reason]
 * @returns {{ transferCode: string, status: string } | { error: string }}
 */
export async function initiateTransfer({ amountKobo, recipientCode, reference, reason }) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return {
      transferCode: `mock_transfer_${reference}`,
      status: "completed",
      mock: true,
    };
  }

  try {
    const response = await fetch(`${PAYSTACK_BASE}/transfer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "balance",
        amount: amountKobo,
        recipient: recipientCode,
        reference,
        reason,
      }),
    });

    const data = await response.json();

    if (!data.status) {
      return { error: data.message || "Transfer failed" };
    }

    return {
      transferCode: data.data.transfer_code,
      status: data.data.status,
    };
  } catch (error) {
    console.error("Paystack transfer error:", error);
    return { error: "Failed to initiate transfer" };
  }
}

/**
 * Create a transfer recipient for a host.
 * @param {Object} params
 * @param {string} params.name
 * @param {string} params.email
 * @param {string} [params.bankCode]
 * @param {string} [params.accountNumber]
 * @returns {{ recipientCode: string } | { error: string }}
 */
export async function createTransferRecipient({ name, email, bankCode, accountNumber }) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return { recipientCode: `mock_recipient_${Date.now()}`, mock: true };
  }

  try {
    const body = {
      type: "nuban",
      name,
      email,
    };

    if (bankCode && accountNumber) {
      body.bank_code = bankCode;
      body.account_number = accountNumber;
    }

    const response = await fetch(`${PAYSTACK_BASE}/transferrecipient`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!data.status) {
      return { error: data.message || "Failed to create recipient" };
    }

    return { recipientCode: data.data.recipient_code };
  } catch (error) {
    console.error("Paystack create recipient error:", error);
    return { error: "Failed to create transfer recipient" };
  }
}
