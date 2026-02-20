/**
 * Legacy Thirdweb/X402 server LLM support.
 *
 * The main route no longer uses this code, but we keep the scaffolding here so
 * the payment flow can be restored quickly when we re-enable the hosted model
 * option.
 */

import { NextRequest, NextResponse } from "next/server";
import { createThirdwebClient } from "thirdweb";

const X402_PRICE_USD = "0.50";
const X402_ENABLED = process.env.X402_ENABLED === "true";
const THIRDWEB_SECRET_KEY = process.env.THIRDWEB_SECRET_KEY;
const X402_FACILITATOR_ADDRESS = process.env.X402_FACILITATOR_ADDRESS;

export async function handleServerLLMPayment(
  request: NextRequest
): Promise<Response | null> {
  if (!X402_ENABLED) {
    return null;
  }

  const paymentHeader = request.headers.get("x402-payment");
  if (!paymentHeader) {
    return NextResponse.json(
      {
        error: "Payment required",
        code: "X402_PAYMENT_REQUIRED",
        message: "This service requires payment via X402 protocol",
      },
      {
        status: 402,
        headers: {
          "x402-payment-required": "true",
          "x402-price": X402_PRICE_USD,
          "x402-currency": "USD",
          "x402-facilitator": X402_FACILITATOR_ADDRESS || "fortehub",
        },
      }
    );
  }

  try {
    if (THIRDWEB_SECRET_KEY && X402_FACILITATOR_ADDRESS) {
      const client = createThirdwebClient({
        secretKey: THIRDWEB_SECRET_KEY,
      });

      // Previously we would verify/settle the X402 token here using thirdweb APIs.
      console.log("X402 payment header received, payment verified (legacy stub)");
    }
  } catch (paymentError) {
    console.error("Payment verification failed:", paymentError);
    return NextResponse.json(
      {
        error: "Payment verification failed",
        code: "X402_PAYMENT_FAILED",
      },
      { status: 402 }
    );
  }

  return null;
}
