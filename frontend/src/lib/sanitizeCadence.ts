
  export const sanitizeCadenceCode = (code: string): string => {
    let adjusted = code.replace(/\u00A0/g, ' ');
    adjusted = adjusted.replace(/&\s*\{\s*([A-Za-z0-9_.]+)\s*\}/g, (_, type: string) => {
      return type.includes('.') ? `&{${type}}` : `&${type}`;
    });
    adjusted = adjusted.replace(/@\s*\{\s*([A-Za-z0-9_.]+)\s*\}/g, (_, type: string) => {
      return type.includes('.') ? `@{${type}}` : `@${type}`;
    });

    adjusted = adjusted.replace(/\n([ \t]*);[ \t]*pre/g, (_, indent: string) => `\n${indent}pre`);
    adjusted = adjusted.replace(/;[ \t]*pre/g, '\n        pre');

    adjusted = adjusted.replace(/\n([ \t]*);[ \t]*post/g, (_, indent: string) => `\n${indent}post`);
    adjusted = adjusted.replace(/;[ \t]*post/g, '\n        post');

    adjusted = adjusted.replace(/(pre\s*\{[\s\S]*?\})\s*;/g, '$1');
    adjusted = adjusted.replace(/(post\s*\{[\s\S]*?\})\s*;/g, '$1');
    adjusted = adjusted.replace(/access\(([^)]+)\)\s+type\s+([A-Za-z0-9_]+)\s*=/g, 'access($1) let $2 = ');

    const mergeGuardBlocks = (text: string, keyword: 'pre' | 'post'): string => {
      const lines = text.split('\n');
      const merged: string[] = [];
      const guardRegex = new RegExp(`^(\\s*)${keyword}\\s*\\{\\s*(.*)\\s*\\}\\s*$`);

      let guardIndent: string | null = null;
      let guardEntries: string[] = [];

      const flush = () => {
        if (guardIndent === null || guardEntries.length === 0) {
          guardIndent = null;
          guardEntries = [];
          return;
        }
        merged.push(`${guardIndent}${keyword} {`);
        guardEntries.forEach(entry => {
          const trimmed = entry.trim();
          if (trimmed.length > 0) {
            merged.push(`${guardIndent}    ${trimmed}`);
          }
        });
        merged.push(`${guardIndent}}`);
        guardIndent = null;
        guardEntries = [];
      };

      lines.forEach(line => {
        const match = guardRegex.exec(line);
        if (match) {
          const indent = match[1];
          const body = match[2];
          if (guardIndent !== null && indent !== guardIndent) {
            flush();
          }
          if (guardIndent === null) {
            guardIndent = indent;
          }
          guardEntries.push(body);
          return;
        }

        flush();
        merged.push(line);
      });

      flush();
      return merged.join('\n');
    };

    adjusted = mergeGuardBlocks(adjusted, 'pre');
    adjusted = mergeGuardBlocks(adjusted, 'post');

    adjusted = adjusted.replace(
      /return\s+([^\n]+?)!\s+as!\s+&([A-Za-z0-9_.]+)/g,
      'return $1!'
    );
    return adjusted;
  };
