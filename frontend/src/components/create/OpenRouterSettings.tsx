'use client';

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface OpenRouterModelInfo {
  id: string;
  name?: string;
  description?: string;
}

interface OpenRouterSettingsProps {
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  rememberKey: boolean;
  onRememberKeyChange: (value: boolean) => void;
  model: string;
  onModelChange: (value: string) => void;
  models: OpenRouterModelInfo[];
  loading: boolean;
  sortAsc: boolean;
  onToggleSort: () => void;
  onFetchModels: () => void;
}

export function OpenRouterSettings({
  apiKey,
  onApiKeyChange,
  rememberKey,
  onRememberKeyChange,
  model,
  onModelChange,
  models,
  loading,
  sortAsc,
  onToggleSort,
  onFetchModels,
}: OpenRouterSettingsProps) {
  const hasModels = models.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor="openrouter-api-key">OpenRouter API Key*</Label>
          <Input
            id="openrouter-api-key"
            type="password"
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
            placeholder="sk-or-..."
          />
        </div>
        <div>
          <Label htmlFor="openrouter-model">Model</Label>
          {hasModels ? (
            <Select value={model} onValueChange={onModelChange}>
              <SelectTrigger id="openrouter-model">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name
                      ? `${candidate.name} (${candidate.id})`
                      : candidate.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="openrouter-model"
              value={model}
              onChange={(event) => onModelChange(event.target.value)}
              placeholder="openrouter/auto"
            />
          )}
        </div>
        <div className="flex items-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onFetchModels}
            disabled={loading || !apiKey.trim()}
          >
            {loading ? "Loading…" : "Fetch models"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onToggleSort}
            disabled={!hasModels}
          >
            {sortAsc ? "Sort Z→A" : "Sort A→Z"}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="remember-openrouter-key"
          checked={rememberKey}
          onCheckedChange={(checked) => onRememberKeyChange(checked === true)}
        />
        <Label htmlFor="remember-openrouter-key" className="text-sm text-gray-600">
          Remember this key in this discoverr (stored locally only)
        </Label>
      </div>

      <p className="text-xs text-gray-500">
        Tip: after fetching models you can choose any option available to your OpenRouter
        account. Grok (x/grok-1) is selected by default.
      </p>
    </div>
  );
}
