'use client';

/**
 * Legacy Thirdweb server LLM helpers.
 *
 * These utilities previously powered the “Server LLM” option that charged
 * an X402 payment before calling the hosted OpenRouter integration. They are
 * preserved here so we can re-introduce the flow later without having to
 * reconstruct the thirdweb/X402 logic from scratch.
 *
 * NOTE: Nothing in this file is currently imported by the app.
 */

type X402PaymentOptions = {
  price: string;
  facilitator: string;
  description: string;
};

/**
 * Initiate an X402 payment via thirdweb.
 *
 * The implementation matches the one that previously lived inside
 * `create/page.tsx`. When re-enabling the server LLM mode, move this helper
 * back into the relevant hook/component and wire it to the request flow.
 */
export async function legacyInitiateX402Payment(
  options: X402PaymentOptions
): Promise<string | null> {
  try {
    if (typeof window === "undefined") {
      throw new Error("X402 payment requires discoverr environment");
    }

    // Dynamic imports avoid bundling thirdweb until we actually re-enable the flow.
    const { createThirdwebClient, connectWallet } = await import("thirdweb");

    const clientId = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID || "";
    const client = createThirdwebClient({ clientId });

    if (!client || !clientId) {
      console.warn("Thirdweb client ID not configured, X402 payment disabled");
      return null;
    }

    const wallet = await connectWallet({
      client,
      chain: "base",
    });

    if (!wallet) {
      throw new Error("Failed to connect wallet for X402 payment");
    }

    console.log(
      `Initiating X402 payment: ${options.price} for ${options.description}`
    );

    const paymentToken = btoa(
      JSON.stringify({
        payer: wallet.getAddress?.(),
        price: options.price,
        facilitator: options.facilitator,
        timestamp: Date.now(),
        signature: "x402_signature_" + Math.random().toString(36).substr(2, 9),
      })
    );

    return paymentToken;
  } catch (error) {
    console.error("X402 payment initiation failed:", error);
    return null;
  }
}

/**
 * Example request scaffold that shows how the payment token was attached when
 * calling the server LLM endpoint. Keep the structure for easy copy/paste later.
 */
export async function legacyServerLLMRequest(
  body: Record<string, unknown>
): Promise<Response> {
  const paymentToken = await legacyInitiateX402Payment({
    price: "$0.50",
    facilitator: "fortehub",
    description: "ForteHub Workflow Generation",
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (paymentToken) {
    headers["x402-payment"] = paymentToken;
  }

  return fetch("/api/workflows/generate", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
