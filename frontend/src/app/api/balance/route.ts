import { NextRequest, NextResponse } from "next/server";

const EMULATOR_ACCESS_NODE = "http://localhost:8888";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address") || "0xf8d6e0586b0a20c7";

    console.log("Fetching balance for address:", address);

    // Simple script to get account balance
    const script = `
      access(all) fun main(address: Address): UFix64 {
        let account = getAccount(address)
        return account.balance
      }
    `;

    const scriptBase64 = Buffer.from(script).toString('base64');
    const argJson = JSON.stringify({ type: 'Address', value: address });
    const argBase64 = Buffer.from(argJson).toString('base64');

    console.log("Script (base64):", scriptBase64);
    console.log("Argument (json):", argJson);
    console.log("Argument (base64):", argBase64);

    const response = await fetch(`${EMULATOR_ACCESS_NODE}/v1/scripts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        script: scriptBase64,
        arguments: [argBase64],
      }),
    });

    console.log("Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error response:", errorText);
      return NextResponse.json(
        { error: `Failed to fetch balance: ${errorText}` },
        { status: response.status }
      );
    }

    const resultBase64 = await response.text();
    console.log("Result (base64):", resultBase64);

    const resultJson = Buffer.from(resultBase64, 'base64').toString('utf-8');
    console.log("Result (decoded):", resultJson);

    // Parse the JSON response - it comes as {"value":"1000000000.00000000","type":"UFix64"}
    const resultObj = JSON.parse(resultJson);
    console.log("Result (parsed):", resultObj);

    const balance = parseFloat(resultObj.value) || 0;
    console.log("Balance parsed:", balance);

    return NextResponse.json({
      address,
      balance,
      raw: resultJson,
    });

  } catch (error) {
    console.error("Balance fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
