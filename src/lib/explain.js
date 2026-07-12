// patternsmith — regex → plain English
//
// A hand-written recursive-descent tokenizer for JS regular expressions.
// It walks the source once and emits a flat, ordered list of "segments",
// each carrying: the exact source slice, a short label, a plain-English
// description, a semantic kind (for coloring), and a nesting depth.
//
// This is deliberately not a full ECMAScript RegExp parser — it targets the
// constructs people actually read and write, and degrades gracefully to a
// "literal character" reading for anything exotic rather than throwing.

/**
 * @typedef {Object} Segment
 * @property {string} src        exact source text of this token
 * @property {string} label      terse label (e.g. "one or more")
 * @property {string} desc       full plain-English sentence
 * @property {string} kind       semantic class for styling
 * @property {number} depth      group nesting depth
 */

const NAMED_CLASS = {
  d: { label: 'any digit', desc: 'any digit, 0 through 9' },
  D: { label: 'non-digit', desc: 'any character that is not a digit' },
  w: {
    label: 'word character',
    desc: 'any word character: a letter, a digit, or an underscore',
  },
  W: {
    label: 'non-word character',
    desc: 'any character that is not a letter, digit, or underscore',
  },
  s: {
    label: 'whitespace',
    desc: 'any whitespace: a space, tab, newline, or similar',
  },
  S: { label: 'non-whitespace', desc: 'any character that is not whitespace' },
  b: { label: 'word boundary', desc: 'a word boundary (edge of a word)' },
  B: { label: 'non-boundary', desc: 'a position that is not a word boundary' },
};

const ESCAPED = {
  n: { label: 'newline', desc: 'a newline character' },
  r: { label: 'carriage return', desc: 'a carriage-return character' },
  t: { label: 'tab', desc: 'a tab character' },
  f: { label: 'form feed', desc: 'a form-feed character' },
  v: { label: 'vertical tab', desc: 'a vertical-tab character' },
  0: { label: 'null', desc: 'a null character' },
};

function humanChar(ch) {
  if (ch === ' ') return 'a space';
  if (ch === '\t') return 'a tab';
  return `the character “${ch}”`;
}

// Ordinal words for capture-group numbering, read aloud.
const ORDINALS = [
  'zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth',
  'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth',
];
function ordinal(n) {
  return ORDINALS[n] || `#${n}`;
}

/**
 * Tokenize a regex source string into ordered plain-English segments.
 * @param {string} source
 * @returns {{ segments: Segment[], captureCount: number, error: string|null }}
 */
