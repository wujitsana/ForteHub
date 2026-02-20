'use client';

import { WorkflowInfo } from '@/types/interfaces';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Heart, ShoppingCart, Eye } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/profile/ProfileAvatar';

interface WorkflowCardProps {
  workflow: WorkflowInfo;
  isCreator: boolean;
  onClone: () => void;
  onBuy: () => void;
  onInfo: () => void;
}

export function WorkflowCard({
  workflow,
  isCreator,
  onClone,
  onBuy,
  onInfo
}: WorkflowCardProps) {
  const [liked, setLiked] = useState(false);

  const getCategoryBadgeColor = (category: string | undefined) => {
    if (!category || typeof category !== 'string') {
      return 'bg-gray-100 text-gray-800';
    }
    const colors: Record<string, string> = {
      yield: 'bg-green-100 text-green-800',
      dca: 'bg-blue-100 text-blue-800',
      rebalancing: 'bg-purple-100 text-purple-800',
      arbitrage: 'bg-orange-100 text-orange-800',
      lending: 'bg-yellow-100 text-yellow-800',
      liquidation: 'bg-red-100 text-red-800',
      governance: 'bg-indigo-100 text-indigo-800',
      nft: 'bg-pink-100 text-pink-800',
      bridge: 'bg-cyan-100 text-cyan-800',
    };
    return colors[category.toLowerCase()] || 'bg-gray-100 text-gray-800';
  };

  const creatorAddress = workflow.creator
    ? `${workflow.creator.slice(0, 8)}...${workflow.creator.slice(-4)}`
    : 'Unknown';

  return (
    <Card className="overflow-hidden hover:shadow-xl transition-all duration-300 bg-white border-0">
      {/* Image */}
      <div className="relative w-full h-40 bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden group">
        <img
          src={workflow.imageIPFS || 'https://coffee-solid-parakeet-145.mypinata.cloud/ipfs/bafybeib6okpp5ullxvjqe6n4wmmnnd4guks4buk5gluy5lnymwugrjpyzq'}
          alt={workflow.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => {
            e.currentTarget.src = 'https://coffee-solid-parakeet-145.mypinata.cloud/ipfs/bafybeib6okpp5ullxvjqe6n4wmmnnd4guks4buk5gluy5lnymwugrjpyzq';
          }}
        />

        {/* Like button overlay */}
        <button
          onClick={() => setLiked(!liked)}
          className="absolute top-2 right-2 bg-white/80 backdrop-blur-sm rounded-full p-2 hover:bg-white transition-colors"
        >
          <Heart
            className={`w-5 h-5 ${liked ? 'fill-red-500 text-red-500' : 'text-slate-600'
              }`}
          />
        </button>

        {/* Category badge */}
        <div className="absolute top-2 left-2">
          <Badge className={getCategoryBadgeColor(workflow.category)}>
            {workflow.category}
          </Badge>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Title */}
        <h3 className="font-semibold text-slate-900 line-clamp-1 mb-1">
          {workflow.name}
        </h3>

        {/* Creator - Avatar and Link */}
        <div className="flex items-center gap-2 mb-3">
          <Link href={`/profile/${workflow.creator}`}>
            <Avatar address={workflow.creator} size="xs" />
          </Link>
          <Link
            href={`/profile/${workflow.creator}`}
            className="flex-1 min-w-0"
          >
            <p className="text-xs text-slate-600 hover:text-blue-600 hover:underline truncate">
              by {creatorAddress}
            </p>
          </Link>
        </div>

        {/* Description */}
        <p className="text-sm text-slate-600 line-clamp-2 mb-3 min-h-10">
          {workflow.description}
        </p>

        {/* Stats */}
        <div className="flex gap-4 text-xs text-slate-500 mb-4 pb-3 border-b border-slate-100">
          <div className="flex flex-col">
            <span className="font-semibold text-slate-900">
              {workflow.cloneCount || 0}
            </span>
            <span>Clones</span>
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-slate-900">
              {workflow.forkCount || 0}
            </span>
            <span>Forks</span>
          </div>
        </div>

        {/* Price if applicable */}
        <div className="mb-3 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100">
          <p className="text-sm font-semibold text-blue-900">
            {workflow.price && parseFloat(workflow.price) > 0
              ? `Clone: ${workflow.price} FLOW`
              : 'Free'}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            onClick={onInfo}
            variant="outline"
            size="sm"
            className="flex-1 rounded-lg"
          >
            <Eye className="w-4 h-4 mr-1" />
            View
          </Button>
          {!isCreator && workflow.isListed !== false ? (
            <Button
              onClick={onClone}
              size="sm"
              className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-700"
              disabled={!workflow.sourceCodeIPFS || workflow.sourceCodeIPFS.trim().length === 0}
            >
              Clone
            </Button>
          ) : (
            <Button
              onClick={onBuy}
              size="sm"
              variant="outline"
              className="flex-1 rounded-lg"
              disabled={isCreator}
              title={isCreator ? 'Cannot buy your own workflow' : 'Purchase from marketplace'}
            >
              <ShoppingCart className="w-4 h-4 mr-1" />
              Buy
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
