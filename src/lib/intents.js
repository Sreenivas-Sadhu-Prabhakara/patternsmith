// patternsmith — intent → regex
//
// Two libraries power the BUILD mode:
//
//   INTENTS  — complete, real-world patterns you can drop in whole
//              (email, URL, IPv4, ISO date, …). Each carries a short "what it
//              matches" note and an example so the palette teaches as it builds.
//
//   BLOCKS   — composable atoms that APPEND to the pattern you're forging,
//              each narrating what it adds (one-or-more digits, a word,
//              optional, capture group, anchors, …).
//
// Every pattern here is written for the browser's native RegExp engine and is
// intentionally readable rather than maximally strict — the point is to give a
// correct, honest starting point the user can refine in the tester.

/** @typedef {{ id:string, label:string, note:string, pattern:string, flags:string, example:string, sample:string }} Intent */

/** @type {Intent[]} */
export const INTENTS = [
  {
    id: 'email',
    label: 'Email address',
    note: 'A practical email match: name, an @, a domain, and a top-level suffix. Deliberately not RFC-exhaustive — it accepts the addresses people actually type.',
    pattern: "[\\w.+-]+@[\\w-]+\\.[\\w.-]+",
    flags: 'gi',
    example: 'ada@example.co.uk',
    sample: 'Ping ada@example.co.uk or team+updates@patternsmith.dev — not "@nope".',
  },
  {
    id: 'url',
    label: 'Web URL',
    note: 'An http/https URL with an optional path. Captures the scheme so you can reuse it.',
    pattern: "(https?)://[\\w.-]+(?:/[\\w./%#?=&-]*)?",
    flags: 'gi',
    example: 'https://patternsmith.dev/forge?x=1',
    sample: 'See https://patternsmith.dev and http://example.com/path?q=2 for more.',
  },
  {
    id: 'ipv4',
    label: 'IPv4 address',
    note: 'Four numbers 0–255 separated by dots. Each octet is range-checked, so 999.1.1.1 is rejected.',
    pattern: "\\b(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\b",
    flags: 'g',
    example: '192.168.0.1',
    sample: 'Router 192.168.0.1, DNS 8.8.8.8, bad 999.1.1.1 should not match.',
  },
  {
    id: 'isodate',
    label: 'ISO date (YYYY-MM-DD)',
    note: 'A calendar date in year-month-day form. Months 01–12, days 01–31 (it checks the shape, not that the day exists in that month).',
    pattern: "\\b(\\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])\\b",
    flags: 'g',
    example: '2026-07-11',
    sample: 'Launch 2026-07-11, review 2026-12-01, invalid 2026-13-40.',
  },
  {
    id: 'time24',
    label: '24-hour time (HH:MM)',
    note: 'A time from 00:00 to 23:59, with an optional :seconds.',
    pattern: "\\b([01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?\\b",
    flags: 'g',
    example: '09:41 or 23:59:59',
    sample: 'Standup 09:41, deploy 23:59:59, invalid 24:00 and 12:99.',
  },
  {
    id: 'phone',
    label: 'Phone number',
    note: 'A forgiving international-ish phone: an optional +country, then 7–14 digits with spaces, dots, or dashes between groups.',
    pattern: "\\+?\\d[\\d .-]{6,14}\\d",
    flags: 'g',
    example: '+1 415-555-0132',
    sample: 'Call +1 415-555-0132 or 080 2345 6789. Not a phone: 12.',
  },
  {
    id: 'hexcolor',
    label: 'Hex color',
    note: 'A CSS hex color: a # then exactly 3, 4, 6, or 8 hex digits.',
    pattern: "#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b",
    flags: 'g',
    example: '#ff7a3d',
    sample: 'Forge #ff7a3d, anvil #5cc8d8, short #fff, alpha #12345678, bad #12g.',
  },
  {
    id: 'slug',
    label: 'URL slug',
    note: 'A lowercase, dash-separated slug — the kind you see in clean URLs.',
    pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
    flags: '',
    example: 'build-a-regex-for-email',
    sample: 'build-a-regex-for-email',
  },
  {
    id: 'integer',
    label: 'Integer',
    note: 'A whole number, optionally negative. No leading zeros beyond a lone 0.',
    pattern: "-?(?:0|[1-9]\\d*)",
    flags: 'g',
    example: '-42',
    sample: 'Values: 0, 7, -42, 1000, and not 007.',
  },
  {
    id: 'decimal',
    label: 'Decimal number',
    note: 'A number with an optional sign and an optional fractional part.',
    pattern: "-?\\d+(?:\\.\\d+)?",
    flags: 'g',
    example: '3.14',
    sample: 'Readings: 3.14, -0.5, 42, 100.0.',
  },
  {
    id: 'uuid',
    label: 'UUID',
    note: 'A version-agnostic UUID: 8-4-4-4-12 hex digits.',
    pattern: "\\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\b",
    flags: 'gi',
    example: '550e8400-e29b-41d4-a716-446655440000',
    sample: 'ID 550e8400-e29b-41d4-a716-446655440000 and a bad one 123-456.',
  },
  {
    id: 'hashtag',
    label: 'Hashtag',
    note: 'A # followed by word characters — no spaces.',
    pattern: "#\\w+",
    flags: 'g',
    example: '#regex',
    sample: 'Loving #regex and #patternsmith today. # alone is not one.',
  },
  {
    id: 'creditcard',
    label: 'Card number (digits only)',
    note: 'A 13–19 digit number, optionally grouped by spaces or dashes. Shape only — it does not validate the checksum.',
    pattern: "\\b(?:\\d[ -]?){13,19}\\b",
    flags: 'g',
    example: '4111 1111 1111 1111',
    sample: 'Test card 4111 1111 1111 1111, short 1234.',
  },
  {
    id: 'zipus',
    label: 'US ZIP code',
    note: 'A 5-digit ZIP, with an optional +4 extension.',
    pattern: "\\b\\d{5}(?:-\\d{4})?\\b",
    flags: 'g',
    example: '94103-1234',
    sample: 'Ship to 94103 or 94103-1234, not 123.',
  },
];

