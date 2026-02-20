"use client";

import { useEffect } from "react";
import { FlowProvider } from "@onflow/react-sdk";
import flowJSON from "../../../../flow.json";

export function FlowProviderWrapper({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const originalLog = console.log;
    console.log = (...args: any[]) => {
      if (
        args.length === 1 &&
        typeof args[0] === "object" &&
        args[0] !== null &&
        args[0].context === "core" &&
        typeof args[0].msg === "string" &&
        args[0].msg.includes("Starting WS connection skipped because the client has no topics to work with.")
      ) {
        return;
      }
      originalLog(...args);
    };

    return () => {
      console.log = originalLog;
    };
  }, []);

  return (
    <FlowProvider
      config={{
        accessNodeUrl: "https://rest-testnet.onflow.org",
        flowNetwork: "testnet",
        appDetailTitle: "ForteHub",
        appDetailDescription: "Build & Share DeFi Workflows",
        appDetailUrl: "https://localhost:3000",
        appDetailIcon: "https://coffee-solid-parakeet-145.mypinata.cloud/ipfs/bafybeib6okpp5ullxvjqe6n4wmmnnd4guks4buk5gluy5lnymwugrjpyzq",
        walletconnectProjectId: "945b7f9f825e2e8dc1a4a6559b0563ff",
        discoveryWallet: "https://fcl-discovery.onflow.org/testnet/authn",
        discoveryAuthnEndpoint: "https://fcl-discovery.onflow.org/api/testnet/authn"
      } as any}
      flowJson={flowJSON}
    >
      {children}
    </FlowProvider>
  );
}
