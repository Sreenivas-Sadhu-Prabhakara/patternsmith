// patternsmith — catastrophic-backtracking guard
//
// A single native RegExp.exec() on a pathological pattern (e.g. /(a+)+$/
// against "aaaaaaaaaaaaaaaaaaaa!") can spin effectively forever, and JS cannot
// interrupt a synchronous call from within the SAME thread. So the only way to
// truly guarantee the page never hangs is to run matching on a Web Worker and
// let the main thread TERMINATE that worker if it blows its time budget.
//
// That is exactly what `createMatcher()` does:
//   • all matching/replacing happens in public/matcher.worker.js (off-thread),
//   • the main thread arms a wall-clock kill switch per request,
//   • if the worker overruns, we terminate it, report `tooSlow`, and spin up a
//     fresh worker for the next request.
//
// The worker is a plain same-origin classic script, so it satisfies the strict
// CSP (worker-src falls back to script-src 'self'; no blob:, no eval, no net).
//
// `looksExplosive()` is a cheap *proactive* heads-up shown before we even run,
// and `safeMatchAll()`/`safeReplace()` are synchronous fallbacks used when no
// Worker is available (and by tests). The worker path is the real guarantee.

const TIME_BUDGET_MS = 700;
const MAX_INPUT = 50000; // characters of sample text
const MAX_MATCHES = 20000;

/**
 * Heuristic: does this source contain a nested-quantifier shape that is a
 * classic exponential-backtracking risk? e.g. (a+)+  (a*)*  (a+)*  (\d+)+
 * This is only an early warning — it is intentionally conservative and does NOT
 * gate matching, because the worker kill-switch is what actually protects us.
 * @param {string} source
 * @returns {boolean}
 */
export function looksExplosive(source) {
  const nested = /\((?:[^()]*[+*]|[^()]*\{\d+,\}?)[^()]*\)[+*]/;
  const nestedBrace = /\((?:[^()]*[+*])[^()]*\)\{\d+,\}?/;
  return nested.test(source) || nestedBrace.test(source);
}

/**
 * @typedef {Object} MatchResult
 * @property {Array} matches   [{index, value, groups, named}]
 * @property {number} count
 * @property {boolean} tooSlow
 * @property {boolean} truncatedInput
 * @property {string|null} error
 */

/**
 * Create a worker-backed matcher with a hard time cap enforced by terminating
 * the worker. Falls back to synchronous matching if Workers are unavailable.
 * @param {string} workerUrl  base-correct URL to matcher.worker.js
 * @returns {{
 *   match: (pattern:string, flags:string, text:string) => Promise<MatchResult>,
 *   replace: (pattern:string, flags:string, text:string, replacement:string) => Promise<{output:string, tooSlow:boolean, error:string|null}>,
 *   dispose: () => void
 * }}
 */
