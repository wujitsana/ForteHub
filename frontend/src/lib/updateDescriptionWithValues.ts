/**
 * Update workflow description to include default parameter values
 *
 * Searches for patterns like "rebalances every X hours" or "target Y%"
 * and updates the numbers to match the currently configured defaults
 */

export interface ParameterValues {
  [key: string]: string | number;
}

/**
 * Updates description to reflect current default parameter values
 *
 * Example:
 * Input: "Rebalances portfolio targeting 60% FLOW and 40% stables daily"
 * With params: { flowTargetPercent: "0.70" }
 * Output: "Rebalances portfolio targeting 70% FLOW and 40% stables daily"
 *
 * Also handles time-based parameters:
 * Input: "Executes swaps every 3600 seconds"
 * With params: { defaultFrequency: "7200" }
 * Output: "Executes swaps every 7200 seconds"
 */
export function updateDescriptionWithValues(
  description: string,
  parameterValues: ParameterValues
): string {
  let updated = description;

  // Iterate through all parameter values
  for (const [paramName, value] of Object.entries(parameterValues)) {
    if (!value) continue;

    const valueNum = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(valueNum)) continue;

    // Handle percentage parameters (e.g., flowTargetPercent: "0.60" -> "60%")
    if (paramName.includes('Target') && paramName.includes('Percent')) {
      const percentValue = Math.round(valueNum * 100);

      // Extract base name (e.g., "flowTargetPercent" -> "FLOW")
      const baseName = paramName
        .replace(/Target.*/, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .trim();

      // Replace patterns like "60% FLOW" or "60 percent"
      updated = updated.replace(
        new RegExp(`\\d+\\s*%?\\s*${baseName}`, 'gi'),
        `${percentValue}% ${baseName}`
      );
    }

    // Handle frequency parameters (in seconds)
    if (paramName === 'defaultFrequency') {
      const valueSeconds = Math.round(valueNum);

      // Replace "X seconds" patterns
      updated = updated.replace(
        /\d+\s+seconds/gi,
        `${valueSeconds} seconds`
      );

      // Also replace "every X seconds" patterns
      updated = updated.replace(
        /every\s+\d+\s+seconds/gi,
        `every ${valueSeconds} seconds`
      );

      // Convert to human-readable time if appropriate
      const hours = valueSeconds / 3600;
      const days = valueSeconds / 86400;

      if (Math.abs(hours - Math.round(hours)) < 0.1) {
        const roundedHours = Math.round(hours);
        updated = updated.replace(
          new RegExp(`\\d+\\s+hours?`, 'gi'),
          `${roundedHours} hour${roundedHours !== 1 ? 's' : ''}`
        );
      } else if (Math.abs(days - Math.round(days)) < 0.1) {
        const roundedDays = Math.round(days);
        updated = updated.replace(
          new RegExp(`\\d+\\s+days?`, 'gi'),
          `${roundedDays} day${roundedDays !== 1 ? 's' : ''}`
        );
      }
    }

    // Handle threshold parameters
    if (paramName.includes('Threshold')) {
      const thresholdValue = typeof value === 'number'
        ? value.toFixed(2)
        : parseFloat(value).toFixed(2);

      // Replace numeric threshold patterns
      updated = updated.replace(
        /\d+\.?\d*\s*threshold/gi,
        `${thresholdValue} threshold`
      );
    }

    // Handle amount parameters
    if (paramName.includes('Amount') || paramName.includes('Min') || paramName.includes('Max')) {
      const amountValue = typeof value === 'number'
        ? value.toFixed(2)
        : value;

      // Try to find and replace similar amounts
      updated = updated.replace(
        new RegExp(`\\d+\\.?\\d*\\s+(?:FLOW|USDC|amount)`, 'gi'),
        `${amountValue} $&`.trim()
      );
    }
  }

  return updated;
}

/**
 * Extract all numeric values from description that might be parameters
 * Useful for understanding what parameters the description references
 */
export function extractParametersFromDescription(
  description: string
): { label: string; value: string | number }[] {
  const params: { label: string; value: string | number }[] = [];

  // Extract percentages (e.g., "60%", "0.60")
  const percentMatches = description.matchAll(/(\d+\.?\d*)\s*%/g);
  for (const match of percentMatches) {
    params.push({
      label: `Percentage: ${match[1]}%`,
      value: match[1]
    });
  }

  // Extract time values (seconds, hours, days)
  const timeMatches = description.matchAll(/(\d+)\s+(seconds?|hours?|days?)/gi);
  for (const match of timeMatches) {
    params.push({
      label: `${match[2]}: ${match[1]}`,
      value: match[1]
    });
  }

  // Extract decimal values (thresholds, etc.)
  const decimalMatches = description.matchAll(/(\d+\.\d+)\s+(?!%)/g);
  for (const match of decimalMatches) {
    params.push({
      label: `Value: ${match[1]}`,
      value: match[1]
    });
  }

  return params;
}
