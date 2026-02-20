'use client';

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type GenerationMode =
  | "manual"
  | "server"
  | "openrouter"
  | "anthropic"
  | "openai";

export interface GenerationOption {
  value: GenerationMode;
  label: string;
  description: string;
}

interface GenerationMethodSelectorProps {
  options: GenerationOption[];
  currentMode: GenerationMode;
  onModeChange: (mode: GenerationMode) => void;
}

export function GenerationMethodSelector({
  options,
  currentMode,
  onModeChange,
}: GenerationMethodSelectorProps) {
  return (
    <div className="mb-6">
      <Label className="text-sm font-semibold">Generation Method</Label>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            variant={currentMode === option.value ? "default" : "outline"}
            onClick={() => onModeChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {options.find((option) => option.value === currentMode)?.description && (
        <p className="mt-2 text-xs text-gray-500">
          {options.find((option) => option.value === currentMode)?.description}
        </p>
      )}
    </div>
  );
}
