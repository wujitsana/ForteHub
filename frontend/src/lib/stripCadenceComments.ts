/**
 * Strip comments from Cadence code before IPFS deployment
 * Removes both block comments (/* */) and line comments (//)
 */
export function stripCadenceComments(code: string): string {
  let result = '';
  let i = 0;

  while (i < code.length) {
    // Check for block comment
    if (code[i] === '/' && code[i + 1] === '*') {
      // Skip until end of block comment
      i += 2;
      while (i < code.length - 1) {
        if (code[i] === '*' && code[i + 1] === '/') {
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }

    // Check for line comment
    if (code[i] === '/' && code[i + 1] === '/') {
      // Skip until end of line
      while (i < code.length && code[i] !== '\n') {
        i++;
      }
      // Keep the newline
      if (i < code.length && code[i] === '\n') {
        result += '\n';
        i++;
      }
      continue;
    }

    // Check for string literal to avoid removing "/" characters inside strings
    if (code[i] === '"' || code[i] === '\'') {
      const stringChar = code[i];
      result += code[i];
      i++;

      // Keep content until end of string
      while (i < code.length) {
        if (code[i] === '\\' && i + 1 < code.length) {
          // Handle escape sequences
          result += code[i] + code[i + 1];
          i += 2;
          continue;
        }

        if (code[i] === stringChar) {
          result += code[i];
          i++;
          break;
        }

        result += code[i];
        i++;
      }
      continue;
    }

    result += code[i];
    i++;
  }

  // Clean up excessive whitespace but preserve structure
  const lines = result.split('\n');
  const cleaned = lines
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');

  return cleaned;
}
