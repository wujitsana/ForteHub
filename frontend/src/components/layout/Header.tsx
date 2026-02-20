"use client";

import Link from "next/link";
import { Connect } from "@onflow/react-sdk";
import { ThemeToggle } from "../ui/ThemeToggle";
import { Sparkles, Menu, X } from "lucide-react";
import { useState } from "react";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      {/* Top Header Bar - Clean Modern Design */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="p-1.5 bg-gradient-to-br from-primary to-accent-foreground rounded-lg">
                <Sparkles className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold text-foreground">
                ForteHub
              </span>
            </Link>

            {/* Network Indicator */}
            {(process.env.NEXT_PUBLIC_FLOW_NETWORK === 'testnet' || process.env.NEXT_PUBLIC_FLOW_NETWORK === 'emulator') && (
              <div className="ml-3 px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-xs font-medium text-yellow-500">
                {process.env.NEXT_PUBLIC_FLOW_NETWORK === 'testnet' ? 'Testnet' : 'Emulator'}
              </div>
            )}

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-muted-foreground hover:text-foreground transition-colors"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>

            {/* Desktop Navigation + Wallet */}
            <div className="hidden md:flex items-center gap-6">
              {/* Nav Links */}
              <nav className="flex items-center gap-6">
                <Link
                  href="/discover"
                  className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium"
                >
                  Discover
                </Link>
                <Link
                  href="/marketplace"
                  className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium"
                >
                  Marketplace
                </Link>
                <Link
                  href="/create"
                  className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium"
                >
                  Create
                </Link>
                <Link
                  href="/dashboard"
                  className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium"
                >
                  Dashboard
                </Link>
              </nav>

              {/* Theme Toggle */}
              <ThemeToggle />

              {/* Wallet Connect */}
              <div className="pl-6 border-l border-border">
                <Connect />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <nav className="md:hidden bg-background border-b border-border sticky top-[57px] z-40">
          <div className="max-w-7xl mx-auto px-4 py-4 space-y-3">
            <Link
              href="/discover"
              className="block text-muted-foreground hover:text-foreground transition-colors text-sm py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Discover
            </Link>
            <Link
              href="/marketplace"
              className="block text-muted-foreground hover:text-foreground transition-colors text-sm py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Marketplace
            </Link>
            <Link
              href="/create"
              className="block text-muted-foreground hover:text-foreground transition-colors text-sm py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Create
            </Link>
            <Link
              href="/dashboard"
              className="block text-muted-foreground hover:text-foreground transition-colors text-sm py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Dashboard
            </Link>
            <div className="border-t border-border pt-3 mt-3 flex items-center justify-between">
              <Connect />
              <ThemeToggle />
            </div>
          </div>
        </nav>
      )}
    </>
  );
}