/** @typedef {{ id:string, label:string, snippet:string, note:string, group?:string }} Block */

/**
 * Composable blocks. Each appends `snippet` to the working pattern.
 * `note` narrates what the addition matches. `group` clusters them in the UI.
 * @type {Block[]}
 */
export const BLOCKS = [
  // Character types
  { id: 'digit', label: 'a digit', snippet: '\\d', note: 'a single digit 0–9', group: 'Characters' },
  { id: 'digits', label: 'one or more digits', snippet: '\\d+', note: 'one or more digits in a row', group: 'Characters' },
  { id: 'letter', label: 'a letter', snippet: '[A-Za-z]', note: 'a single letter A–Z or a–z', group: 'Characters' },
  { id: 'word', label: 'a word', snippet: '\\w+', note: 'a run of word characters (letters, digits, underscore)', group: 'Characters' },
  { id: 'wordchar', label: 'a word character', snippet: '\\w', note: 'one word character', group: 'Characters' },
  { id: 'whitespace', label: 'whitespace', snippet: '\\s', note: 'a single whitespace character', group: 'Characters' },
  { id: 'spaces', label: 'some whitespace', snippet: '\\s+', note: 'one or more whitespace characters', group: 'Characters' },
  { id: 'any', label: 'any character', snippet: '.', note: 'any single character except a newline', group: 'Characters' },
  { id: 'literal', label: 'exact text…', snippet: '', note: 'exact text you type (special characters are escaped for you)', group: 'Characters' },

  // Quantifiers (append to the previous item)
  { id: 'plus', label: 'one or more', snippet: '+', note: 'makes the previous item repeat one or more times', group: 'Repeat' },
  { id: 'star', label: 'zero or more', snippet: '*', note: 'makes the previous item repeat zero or more times', group: 'Repeat' },
  { id: 'optional', label: 'optional', snippet: '?', note: 'makes the previous item optional (zero or one)', group: 'Repeat' },
  { id: 'exactly', label: 'exactly N…', snippet: '{N}', note: 'makes the previous item repeat exactly N times', group: 'Repeat' },
  { id: 'range', label: 'between N and M…', snippet: '{N,M}', note: 'makes the previous item repeat between N and M times', group: 'Repeat' },

  // Structure
  { id: 'start', label: 'start of text', snippet: '^', note: 'anchors to the start of the string', group: 'Structure' },
  { id: 'end', label: 'end of text', snippet: '$', note: 'anchors to the end of the string', group: 'Structure' },
  { id: 'boundary', label: 'word boundary', snippet: '\\b', note: 'the edge of a word', group: 'Structure' },
  { id: 'capture', label: 'capture group ( )', snippet: '()', note: 'a capture group — remembers what it matches (your cursor lands inside)', group: 'Structure' },
  { id: 'noncapture', label: 'group (?: )', snippet: '(?:)', note: 'a non-capturing group — bundles a pattern without remembering it', group: 'Structure' },
  { id: 'or', label: 'or (alternation)', snippet: '|', note: 'OR — matches what is on either side', group: 'Structure' },
  { id: 'charset', label: 'one of […]', snippet: '[]', note: 'a character set — matches any one character you list inside', group: 'Structure' },
];

/**
 * Escape a literal string so it matches itself inside a regex.
 * @param {string} text
 * @returns {string}
 */
export function escapeLiteral(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
