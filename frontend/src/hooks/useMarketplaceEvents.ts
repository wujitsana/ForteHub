// import { useFlowEvents } from '@onflow/react-sdk';
// import { useCallback } from 'react';

// const FORTEHUB_REGISTRY = (process.env.NEXT_PUBLIC_FORTEHUB_REGISTRY || '0xc2b9e41bc947f855').replace('0x', '').replace('0X', '');
// const FORTEHUB_MARKET = (process.env.NEXT_PUBLIC_FORTEHUB_MARKET_ADDRESS || '0xc2b9e41bc947f855').replace('0x', '').replace('0X', '');

/**
 * Marketplace event listener hook (DISABLED)
 * 
 * WebSocket event listeners cause stability issues:
 * - "Error while unsubscribing from topic: Error: WebSocket closed"
 * - Happens during page navigation or component unmount
 * 
 * Using 30s polling via useFlowQuery instead, which is more reliable.
 * Pages will still update automatically, just with a slight delay.
 */
export function useMarketplaceEvents(onUpdate: () => void) {
    // No-op - event listeners disabled due to WebSocket errors
    // Polling fallback in useFlowQuery handles updates

    // const handleEvent = useCallback((event: any) => {
    //     console.log('Marketplace Event received:', event);
    //     onUpdate();
    // }, [onUpdate]);

    // useFlowEvents({
    //     eventType: `A.${FORTEHUB_REGISTRY}.ForteHub.WorkflowRegistered`,
    //     onEvent: handleEvent
    // });

    // useFlowEvents({
    //     eventType: `A.${FORTEHUB_MARKET}.ForteHubMarket.ListingCreated`,
    //     onEvent: handleEvent
    // });

    // useFlowEvents({
    //     eventType: `A.${FORTEHUB_MARKET}.ForteHubMarket.ListingPurchased`,
    //     onEvent: handleEvent
    // });
}