export function explainPattern(source) {
  /** @type {Segment[]} */
  const segments = [];
  let i = 0;
  let depth = 0;
  let captureCount = 0;
  const n = source.length;

  const push = (src, label, desc, kind) =>
    segments.push({ src, label, desc, kind, depth });

  try {
    while (i < n) {
      const ch = source[i];

      // ---- Anchors ---------------------------------------------------
      if (ch === '^') {
        push('^', 'start', 'anchors the match to the start of the string (or line, with the m flag)', 'anchor');
        i++;
        continue;
      }
      if (ch === '$') {
        push('$', 'end', 'anchors the match to the end of the string (or line, with the m flag)', 'anchor');
        i++;
        continue;
      }

      // ---- Groups ----------------------------------------------------
      if (ch === '(') {
        // Look-around and non-capturing variants
        if (source.startsWith('(?=', i)) {
          push('(?=', 'lookahead', 'a positive lookahead — what follows must match here, but is not consumed', 'group');
          depth++;
          i += 3;
          continue;
        }
        if (source.startsWith('(?!', i)) {
          push('(?!', 'negative lookahead', 'a negative lookahead — what follows must NOT match here', 'group');
          depth++;
          i += 3;
          continue;
        }
        if (source.startsWith('(?<=', i)) {
          push('(?<=', 'lookbehind', 'a positive lookbehind — what precedes must match here, but is not consumed', 'group');
          depth++;
          i += 4;
          continue;
        }
        if (source.startsWith('(?<!', i)) {
          push('(?<!', 'negative lookbehind', 'a negative lookbehind — what precedes must NOT match here', 'group');
          depth++;
          i += 4;
          continue;
        }
        if (source.startsWith('(?:', i)) {
          push('(?:', 'group', 'a group that is NOT captured — it bundles the pattern without remembering the match', 'group');
          depth++;
          i += 3;
          continue;
        }
        // Named capture group (?<name>...)
        const named = /^\(\?<([A-Za-z_$][\w$]*)>/.exec(source.slice(i));
        if (named) {
          captureCount++;
          push(named[0], `group “${named[1]}”`, `starts capture group “${named[1]}” (also numbered ${ordinal(captureCount)}) — remembers the text it matches`, 'capture');
          depth++;
          i += named[0].length;
          continue;
        }
        // Plain capture group
        captureCount++;
        push('(', `capture ${ordinal(captureCount)}`, `starts the ${ordinal(captureCount)} capture group — remembers the text it matches so you can reuse it`, 'capture');
        depth++;
        i++;
        continue;
      }
      if (ch === ')') {
        depth = Math.max(0, depth - 1);
        push(')', 'end group', 'closes the group', 'group');
        i++;
        continue;
      }

      // ---- Alternation ----------------------------------------------
      if (ch === '|') {
        push('|', 'or', 'OR — matches the pattern on either side', 'alt');
        i++;
        continue;
      }

      // ---- Character class [...] ------------------------------------
      if (ch === '[') {
        const cls = readCharClass(source, i);
        if (cls) {
          push(cls.src, cls.label, cls.desc, 'class');
          i += cls.src.length;
          // A class can be immediately quantified.
          i = maybeQuantifier(source, i, segments, depth);
          continue;
        }
      }

      // ---- Escapes ---------------------------------------------------
      if (ch === '\\') {
        const nx = source[i + 1];
        // Backreference by number \1..\9
        if (/[1-9]/.test(nx)) {
          push('\\' + nx, 'backreference', `matches the same text that capture group ${ordinal(Number(nx))} captured earlier`, 'backref');
          i += 2;
          i = maybeQuantifier(source, i, segments, depth);
          continue;
        }
        // Named backreference \k<name>
        const kback = /^\\k<([A-Za-z_$][\w$]*)>/.exec(source.slice(i));
        if (kback) {
          push(kback[0], 'backreference', `matches the same text that group “${kback[1]}” captured earlier`, 'backref');
          i += kback[0].length;
          i = maybeQuantifier(source, i, segments, depth);
          continue;
        }
        // Named class shortcuts \d \w \s (and boundaries \b \B)
        if (NAMED_CLASS[nx]) {
          const info = NAMED_CLASS[nx];
          const kind = nx === 'b' || nx === 'B' ? 'anchor' : 'class';
          push('\\' + nx, info.label, `matches ${info.desc}`, kind);
          i += 2;
          if (kind === 'class') i = maybeQuantifier(source, i, segments, depth);
          continue;
        }
        // Whitespace escapes
        if (ESCAPED[nx]) {
          const info = ESCAPED[nx];
          push('\\' + nx, info.label, `matches ${info.desc}`, 'literal');
          i += 2;
          i = maybeQuantifier(source, i, segments, depth);
          continue;
        }
        // Unicode \uXXXX or \u{...}
        const uni = /^\\u(?:\{[0-9a-fA-F]+\}|[0-9a-fA-F]{4})/.exec(source.slice(i));
        if (uni) {
          push(uni[0], 'unicode', `matches a specific Unicode code point (${uni[0]})`, 'literal');
          i += uni[0].length;
          i = maybeQuantifier(source, i, segments, depth);
          continue;
        }
        // Unicode property \p{...} / \P{...}
        const prop = /^\\[pP]\{[^}]+\}/.exec(source.slice(i));
        if (prop) {
          push(prop[0], 'unicode property', `matches characters with the Unicode property ${prop[0].slice(3, -1)} (needs the u flag)`, 'class');
          i += prop[0].length;
          i = maybeQuantifier(source, i, segments, depth);
          continue;
        }
        // Escaped literal (a metacharacter treated as itself)
        if (nx !== undefined) {
          push('\\' + nx, 'literal', `matches ${humanChar(nx)} exactly (the backslash makes it literal)`, 'literal');
          i += 2;
          i = maybeQuantifier(source, i, segments, depth);
          continue;
        }
      }

      // ---- Dot -------------------------------------------------------
      if (ch === '.') {
        push('.', 'any character', 'matches any single character (except a newline, unless the s flag is set)', 'class');
        i++;
        i = maybeQuantifier(source, i, segments, depth);
        continue;
      }

      // ---- Bare quantifier following nothing valid? Treat as literal -
      if (ch === '*' || ch === '+' || ch === '?') {
        // A quantifier here has no preceding atom captured on its own line;
        // maybeQuantifier attaches to the previous atom, so if we reach here
        // standalone it means the atom already consumed it. Fall through to
        // literal only as a defensive default.
        push(ch, 'literal', `matches ${humanChar(ch)}`, 'literal');
        i++;
        continue;
      }

      // ---- Literal run ----------------------------------------------
      // Consume a run of plain literal characters up to the next metachar,
      // but stop before a char that a quantifier would bind to on its own.
      let start = i;
      while (i < n && !isMeta(source[i])) {
        // If the NEXT char is a quantifier, the current char must stand alone
        // so the quantifier binds to just that character.
        const next = source[i + 1];
        if (next === '*' || next === '+' || next === '?' || next === '{') {
          // emit everything before this char as a run, then this single char
          if (i > start) {
            const run = source.slice(start, i);
            push(run, 'text', `matches the exact text “${run}”`, 'literal');
          }
          const single = source[i];
          push(single, 'text', `matches ${humanChar(single)} exactly`, 'literal');
          i++;
          i = maybeQuantifier(source, i, segments, depth);
          // Hand control back to the outer loop so the char now at `i`
          // (which may be a metacharacter like ) or [ ) is dispatched
          // to its proper handler rather than swallowed as a literal.
          start = i;
          break;
        }
        i++;
      }
      if (i > start) {
        const run = source.slice(start, i);
        if (run.length === 1) {
          push(run, 'text', `matches ${humanChar(run)} exactly`, 'literal');
        } else {
          push(run, 'text', `matches the exact text “${run}”`, 'literal');
        }
      } else if (i < n && !isMeta(source[i])) {
        // Safety valve: a non-meta char we somehow didn't consume — treat
        // literally so the walk always advances.
        push(source[i], 'literal', `matches ${humanChar(source[i])}`, 'literal');
        i++;
      } else if (i < n) {
        // GUARANTEED PROGRESS. We reach here only for a metacharacter that no
        // handler above consumed — always the sign of a malformed pattern in
        // this position, e.g. an unterminated "[", a lone "{", or a stray "}".
        // Reading it as a plain literal keeps the walk finite: this function
        // runs on every keystroke and must never hang.
        push(source[i], 'literal', `an unmatched “${source[i]}” — read here as a literal character`, 'literal');
        i++;
      }
    }
  } catch (e) {
    return { segments, captureCount, error: String(e && e.message ? e.message : e) };
  }

  return { segments, captureCount, error: null };
}

