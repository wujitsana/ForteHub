"use client";

import Link from "next/link";
import { ArrowRight, Code, Share2, Rocket, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden py-20 px-4">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-accent/5" />
        <div className="relative max-w-6xl mx-auto text-center">
          <div className="inline-block mb-4">
            <span className="px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-semibold">
              ForteHub - DeFi Workflow Studio
            </span>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold text-foreground mb-6">
            Build & Share
            <span className="bg-gradient-to-r from-primary to-accent-foreground bg-clip-text text-transparent"> DeFi Workflows</span>
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Generate automated DeFi workflows with AI, deploy to your wallet, and share with the community on Flow blockchain
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/create">
              <Button size="lg" className="text-lg px-8 py-6">
                <Sparkles className="w-5 h-5 mr-2" />
                Create Workflow
              </Button>
            </Link>
            <Link href="/browse">
              <Button size="lg" variant="outline" className="text-lg px-8 py-6">
                Browse
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-6xl mx-auto px-4 py-20">
        <h2 className="text-4xl font-bold text-center mb-4 text-foreground">How It Works</h2>
        <p className="text-center text-muted-foreground mb-12 text-lg">
          Three simple steps to create and share DeFi workflows
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Card className="border-2 hover:border-primary/20 transition-all sketchpad-shadow hover:sketchpad-shadow-lg">
            <CardContent className="pt-6">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Code className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-foreground">1. Generate</h3>
              <p className="text-muted-foreground">
                Describe your strategy to Claude AI. Get production-ready Cadence smart contracts instantly.
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-accent/20 transition-all sketchpad-shadow hover:sketchpad-shadow-lg">
            <CardContent className="pt-6">
              <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-4">
                <Rocket className="w-6 h-6 text-accent-foreground" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-foreground">2. Deploy</h3>
              <p className="text-muted-foreground">
                Deploy to your Flow wallet. Source code stored on IPFS for transparency and verification.
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 hover:border-primary/20 transition-all sketchpad-shadow hover:sketchpad-shadow-lg">
            <CardContent className="pt-6">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Share2 className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-foreground">3. Share</h3>
              <p className="text-muted-foreground">
                List in registry or keep private. Others can deploy your workflows to their wallets.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Workflow Categories */}
      <div className="bg-muted/30 py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-4 text-foreground">Workflow Categories</h2>
          <p className="text-center text-muted-foreground mb-12 text-lg">
            Build workflows for any DeFi strategy
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="bg-card rounded-xl p-6 text-center hover:sketchpad-shadow-lg transition-shadow border">
              <div className="text-4xl mb-3">📈</div>
              <h3 className="font-semibold mb-1 text-foreground">Yield Optimization</h3>
              <p className="text-sm text-muted-foreground">Maximize APY</p>
            </div>

            <div className="bg-card rounded-xl p-6 text-center hover:sketchpad-shadow-lg transition-shadow border">
              <div className="text-4xl mb-3">💰</div>
              <h3 className="font-semibold mb-1 text-foreground">Dollar Cost Average</h3>
              <p className="text-sm text-muted-foreground">Automated buying</p>
            </div>

            <div className="bg-card rounded-xl p-6 text-center hover:sketchpad-shadow-lg transition-shadow border">
              <div className="text-4xl mb-3">⚖️</div>
              <h3 className="font-semibold mb-1 text-foreground">Rebalancing</h3>
              <p className="text-sm text-muted-foreground">Portfolio management</p>
            </div>

            <div className="bg-card rounded-xl p-6 text-center hover:sketchpad-shadow-lg transition-shadow border">
              <div className="text-4xl mb-3">⚡</div>
              <h3 className="font-semibold mb-1 text-foreground">Arbitrage</h3>
              <p className="text-sm text-muted-foreground">Cross-DEX opportunities</p>
            </div>
          </div>
        </div>
      </div>

      {/* Key Features */}
      <div className="max-w-6xl mx-auto px-4 py-20">
        <h2 className="text-4xl font-bold text-center mb-12 text-foreground">Why ForteHub?</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="flex gap-4">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-xl">🔐</span>
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-1 text-foreground">Wallet-Owned Workflows</h3>
              <p className="text-muted-foreground">
                Your funds never leave your wallet. Workflows get limited capabilities only.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-xl">🌐</span>
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-1 text-foreground">IPFS Storage</h3>
              <p className="text-muted-foreground">
                Decentralized source code storage with hash verification for transparency.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-xl">🤖</span>
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-1 text-foreground">AI-Powered Generation</h3>
              <p className="text-muted-foreground">
                Describe your strategy in plain English. Claude generates the code.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-xl">🔄</span>
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-1 text-foreground">Clone & Deploy</h3>
              <p className="text-muted-foreground">
                Browse community workflows, clone them, and deploy to your wallet.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-gradient-to-r from-primary to-accent-foreground py-20 px-4">
        <div className="max-w-4xl mx-auto text-center text-primary-foreground">
          <h2 className="text-4xl font-bold mb-6">Ready to Build?</h2>
          <p className="text-xl mb-8 opacity-90">
            Start creating automated DeFi workflows in minutes
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/create">
              <Button size="lg" variant="secondary" className="text-lg px-8 py-6">
                Create Your First Workflow
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button size="lg" variant="outline" className="text-lg px-8 py-6 bg-background/10 hover:bg-background/20 text-primary-foreground border-primary-foreground/30">
                View Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-muted text-muted-foreground py-12 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <p className="mb-4">Built on Flow Blockchain • Powered by IPFS • Generated with Claude AI</p>
          <p className="text-sm">ForteHub - Democratizing DeFi Automation</p>
        </div>
      </div>
    </div>
  );
}
