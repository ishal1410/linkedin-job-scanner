// Plain assert-based tests — no framework. Run with `npm test` or `node test.mjs`.
// These import the real helpers from lib.mjs, so they can't drift from the code.
import assert from 'node:assert/strict';
import { wordRe, csvCell, strip } from './lib.mjs';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('✓ ' + name); };

// ── wordRe: title/company matching ──
test('wordRe keeps a matching title', () => assert.ok(wordRe(['software']).test('Software Engineer')));
test('wordRe drops a non-matching title', () => assert.ok(!wordRe(['software']).test('Registered Nurse')));
test('wordRe excludes seniority terms', () => assert.ok(wordRe(['senior', 'ii']).test('Software Engineer II')));
test('wordRe does not match "ii" inside "III"', () => assert.ok(!wordRe(['ii']).test('Engineer III')));
test('wordRe keeps plain title when excluding', () => assert.ok(!wordRe(['senior']).test('Software Engineer')));

// The reason we use lookarounds instead of \b: punctuation-terminated tech terms.
test('wordRe matches c++', () => assert.ok(wordRe(['c++']).test('C++ Developer')));
test('wordRe matches c#', () => assert.ok(wordRe(['c#']).test('C# Engineer')));
test('wordRe matches .net', () => assert.ok(wordRe(['.net']).test('ASP .NET Developer')));
test('wordRe matches node.js', () => assert.ok(wordRe(['node.js']).test('Node.js Engineer')));
test('wordRe: c++ does not match plain C', () => assert.ok(!wordRe(['c++']).test('C Developer')));
test('wordRe compiles regex-special company names', () => assert.ok(wordRe(['C++ Devs (LLC)']).test('C++ Devs (LLC) is hiring')));
test('wordRe returns null for empty list', () => assert.equal(wordRe([]), null));

// ── csvCell: RFC-4180 quoting ──
test('csvCell wraps plain value', () => assert.equal(csvCell('Foo Inc'), '"Foo Inc"'));
test('csvCell keeps commas safe', () => assert.equal(csvCell('Foo, Inc'), '"Foo, Inc"'));
test('csvCell doubles embedded quotes', () => assert.equal(csvCell('The "Best" Co'), '"The ""Best"" Co"'));
test('csvCell handles null', () => assert.equal(csvCell(null), '""'));

// ── strip: tag removal + entity decoding ──
test('strip removes tags and collapses space', () => assert.equal(strip('<h3>  Software   Engineer </h3>'), 'Software Engineer'));
test("strip decodes O'Reilly (&#39;)", () => assert.equal(strip('O&#39;Reilly'), "O'Reilly"));
test('strip decodes AT&T (&amp;)', () => assert.equal(strip('AT&amp;T'), 'AT&T'));
test('strip decodes curly apostrophe (&#8217;)', () => assert.equal(strip('Macy&#8217;s'), 'Macy’s'));
test('strip decodes hex entity (&#x27;)', () => assert.equal(strip('O&#x27;Brien'), "O'Brien"));
test('strip is null-safe', () => assert.equal(strip(undefined), ''));

console.log(`\n${passed} tests passed.`);
