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

interface AnthropicModelInfo {
  id: string;
  name?: string;
  description?: string;
}

interface AnthropicSettingsProps {
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  rememberKey: boolean;
  onRememberKeyChange: (value: boolean) => void;
  model: string;
  onModelChange: (value: string) => void;
  models: AnthropicModelInfo[];
  loading: boolean;
  onFetchModels: () => void;
}

export function AnthropicSettings({
  apiKey,
  onApiKeyChange,
  rememberKey,
  onRememberKeyChange,
  model,
  onModelChange,
  models,
  loading,
  onFetchModels,
}: AnthropicSettingsProps) {
  const hasModels = models.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor="anthropic-api-key">Anthropic API Key*</Label>
          <Input
            id="anthropic-api-key"
            type="password"
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
            placeholder="sk-ant-..."
          />
        </div>
        <div>
          <Label htmlFor="anthropic-model">Model</Label>
          {hasModels ? (
            <Select value={model} onValueChange={onModelChange}>
              <SelectTrigger id="anthropic-model">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name ?? candidate.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="anthropic-model"
              value={model}
              onChange={(event) => onModelChange(event.target.value)}
              placeholder="claude-3-5-sonnet-20240620"
            />
          )}
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            onClick={onFetchModels}
            disabled={loading || !apiKey.trim()}
          >
            {loading ? "Loading…" : "Fetch models"}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="remember-anthropic-key"
          checked={rememberKey}
          onCheckedChange={(checked) => onRememberKeyChange(checked === true)}
        />
        <Label htmlFor="remember-anthropic-key" className="text-sm text-gray-600">
          Remember this key in this discoverr (stored locally only)
        </Label>
      </div>

      <p className="text-xs text-gray-500">
        Requests Anthropic&apos;s Messages API. Make sure your key has access to the selected Claude model.
      </p>
    </div>
  );
}
