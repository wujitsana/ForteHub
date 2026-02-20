'use client';

import { getAvatarDataURL } from '@/lib/avatarGenerator';
import { Avatar as ShadcnAvatar, AvatarImage } from '@/components/ui/avatar';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  address: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Reusable Avatar component for displaying user/creator profiles
 * Shows a circular generative avatar based on wallet address
 * Uses shadcn/ui Avatar as base
 */
export function UserAvatar({
  address,
  size = 'md',
  className = ''
}: UserAvatarProps) {
  const sizeClasses = {
    xs: 'h-8 w-8',
    sm: 'h-12 w-12',
    md: 'h-16 w-16',
    lg: 'h-32 w-32'
  };

  const avatarUrl = getAvatarDataURL(address);

  return (
    <ShadcnAvatar className={cn(sizeClasses[size], className)}>
      <AvatarImage src={avatarUrl} alt={address} />
    </ShadcnAvatar>
  );
}

/**
 * Export as 'Avatar' for backward compatibility
 */
export const Avatar = UserAvatar;

/**
 * Profile Avatar with address and copy button - used in profile pages
 */
interface ProfileAvatarProps {
  address: string;
  name?: string;
  size?: 'md' | 'lg';
}

export function ProfileAvatar({ address, name, size = 'md' }: ProfileAvatarProps) {
  const [copied, setCopied] = useState(false);

  const sizeClasses = {
    md: 'w-32 h-32',
    lg: 'w-48 h-48'
  };

  const avatarUrl = getAvatarDataURL(address);
  const displayAddress = `${address.slice(0, 8)}...${address.slice(-4)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Avatar Image - Circular */}
      <img
        src={avatarUrl}
        alt={name || displayAddress}
        className={`${sizeClasses[size]} rounded-full shadow-lg border-4 border-slate-200`}
      />

      {/* Address and Copy Button */}
      <div className="flex items-center gap-2">
        <code className="text-sm font-mono bg-slate-100 px-3 py-1 rounded text-slate-700">
          {displayAddress}
        </code>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          title="Copy full address"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-600" />
          ) : (
            <Copy className="w-4 h-4 text-slate-600" />
          )}
        </Button>
      </div>

      {/* Name if provided */}
      {name && (
        <p className="text-center text-lg font-semibold text-slate-900">{name}</p>
      )}
    </div>
  );
}
