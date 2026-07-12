// patternsmith — flag descriptions

export const FLAG_INFO = {
  g: { name: 'global', desc: 'Find all matches, not just the first one.' },
  i: { name: 'ignore case', desc: 'Match letters regardless of upper- or lower-case.' },
  m: { name: 'multiline', desc: 'Let ^ and $ match at the start and end of every line, not just the whole string.' },
  s: { name: 'dotall', desc: 'Let the dot ( . ) also match newline characters.' },
  u: { name: 'unicode', desc: 'Treat the pattern as a sequence of Unicode code points (enables \\u{…} and \\p{…}).' },
  y: { name: 'sticky', desc: 'Match only starting exactly at the lastIndex position.' },
  d: { name: 'indices', desc: 'Record the start and end position of every capture group.' },
};

export const ALL_FLAGS = ['g', 'i', 'm', 's', 'u'];

/**
 * Human-readable list of the active flags.
 * @param {string} flags
 * @returns {{ flag: string, name: string, desc: string }[]}
 */
export function describeFlags(flags) {
  return [...flags]
    .filter((f) => FLAG_INFO[f])
    .map((f) => ({ flag: f, ...FLAG_INFO[f] }));
}
