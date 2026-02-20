/**
 * Footer Component
 *
 * Footer with links and branding - Theme-aware design.
 */

import Link from "next/link";
import { Github, Twitter, Zap } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted/30 backdrop-blur-sm mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {/* Branding */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-gradient-to-br from-primary to-accent-foreground rounded">
                <Zap className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold bg-gradient-to-r from-primary to-accent-foreground bg-clip-text text-transparent">
                ForteHub
              </span>
            </div>
            <p className="text-muted-foreground text-sm">
              Create and Discover Automatic DeFi workflows on Flow blockchain. 
            </p>
          </div>

          {/* Links */}
          <div>
            <h3 className="font-bold text-foreground mb-4 text-sm">Platform</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/discover" className="hover:text-primary transition-colors">
                  Discover
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-primary transition-colors">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link href="/create" className="hover:text-primary transition-colors">
                  Create
                </Link>
              </li>
            </ul>
          </div>

          {/* Social */}
          <div>
            <h3 className="font-bold text-foreground mb-4 text-sm">Community</h3>
            <div className="flex items-center gap-4 mb-4">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                <Github className="w-5 h-5" />
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                <Twitter className="w-5 h-5" />
              </a>
            </div>
            <p className="text-xs text-muted-foreground">
              Built on Flow for Forte Hacks 2025
            </p>
          </div>
        </div>

        <div className="border-t border-border mt-8 pt-6 text-center text-sm text-muted-foreground">
          © 2025 ForteHub. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
