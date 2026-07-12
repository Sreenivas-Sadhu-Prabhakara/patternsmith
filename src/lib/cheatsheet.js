// patternsmith — compact reference data for the cheatsheet panel

export const CHEATSHEET = [
  {
    group: 'Anchors',
    rows: [
      ['^', 'start of the string (or line, with m)'],
      ['$', 'end of the string (or line, with m)'],
      ['\\b', 'word boundary'],
      ['\\B', 'not a word boundary'],
    ],
  },
  {
    group: 'Character classes',
    rows: [
      ['.', 'any character except newline'],
      ['\\d', 'a digit 0–9'],
      ['\\w', 'word character: letter, digit, _'],
      ['\\s', 'whitespace'],
      ['\\D \\W \\S', 'the opposite of each above'],
      ['[abc]', 'any one of a, b, or c'],
      ['[^abc]', 'anything except a, b, or c'],
      ['[a-z]', 'any letter in the range a–z'],
    ],
  },
  {
    group: 'Quantifiers',
    rows: [
      ['*', 'zero or more'],
      ['+', 'one or more'],
      ['?', 'optional (zero or one)'],
      ['{3}', 'exactly 3'],
      ['{2,}', '2 or more'],
      ['{2,5}', 'between 2 and 5'],
      ['+?  *?', 'lazy — as few as possible'],
    ],
  },
  {
    group: 'Groups & references',
    rows: [
      ['( )', 'capture group'],
      ['(?: )', 'group, not captured'],
      ['(?<name> )', 'named capture group'],
      ['|', 'alternation (OR)'],
      ['\\1', 'backreference to group 1'],
      ['\\k<name>', 'backreference by name'],
    ],
  },
  {
    group: 'Lookaround',
    rows: [
      ['(?= )', 'followed by'],
      ['(?! )', 'not followed by'],
      ['(?<= )', 'preceded by'],
      ['(?<! )', 'not preceded by'],
    ],
  },
  {
    group: 'Escaping',
    rows: [
      ['\\.', 'a literal dot'],
      ['\\\\', 'a literal backslash'],
      ['\\n \\t \\r', 'newline, tab, return'],
      ['\\u{1F600}', 'Unicode code point (u flag)'],
    ],
  },
];
