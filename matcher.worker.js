// patternsmith — matching worker
//
// This runs OFF the main thread. A single native RegExp.exec() on a
// catastrophic pattern (e.g. /(a+)+$/) cannot be interrupted from inside the
// same thread — but the main thread CAN terminate this whole worker. So all
// heavy matching happens here, and the page stays responsive no matter what.
//
// It is a plain classic worker script served from our own origin, which
// satisfies the strict CSP (worker-src falls back to script-src 'self'; no
// blob:, no eval, no network). It must be self-contained — no imports.

'use strict';

const MAX_INPUT = 50000;
const MAX_MATCHES = 20000;

function doMatch(pattern, flags, text) {
  const result = {
    kind: 'match',
    matches: [],
    count: 0,
    truncatedInput: false,
    error: null,
  };

  let input = text;
  if (input.length > MAX_INPUT) {
    input = input.slice(0, MAX_INPUT);
    result.truncatedInput = true;
  }

  let re;
  try {
    re = new RegExp(pattern, flags);
  } catch (e) {
    result.error = String(e && e.message ? e.message : e);
    return result;
  }

  const global = re.flags.includes('g');
  const runner = global ? re : new RegExp(re.source, re.flags + 'g');
  runner.lastIndex = 0;

  let m;
  try {
    while ((m = runner.exec(input)) !== null) {
      const named = m.groups ? Object.assign({}, m.groups) : null;
      result.matches.push({
        index: m.index,
        value: m[0],
        groups: m.slice(1),
        named,
      });
      result.count++;
      if (result.count >= MAX_MATCHES) break;
      if (m.index === runner.lastIndex) runner.lastIndex++;
      if (!global) break;
    }
  } catch (e) {
    result.error = String(e && e.message ? e.message : e);
  }
  return result;
}

function doReplace(pattern, flags, text, replacement) {
  let input = text;
  if (input.length > MAX_INPUT) input = input.slice(0, MAX_INPUT);
  try {
    const re = new RegExp(pattern, flags);
    return { kind: 'replace', output: input.replace(re, replacement), error: null };
  } catch (e) {
    return { kind: 'replace', output: '', error: String(e && e.message ? e.message : e) };
  }
}

self.onmessage = function (ev) {
  const msg = ev.data || {};
  let out;
  if (msg.op === 'replace') {
    out = doReplace(msg.pattern, msg.flags, msg.text, msg.replacement);
  } else {
    out = doMatch(msg.pattern, msg.flags, msg.text);
  }
  out.id = msg.id;
  self.postMessage(out);
};
