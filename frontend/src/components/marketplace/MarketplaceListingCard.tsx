'use client';

import { MarketplaceListing } from '@/types/interfaces';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ShoppingCart, Eye, Link as LinkIcon, User } from 'lucide-react';
import Link from 'next/link';
import { Avatar } from '@/components/profile/ProfileAvatar';

interface MarketplaceListingCardProps {
  listing: MarketplaceListing;
  onBuy: () => void;
  onViewDetails?: () => void;
  isOwner: boolean;
  isOwned?: boolean;
  onUnlist?: () => void;
}

export function MarketplaceListingCard({
  listing,
  onBuy,
  onUnlist,
  onViewDetails,
  isOwner,
  isOwned
}: MarketplaceListingCardProps) {
  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const sellerAddress = listing.seller ? formatAddress(listing.seller) : 'Unknown';
  const creatorAddress = listing.workflowInfo?.creator ? formatAddress(listing.workflowInfo.creator) : 'Unknown';

  const isSellerCreator = listing.seller === listing.workflowInfo?.creator;

  return (
    <Card className="overflow-hidden hover:shadow-xl transition-all duration-300 bg-white border-0">
      {/* Image */}
      <div className="relative w-full h-40 bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center overflow-hidden group">
        <img
          src={listing.workflowInfo?.imageIPFS || 'https://coffee-solid-parakeet-145.mypinata.cloud/ipfs/bafybeib6okpp5ullxvjqe6n4wmmnnd4guks4buk5gluy5lnymwugrjpyzq'}
          alt={listing.workflowInfo?.name || 'Workflow'}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => {
            e.currentTarget.src = 'https://coffee-solid-parakeet-145.mypinata.cloud/ipfs/bafybeib6okpp5ullxvjqe6n4wmmnnd4guks4buk5gluy5lnymwugrjpyzq';
          }}
        />
        {/* Category badge */}
        {listing.workflowInfo?.category && (
          <div className="absolute top-2 left-2">
            <Badge variant="secondary" className="bg-white/90 backdrop-blur-sm text-slate-800 hover:bg-white">
              {listing.workflowInfo.category}
            </Badge>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Title */}
        <h3 className="font-semibold text-slate-900 line-clamp-1 mb-2">
          {listing.workflowInfo?.name || `Workflow Listing #${listing.listingId}`}
        </h3>

        {/* Seller & Creator Info */}
        <div className="flex flex-col gap-2 mb-3">
          {/* Seller */}
          <div className="flex items-center gap-2">
            <Link href={`/profile/${listing.seller}`}>
              <Avatar address={listing.seller} size="xs" />
            </Link>
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Seller</span>
              <Link
                href={`/profile/${listing.seller}`}
                className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium"
              >
                {sellerAddress}
              </Link>
            </div>
          </div>

          {/* Creator (if different) */}
          {!isSellerCreator && listing.workflowInfo?.creator && (
            <div className="flex items-center gap-2 mt-1 pt-2 border-t border-slate-100">
              <Link href={`/profile/${listing.workflowInfo.creator}`}>
                <Avatar address={listing.workflowInfo.creator} size="xs" />
              </Link>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Creator</span>
                <Link
                  href={`/profile/${listing.workflowInfo.creator}`}
                  className="text-xs text-slate-600 hover:text-slate-800 hover:underline"
                >
                  {creatorAddress}
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Description (if available) */}
        {listing.workflowInfo?.description && (
          <p className="text-sm text-slate-600 line-clamp-2 mb-3 min-h-[2.5rem]">
            {listing.workflowInfo.description}
          </p>
        )}

        {/* Price */}
        <div className="mb-3 flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100">
          <div>
            <p className="text-lg font-bold text-slate-900">
              {listing.price} <span className="text-xs font-normal text-slate-500">FLOW</span>
            </p>
          </div>
          {listing.platformFeePercent && (
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block">Platform Fee</span>
              <span className="text-xs text-slate-500">
                +{(Number(listing.price) * listing.platformFeePercent).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {onViewDetails && (
            <Button
              onClick={onViewDetails}
              variant="outline"
              size="sm"
              className="flex-1 rounded-lg"
            >
              <Eye className="w-4 h-4 mr-1" />
              Details
            </Button>
          )}

          {isOwner ? (
            <Button
              onClick={onUnlist}
              size="sm"
              variant="destructive"
              className="flex-1 rounded-lg"
            >
              Unlist
            </Button>
          ) : (
            <Button
              onClick={onBuy}
              size="sm"
              className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-700"
              disabled={isOwned}
              title={isOwned ? 'You already own this workflow' : 'Purchase workflow'}
            >
              <ShoppingCart className="w-4 h-4 mr-1" />
              {isOwned ? 'Owned' : 'Buy'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
