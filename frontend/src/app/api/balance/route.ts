import { NextRequest, NextResponse } from "next/server";

const NETWORK = (process.env.NEXT_PUBLIC_NETWORK || "testnet").toLowerCase();

function resolveAccessNode(): string {
  if (process.env.NEXT_PUBLIC_FLOW_ACCESS_NODE) {
    return process.env.NEXT_PUBLIC_FLOW_ACCESS_NODE;
  }

  switch (NETWORK) {
    case "mainnet":
      return "https://rest-mainnet.onflow.org";
    case "emulator":
      return "http://localhost:8888";
    case "testnet":
    default:
      return "https://rest-testnet.onflow.org";
  }
}

const ACCESS_NODE = resolveAccessNode();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");
    if (!address) {
      return NextResponse.json(
        { error: "Query parameter 'address' is required." },
        { status: 400 }
      );
    }

    const script = `
      access(all) fun main(address: Address): UFix64 {
        let account = getAccount(address)
        return account.balance
      }
    `;

    const body = JSON.stringify({
      script: { base64: Buffer.from(script, "utf8").toString("base64") },
      arguments: [{ type: "Address", value: address }],
    });

    const response = await fetch(`${ACCESS_NODE}/v1/scripts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
    });

    if (!response.ok) {
      const message = await response.text();
      return NextResponse.json(
        { error: `Failed to fetch balance: ${message}` },
        { status: response.status }
      );
    }

    const result = await response.json();
    const rawValue = result?.value?.value ?? "0.0";
    const balance = parseFloat(rawValue) || 0;

    return NextResponse.json({
      address,
      balance,
      value: result?.value ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
