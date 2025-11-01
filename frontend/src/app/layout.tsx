import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "../components/layout/Header";
import { Footer } from "../components/layout/Footer";
import { ThemeProvider } from "../components/providers/ThemeProvider";
import { ToastContainer } from "../components/ui/ToastContainer";
import { FlowProviderWrapper } from "../components/providers/FlowProviderWrapper";
import { WorkflowProvider } from "../lib/WorkflowContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ForteHub - Build & Share DeFi Workflows",
  description: "Generate autonomous DeFi workflows with AI, deploy to your wallet, and share with the community on Flow blockchain.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} flex flex-col min-h-screen bg-background text-foreground`} suppressHydrationWarning>
        <FlowProviderWrapper>
          <WorkflowProvider>
            <ThemeProvider defaultTheme="light" storageKey="fortehub-theme">
              <Header />
              <main className="flex-1">{children}</main>
              <Footer />
              <ToastContainer />
            </ThemeProvider>
          </WorkflowProvider>
        </FlowProviderWrapper>
      </body>
    </html>
  );
}