const META = new Set(['^', '$', '(', ')', '[', ']', '|', '\\', '.', '*', '+', '?', '{', '}']);
function isMeta(ch) {
  return META.has(ch);
}

// Read a [...] character class starting at index i. Returns null if malformed.
function readCharClass(source, i) {
  let j = i + 1;
  let negated = false;
  if (source[j] === '^') {
    negated = true;
    j++;
  }
  // ] as first char is literal
  if (source[j] === ']') j++;
  while (j < source.length && source[j] !== ']') {
    if (source[j] === '\\') j += 2;
    else j++;
  }
  if (source[j] !== ']') return null; // unterminated
  const src = source.slice(i, j + 1);
  const inner = source.slice(i + 1 + (negated ? 1 : 0), j);
  const desc = describeClassInner(inner, negated);
  const label = negated ? 'none of these' : 'one of these';
  return { src, label, desc };
}

function describeClassInner(inner, negated) {
  const parts = [];
  let k = 0;
  while (k < inner.length) {
    const c = inner[k];
    // range like a-z
    if (inner[k + 1] === '-' && inner[k + 2] && inner[k + 2] !== ']') {
      const a = c;
      const b = inner[k + 2];
      parts.push(`${a}–${b}`);
      k += 3;
      continue;
    }
    if (c === '\\') {
      const nx = inner[k + 1];
      if (NAMED_CLASS[nx]) parts.push(NAMED_CLASS[nx].label);
      else if (ESCAPED[nx]) parts.push(ESCAPED[nx].label);
      else parts.push(nx);
      k += 2;
      continue;
    }
    parts.push(c === ' ' ? 'a space' : c);
    k++;
  }
  const list = parts.join(', ');
  return negated
    ? `matches any single character that is NOT one of: ${list}`
    : `matches any single character from this set: ${list}`;
}