export function createMatcher(workerUrl) {
  const hasWorker = typeof Worker !== 'undefined' && !!workerUrl;
  let worker = null;
  let seq = 0;

  function spawn() {
    if (!hasWorker) return null;
    try {
      return new Worker(workerUrl);
    } catch {
      return null;
    }
  }

  function ensure() {
    if (!worker) worker = spawn();
    return worker;
  }

  function kill() {
    if (worker) {
      try { worker.terminate(); } catch { /* ignore */ }
      worker = null;
    }
  }

  function request(payload, onTimeoutShape) {
    const w = ensure();
    // No worker available → synchronous fallback (best-effort, may be slower to
    // guard, but the heuristic warning still fires in the UI).
    if (!w) {
      if (payload.op === 'replace') {
        const r = safeReplace(new RegExp(payload.pattern, payload.flags), payload.text, payload.replacement);
        return Promise.resolve(r);
      }
      let re;
      try { re = new RegExp(payload.pattern, payload.flags); }
      catch (e) { return Promise.resolve({ matches: [], count: 0, tooSlow: false, truncatedInput: false, error: String(e.message || e) }); }
      return Promise.resolve(safeMatchAll(re, payload.text));
    }

    const id = ++seq;
    payload.id = id;

    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        kill(); // hard stop — this is what makes a hang impossible
        resolve(onTimeoutShape());
      }, TIME_BUDGET_MS);

      const onMessage = (ev) => {
        const data = ev.data || {};
        if (data.id !== id) return; // stale message from a prior request
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        w.removeEventListener('message', onMessage);
        w.removeEventListener('error', onError);
        resolve(normalize(data));
      };
      const onError = (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(payload.op === 'replace'
          ? { output: '', tooSlow: false, error: String((e && e.message) || 'worker error') }
          : { matches: [], count: 0, tooSlow: false, truncatedInput: false, error: String((e && e.message) || 'worker error') });
      };

      w.addEventListener('message', onMessage);
      w.addEventListener('error', onError);
      w.postMessage(payload);
    });
  }

  function normalize(data) {
    if (data.kind === 'replace') {
      return { output: data.output, tooSlow: false, error: data.error };
    }
    return {
      matches: data.matches || [],
      count: data.count || 0,
      tooSlow: false,
      truncatedInput: !!data.truncatedInput,
      error: data.error || null,
    };
  }

  return {
    match(pattern, flags, text) {
      if (!pattern) {
        return Promise.resolve({ matches: [], count: 0, tooSlow: false, truncatedInput: false, error: null });
      }
      return request(
        { op: 'match', pattern, flags, text },
        () => ({ matches: [], count: 0, tooSlow: true, truncatedInput: false, error: null }),
      );
    },
    replace(pattern, flags, text, replacement) {
      if (!pattern) return Promise.resolve({ output: text, tooSlow: false, error: null });
      return request(
        { op: 'replace', pattern, flags, text, replacement },
        () => ({ output: '', tooSlow: true, error: null }),
      );
    },
    dispose: kill,
  };
}

/**
 * Synchronous fallback matcher (no worker). Time-capped between matches only —
 * cannot interrupt a single runaway exec(), so this is a best-effort path used
 * when Workers are unavailable, and in tests.
 * @param {RegExp} re
 * @param {string} text
 * @returns {MatchResult}
 */
export function safeMatchAll(re, text) {
  const result = { matches: [], count: 0, tooSlow: false, truncatedInput: false, error: null };
  let input = text;
  if (input.length > MAX_INPUT) { input = input.slice(0, MAX_INPUT); result.truncatedInput = true; }

  const global = re.flags.includes('g');
  const runner = global ? re : new RegExp(re.source, re.flags + 'g');
  runner.lastIndex = 0;

  const started = now();
  let m;
  try {
    while ((m = runner.exec(input)) !== null) {
      if (now() - started > TIME_BUDGET_MS) { result.tooSlow = true; break; }
      const named = m.groups ? { ...m.groups } : null;
      result.matches.push({ index: m.index, value: m[0], groups: m.slice(1), named });
      result.count++;
      if (result.count >= MAX_MATCHES) break;
      if (m.index === runner.lastIndex) runner.lastIndex++;
      if (!global) break;
    }
  } catch (e) {
    result.error = String(e && e.message ? e.message : e);
  }
  if (now() - started > TIME_BUDGET_MS) result.tooSlow = true;
  return result;
}

/**
 * Synchronous replacement fallback.
 * @param {RegExp} re
 * @param {string} text
 * @param {string} replacement
 * @returns {{ output: string, tooSlow: boolean, error: string|null }}
 */
export function safeReplace(re, text, replacement) {
  let input = text;
  if (input.length > MAX_INPUT) input = input.slice(0, MAX_INPUT);
  const started = now();
  try {
    const output = input.replace(re, replacement);
    return { output, tooSlow: now() - started > TIME_BUDGET_MS, error: null };
  } catch (e) {
    return { output: '', tooSlow: false, error: String(e && e.message ? e.message : e) };
  }
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export const LIMITS = { TIME_BUDGET_MS, MAX_INPUT, MAX_MATCHES };
