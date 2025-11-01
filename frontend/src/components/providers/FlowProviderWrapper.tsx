"use client";

import { FlowProvider } from "@onflow/react-sdk";
import flowJSON from '../../../../flow.json';


export function FlowProviderWrapper({ children }: { children: React.ReactNode }) {

  return (
    <FlowProvider
      config={{
        accessNodeUrl: "https://rest-testnet.onflow.org",
        discoveryWallet: "https://fcl-discovery.onflow.org/testnet/authn",
        discoveryAuthnEndpoint:
          "https://fcl-discovery.onflow.org/api/testnet/authn",
        flowNetwork: "testnet",
        appDetailTitle: "ForteHub",
        appDetailDescription: "Build & Share DeFi Workflows",
        appDetailUrl: "https://fortehub.io",
      }}
      flowJson={flowJSON}
    >
      {children}
    </FlowProvider>
  );
}
