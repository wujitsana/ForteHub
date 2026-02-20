'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to discover page (marketplace)
    router.replace('/discover');
  }, [router]);

  return null;
}
