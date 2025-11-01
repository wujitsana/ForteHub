'use client';

/**
 * Fork Workflow Page - Phase 3 Implementation
 *
 * This page handles forking an existing workflow with customization:
 * 1. Load parent workflow metadata from registry
 * 2. Allow user to customize strategy parameters
 * 3. Deploy as a new workflow with parentWorkflowId reference
 *
 * Currently disabled - stub for Phase 3 implementation
 * Will use deterministic template rewriting instead of LLM regeneration
 */

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface PageProps {
  params: {
    id: string;
  };
}

export default function ForkWorkflowPage({ params }: PageProps) {
  const router = useRouter();
  const workflowId = params.id;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Phase 3: Load workflow metadata from registry
    // const workflow = await fetchWorkflowInfo(workflowId);
    // Display customization form with parent metadata
    setLoading(false);
  }, [workflowId]);

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen">Loading workflow...</div>;
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Fork Workflow</CardTitle>
            <CardDescription>
              This page will allow you to customize and deploy a fork of an existing workflow.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
              <p className="font-semibold mb-2">Phase 3 Feature (Disabled for MVP)</p>
              <p>
                Fork workflow customization is planned for Phase 3. For now, use the Clone button on the Browse page
                to deploy existing workflows to your wallet, then use the Create page to customize strategy parameters.
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.push('/browse')}>
                Back to Browse
              </Button>
              <Button onClick={() => router.push('/create')}>
                Create New Workflow
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
