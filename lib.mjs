// Pure, side-effect-free helpers shared by scan.mjs and the tests.
// Kept separate so tests exercise the real code instead of copies that can drift.

// Case-insensitive matcher from a word list. Bounded with alphanumeric lookarounds
// instead of \b so terms ending/starting in punctuation still match — \b would make
// "c++", "c#", ".net", "node.js" match nothing. Returns null for an empty list.
export const wordRe = (words) => words && words.length
  ? new RegExp('(?<![a-z0-9])(' + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![a-z0-9])', 'i')
  : null;

// Quote a value for CSV (RFC 4180): wrap in quotes, double any embedded quote.
export const csvCell = s => `"${String(s ?? '').replace(/"/g, '""')}"`;

// Decode HTML entities so names like "O'Reilly", "Macy's", "AT&T" survive intact.
const NAMED = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };
export const decode = s => (s || '')
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g, m => NAMED[m]);

// Strip HTML tags + decode entities + collapse whitespace.
export const strip = s => decode((s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