// If a quantifier follows position i, emit a segment for it and return the
// new index; otherwise return i unchanged.
function maybeQuantifier(source, i, segments, depth) {
  const ch = source[i];
  const push = (src, label, desc) =>
    segments.push({ src, label, desc, kind: 'quantifier', depth });

  const lazyOrNot = (base, greedy) =>
    greedy
      ? base
      : `${base}, but as few as possible (lazy — the trailing ? makes it non-greedy)`;

  if (ch === '*') {
    const lazy = source[i + 1] === '?';
    push(lazy ? '*?' : '*', lazy ? 'zero or more (lazy)' : 'zero or more',
      lazyOrNot('repeats the item before it zero or more times', !lazy));
    return i + (lazy ? 2 : 1);
  }
  if (ch === '+') {
    const lazy = source[i + 1] === '?';
    push(lazy ? '+?' : '+', lazy ? 'one or more (lazy)' : 'one or more',
      lazyOrNot('repeats the item before it one or more times', !lazy));
    return i + (lazy ? 2 : 1);
  }
  if (ch === '?') {
    const lazy = source[i + 1] === '?';
    push(lazy ? '??' : '?', lazy ? 'optional (lazy)' : 'optional',
      lazy
        ? 'makes the item before it optional (zero or one), preferring zero'
        : 'makes the item before it optional — zero or one time');
    return i + (lazy ? 2 : 1);
  }
  if (ch === '{') {
    // {n} {n,} {n,m}
    const m = /^\{(\d+)(,(\d*)?)?\}/.exec(source.slice(i));
    if (m) {
      const lazy = source[i + m[0].length] === '?';
      const nnum = m[1];
      let desc;
      let label;
      if (m[2] === undefined) {
        desc = `repeats the item before it exactly ${nnum} time${nnum === '1' ? '' : 's'}`;
        label = `exactly ${nnum}×`;
      } else if (m[3] === '' || m[3] === undefined) {
        desc = `repeats the item before it ${nnum} or more times`;
        label = `${nnum} or more`;
      } else {
        desc = `repeats the item before it between ${nnum} and ${m[3]} times`;
        label = `${nnum}–${m[3]}×`;
      }
      if (lazy) desc += ', but as few as possible (lazy)';
      push(m[0] + (lazy ? '?' : ''), lazy ? label + ' (lazy)' : label, desc);
      return i + m[0].length + (lazy ? 1 : 0);
    }
  }
  return i;
}

/**
 * A compact one-line summary of the whole pattern, assembled from segments.
 * @param {Segment[]} segments
 * @returns {string}
 */
export function summarize(segments) {
  if (!segments.length) return 'An empty pattern — it matches an empty string at every position.';
  const anchored =
    segments[0].kind === 'anchor' && segments[0].src === '^';
  const endAnchored = segments.some((s) => s.src === '$');
  const bits = [];
  if (anchored) bits.push('from the start of the text');
  const meaningful = segments.filter((s) => s.kind !== 'anchor').slice(0, 3);
  if (meaningful.length) {
    bits.push(
      'it reads ' + meaningful.map((s) => s.label).join(', then ')
    );
  }
  if (endAnchored) bits.push('all the way to the end');
  return 'Reading left to right' + (bits.length ? ': ' + bits.join('; ') : '') + '.';
}
