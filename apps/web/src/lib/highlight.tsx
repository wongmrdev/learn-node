import type { ReactNode } from 'react';

const KEYWORDS = new Set([
  'const', 'let', 'var', 'async', 'await', 'import', 'from', 'export',
  'return', 'if', 'else', 'new', 'function', 'type', 'interface', 'as',
  'void', 'for', 'while', 'try', 'catch', 'throw', 'default', 'in', 'of',
]);

const LITERALS = new Set(['true', 'false', 'null', 'undefined']);

const TOKEN_RE =
  /(\/\/[^\n]*|`(?:\\.|[^`])*`|'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b)/g;

export function highlight(code: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const match of code.matchAll(TOKEN_RE)) {
    const tok = match[0];
    const start = match.index ?? 0;
    if (start > last) parts.push(code.slice(last, start));
    if (tok.startsWith('//')) {
      parts.push(<span key={i++} className="tok-comment">{tok}</span>);
    } else if (tok.startsWith('`') || tok.startsWith("'") || tok.startsWith('"')) {
      parts.push(<span key={i++} className="tok-str">{tok}</span>);
    } else if (/^\d/.test(tok)) {
      parts.push(<span key={i++} className="tok-num">{tok}</span>);
    } else if (KEYWORDS.has(tok)) {
      parts.push(<span key={i++} className="tok-kw">{tok}</span>);
    } else if (LITERALS.has(tok)) {
      parts.push(<span key={i++} className="tok-lit">{tok}</span>);
    } else {
      parts.push(tok);
    }
    last = start + tok.length;
  }
  if (last < code.length) parts.push(code.slice(last));
  return parts;
}
