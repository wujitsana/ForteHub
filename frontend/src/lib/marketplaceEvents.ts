import { MarketplaceEvent } from '@/types/interfaces';

const FORTEHUB_MARKET_ADDRESS = process.env.NEXT_PUBLIC_FORTEHUB_MARKET_ADDRESS || '0xbd4c3996265ed830';


/**
 * Get the formatted event type string for useFlowEvents hook
 */
export function getMarketplaceEventType(eventName: 'ListingCreated' | 'ListingCancelled' | 'ListingPurchased' | 'ListingPriceUpdated'): string {
  const cleanAddress = FORTEHUB_MARKET_ADDRESS.startsWith('0x')
    ? FORTEHUB_MARKET_ADDRESS.slice(2).toUpperCase()
    : FORTEHUB_MARKET_ADDRESS.toUpperCase();
  return `A.${cleanAddress}.ForteHubMarket.${eventName}`;
}

/**
 * Parse marketplace event data from Flow event
 */
export function parseMarketplaceEvent(event: any): MarketplaceEvent | null {
  if (!event?.data) return null;

  const data = event.data;

  // Determine event type from event name
  let type: MarketplaceEvent['type'];
  if (event.type?.includes('ListingCreated')) {
    type = 'listed';
  } else if (event.type?.includes('ListingCancelled')) {
    type = 'unlisted';
  } else if (event.type?.includes('ListingPurchased')) {
    type = 'purchased';
  } else if (event.type?.includes('ListingPriceUpdated')) {
    type = 'priceUpdated';
  } else {
    return null;
  }

  return {
    type,
    listingId: parseInt(data.listingId || '0'),
    workflowId: parseInt(data.workflowId || '0'),
    price: data.price?.toString(),
    seller: data.seller,
    buyer: data.buyer,
    timestamp: Date.now()
  };
}

/**
 * Format price for display
 */
export function formatPrice(price: string | number | null | undefined): string {
  if (!price || price === '0') return 'Free';
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  return `${numPrice.toFixed(3)} FLOW`;
}

/**
 * Get creator address display
 */
export function formatAddress(address: string | null | undefined): string {
  if (!address) return 'Unknown';
  return `${address.slice(0, 8)}...${address.slice(-4)}`;
}

/**
 * Calculate platform fee
 */
export function calculatePlatformFee(price: number, feePercent: number = 0.02): number {
  return price * feePercent;
}

/**
 * Calculate seller payout
 */
export function calculateSellerPayout(price: number, feePercent: number = 0.02): number {
  return price * (1 - feePercent);
}

/**
 * Marketplace sorting options
 */
export type MarketplaceSortOption = 'newest' | 'price-low' | 'price-high' | 'most-popular' | 'trending';

/**
 * Sort workflows by different criteria
 */
export function sortWorkflows(workflows: any[], sortBy: MarketplaceSortOption) {
  const sorted = [...workflows];

  switch (sortBy) {
    case 'newest':
      return sorted.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    case 'price-low':
      return sorted.sort((a, b) => {
        const priceA = a.price ? parseFloat(a.price) : Infinity;
        const priceB = b.price ? parseFloat(b.price) : Infinity;
        return priceA - priceB;
      });

    case 'price-high':
      return sorted.sort((a, b) => {
        const priceA = a.price ? parseFloat(a.price) : 0;
        const priceB = b.price ? parseFloat(b.price) : 0;
        return priceB - priceA;
      });

    case 'most-popular':
      return sorted.sort((a, b) => (b.cloneCount || 0) - (a.cloneCount || 0));

    case 'trending':
      // Sort by recent activity (clones + sales)
      return sorted.sort((a, b) => {
        const scoreA = (a.cloneCount || 0) + (a.totalSalesCount || 0);
        const scoreB = (b.cloneCount || 0) + (b.totalSalesCount || 0);
        return scoreB - scoreA;
      });

    default:
      return sorted;
  }
}

/**
 * Filter workflows by multiple criteria
 */
export interface MarketplaceFilterOptions {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  creator?: string;
  searchQuery?: string;
  status?: 'all' | 'for-sale' | 'sold';
}

export function filterWorkflows(workflows: any[], options: MarketplaceFilterOptions) {
  return workflows.filter(workflow => {
    // Category filter
    if (options.category && options.category !== 'all' && workflow.category !== options.category) {
      return false;
    }

    // Price range filter
    if (workflow.price !== null && workflow.price !== undefined) {
      const price = parseFloat(workflow.price);
      if (options.minPrice !== undefined && price < options.minPrice) return false;
      if (options.maxPrice !== undefined && price > options.maxPrice) return false;
    }

    // Creator filter
    if (options.creator && workflow.creator !== options.creator) {
      return false;
    }

    // Search query filter
    if (options.searchQuery) {
      const query = options.searchQuery.toLowerCase();
      const matchesName = workflow.name?.toLowerCase().includes(query);
      const matchesDesc = workflow.description?.toLowerCase().includes(query);
      const matchesCreator = workflow.creator?.toLowerCase().includes(query);
      if (!matchesName && !matchesDesc && !matchesCreator) return false;
    }

    // Status filter (for-sale vs sold)
    if (options.status !== 'all') {
      if (options.status === 'for-sale' && !workflow.listing) return false;
      if (options.status === 'sold' && workflow.listing) return false;
    }

    return true;
  });
}
