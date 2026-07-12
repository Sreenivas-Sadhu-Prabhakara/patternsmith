// patternsmith — client app wiring
//
// This module is bundled by Astro into a hashed /_astro/*.js file served from
// the site's own origin, so it satisfies `script-src 'self'` with no inline
// script and no external requests. Everything below runs 100% on the device.

import { explainPattern, summarize } from '../lib/explain.js';
import { describeFlags, ALL_FLAGS } from '../lib/flags.js';
import { createMatcher, looksExplosive, LIMITS } from '../lib/safematch.js';
import { INTENTS, BLOCKS, escapeLiteral } from '../lib/intents.js';
import { CHEATSHEET } from '../lib/cheatsheet.js';

// Worker-backed matcher (created in init once we know the base URL). All
// matching runs off the main thread with a terminate-on-timeout kill switch,
// so a catastrophic pattern can never hang the page.
let matcher = null;
// Monotonic tokens so out-of-order async results are ignored (only the latest
// render is applied).
let renderToken = 0;
let replaceToken = 0;

// ---- tiny DOM helpers -------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
};
const escapeHtml = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- central state ----------------------------------------------------------
const state = {
  mode: 'explain', // 'explain' | 'build'
  pattern: '',
  flags: 'g',
  sample: '',
  replace: '',
  showReplace: false,
};

// Elements resolved on init.
const dom = {};

// ---- URL hash (shareable, zero-network) -------------------------------------
function encodeState() {
  const p = new URLSearchParams();
  if (state.pattern) p.set('p', state.pattern);
  if (state.flags) p.set('f', state.flags);
  if (state.sample) p.set('s', state.sample);
  if (state.mode !== 'explain') p.set('m', state.mode);
  return p.toString();
}
function writeHash() {
  const enc = encodeState();
  const target = enc ? '#' + enc : '#';
  if (('#' + window.location.hash.slice(1)) !== target) {
    history.replaceState(null, '', target);
  }
}
function readHash() {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return false;
  const p = new URLSearchParams(raw);
  if (p.has('p')) state.pattern = p.get('p');
  if (p.has('f')) state.flags = (p.get('f') || '').replace(/[^gimsuyd]/g, '');
  if (p.has('s')) state.sample = p.get('s');
  if (p.has('m') && (p.get('m') === 'build' || p.get('m') === 'explain')) state.mode = p.get('m');
  return true;
}

// ---- compile the pattern safely --------------------------------------------
function compile() {
  if (!state.pattern) return { re: null, error: null };
  try {
    const re = new RegExp(state.pattern, state.flags);
    return { re, error: null };
  } catch (e) {
    return { re: null, error: String(e && e.message ? e.message : e) };
  }
}

// ---- render: the token breakdown -------------------------------------------
function renderExplain() {
  const host = dom.breakdown;
  host.replaceChildren();

  if (!state.pattern) {
    host.append(el('p', { class: 'muted', text: 'Type or paste a pattern above to see it read back in plain English, token by token.' }));
    dom.summary.textContent = '';
    return;
  }

  const { segments, error } = explainPattern(state.pattern);

  dom.summary.textContent = error ? '' : summarize(segments);

  if (!segments.length) {
    host.append(el('p', { class: 'muted', text: 'An empty pattern.' }));
    return;
  }

  const strip = el('div', { class: 'chips' });
  segments.forEach((seg) => {
    const chip = el('div', {
      class: `chip kind-${seg.kind}`,
      tabindex: '0',
      role: 'listitem',
      'aria-label': `${seg.label}: ${seg.desc}`,
    }, [
      el('code', { class: 'chip-src', text: seg.src || '∅' }),
      el('span', { class: 'chip-label', text: seg.label }),
    ]);
    chip.addEventListener('mouseenter', () => showSegDesc(seg));
    chip.addEventListener('focus', () => showSegDesc(seg));
    strip.append(chip);
  });
  strip.setAttribute('role', 'list');
  host.append(strip);

  // Detailed list under the strip.
  const list = el('dl', { class: 'seg-list' });
  segments.forEach((seg) => {
    list.append(
      el('dt', { class: `seg-term kind-${seg.kind}` }, [
        el('code', { text: seg.src || '∅' }),
        el('span', { class: 'seg-kind', text: seg.kind }),
      ]),
      el('dd', { class: 'seg-desc' }, [
        el('strong', { text: seg.label + '. ' }),
        document.createTextNode(seg.desc),
      ]),
    );
  });
  host.append(list);
}

function showSegDesc(seg) {
  dom.segHint.textContent = `${seg.label} — ${seg.desc}`;
}

// ---- render: flags ----------------------------------------------------------
function renderFlags() {
  dom.flagRow.replaceChildren();
  ALL_FLAGS.forEach((f) => {
    const on = state.flags.includes(f);
    const btn = el('button', {
      type: 'button',
      class: 'flag' + (on ? ' on' : ''),
      'aria-pressed': String(on),
      title: f,
      onclick: () => toggleFlag(f),
    }, [
      el('span', { class: 'flag-letter', text: f }),
    ]);
    dom.flagRow.append(btn);
  });

  const active = describeFlags(state.flags);
  dom.flagDesc.replaceChildren();
  if (active.length) {
    active.forEach((a) =>
      dom.flagDesc.append(el('li', {}, [el('code', { text: a.flag }), ' — ' + a.desc])));
  } else {
    dom.flagDesc.append(el('li', { class: 'muted', text: 'No flags set.' }));
  }
}

function toggleFlag(f) {
  if (state.flags.includes(f)) state.flags = state.flags.replace(f, '');
  else state.flags = [...ALL_FLAGS].filter((x) => state.flags.includes(x) || x === f).join('');
  update();
}

// ---- render: the live tester -----------------------------------------------
async function renderTester() {
  const { re, error } = compile();
  const token = ++renderToken;

  // Error / status line.
  dom.compileStatus.className = 'compile-status';
  if (error) {
    dom.compileStatus.classList.add('err');
    dom.compileStatus.textContent = 'Invalid pattern: ' + error;
    dom.highlight.replaceChildren(document.createTextNode(state.sample));
    dom.matchCount.textContent = '—';
    dom.groupsTable.replaceChildren();
    renderReplace(false);
    return;
  }
  if (!state.pattern) {
    dom.compileStatus.textContent = '';
    dom.highlight.replaceChildren(document.createTextNode(state.sample));
    dom.matchCount.textContent = '0';
    dom.groupsTable.replaceChildren();
    renderReplace(false);
    return;
  }

  // Proactive heads-up for classic nested-quantifier shapes.
  if (looksExplosive(state.pattern)) {
    dom.compileStatus.classList.add('warn');
    dom.compileStatus.textContent =
      'Heads up: this pattern has a nested-quantifier shape that can backtrack catastrophically. Matching runs off-thread with a hard time cap, so the page stays responsive either way.';
  } else {
    dom.compileStatus.classList.add('ok');
    dom.compileStatus.textContent = 'Valid pattern.';
  }

  // Show a working state while the (possibly slow) worker runs.
  dom.matchCount.textContent = '…';

  const res = await matcher.match(state.pattern, state.flags, state.sample);
  // A newer keystroke already superseded this run — drop the stale result.
  if (token !== renderToken) return;

  if (res.tooSlow) {
    dom.compileStatus.className = 'compile-status warn';
    dom.compileStatus.textContent =
      `Too slow — matching was stopped after ${LIMITS.TIME_BUDGET_MS} ms to keep the page responsive. This pattern backtracks catastrophically on this input; simplify it (a nested quantifier like (a+)+ or (.*x){20} is the usual cause).`;
    dom.highlight.replaceChildren(document.createTextNode(state.sample));
    dom.matchCount.textContent = 'stopped';
    dom.groupsTable.replaceChildren(el('p', { class: 'muted small', text: 'Matching was halted before it could hang the page.' }));
    renderReplace(false);
    return;
  }
  if (res.error) {
    dom.compileStatus.className = 'compile-status err';
    dom.compileStatus.textContent = 'Runtime error: ' + res.error;
  }

  renderHighlight(res.matches);

  let countText = String(res.count);
  if (res.truncatedInput) countText += ` (first ${LIMITS.MAX_INPUT.toLocaleString()} chars)`;
  dom.matchCount.textContent = countText;

  renderGroups(res.matches);
  renderReplace(true);
}

function renderHighlight(matches) {
  const text = state.sample;
  dom.highlight.replaceChildren();
  if (!matches.length) {
    dom.highlight.append(document.createTextNode(text));
    return;
  }
  let cursor = 0;
  const frag = document.createDocumentFragment();
  matches.forEach((m, idx) => {
    // Matches are ordered and non-overlapping; skip any that fall behind the
    // cursor defensively.
    if (m.index < cursor) return;
    if (m.index > cursor) frag.append(document.createTextNode(text.slice(cursor, m.index)));
    const mark = el('mark', {
      class: 'hl hl-' + (idx % 2),
      title: `match ${idx + 1} at index ${m.index}`,
    }, [m.value.length ? m.value : '∅']);
    if (!m.value.length) mark.classList.add('zero');
    frag.append(mark);
    cursor = m.index + m.value.length;
  });
  if (cursor < text.length) frag.append(document.createTextNode(text.slice(cursor)));
  dom.highlight.append(frag);
}

function renderGroups(matches) {
  const host = dom.groupsTable;
  host.replaceChildren();
  const withGroups = matches.filter((m) => (m.groups && m.groups.length) || (m.named && Object.keys(m.named).length));
  if (!matches.length) {
    host.append(el('p', { class: 'muted small', text: 'No matches yet.' }));
    return;
  }
  if (!withGroups.length) {
    host.append(el('p', { class: 'muted small', text: 'This pattern has no capture groups. Wrap part of it in ( ) to capture text.' }));
    return;
  }

  const maxGroups = matches.reduce((mx, m) => Math.max(mx, m.groups ? m.groups.length : 0), 0);
  const table = el('table', { class: 'groups' });
  const thead = el('thead');
  const hr = el('tr', {}, [el('th', { text: '#' }), el('th', { text: 'full match' })]);
  for (let g = 1; g <= maxGroups; g++) hr.append(el('th', { text: 'group ' + g }));
  thead.append(hr);
  table.append(thead);

  const tbody = el('tbody');
  matches.slice(0, 200).forEach((m, i) => {
    const tr = el('tr', {}, [
      el('td', { class: 'num', text: String(i + 1) }),
      el('td', {}, [el('code', { text: m.value === '' ? '∅' : m.value })]),
    ]);
    for (let g = 0; g < maxGroups; g++) {
      const v = m.groups ? m.groups[g] : undefined;
      tr.append(el('td', {}, [
        v === undefined
          ? el('span', { class: 'muted', text: '—' })
          : el('code', { text: v === '' ? '∅' : v }),
      ]));
    }
    tbody.append(tr);
  });
  table.append(tbody);
  host.append(table);

  // Named groups summary.
  const named = matches.find((m) => m.named && Object.keys(m.named).length);
  if (named) {
    const names = Object.keys(named.named);
    host.append(el('p', { class: 'small named-note' }, [
      'Named groups: ',
      ...names.flatMap((nm, idx) => [
        el('code', { text: nm }),
        idx < names.length - 1 ? document.createTextNode(', ') : null,
      ]).filter(Boolean),
    ]));
  }
}

async function renderReplace(canRun) {
  dom.replaceWrap.hidden = !state.showReplace;
  dom.replaceToggle.setAttribute('aria-expanded', String(state.showReplace));
  if (!state.showReplace) return;
  if (!canRun || !state.pattern) {
    dom.replaceOut.textContent = state.sample;
    return;
  }
  const token = ++replaceToken;
  const { output, tooSlow, error } = await matcher.replace(
    state.pattern, state.flags, state.sample, state.replace,
  );
  if (token !== replaceToken) return;
  if (error) { dom.replaceOut.textContent = '(error: ' + error + ')'; return; }
  if (tooSlow) {
    dom.replaceOut.textContent = '(too slow — replacement stopped to keep the page responsive)';
    return;
  }
  dom.replaceOut.textContent = output;
}

// ---- BUILD mode -------------------------------------------------------------
function renderBuild() {
  // Intents palette.
  if (!dom.intentGrid.childElementCount) {
    INTENTS.forEach((it) => {
      const card = el('button', {
        type: 'button',
        class: 'intent',
        onclick: () => applyIntent(it),
        title: it.note,
      }, [
        el('span', { class: 'intent-name', text: it.label }),
        el('code', { class: 'intent-eg', text: it.example }),
      ]);
      dom.intentGrid.append(card);
    });
  }

  // Blocks palette, grouped.
  if (!dom.blockGrid.childElementCount) {
    const groups = {};
    BLOCKS.forEach((b) => { (groups[b.group] = groups[b.group] || []).push(b); });
    Object.entries(groups).forEach(([g, items]) => {
      const section = el('div', { class: 'block-group' }, [
        el('h4', { class: 'block-group-title', text: g }),
      ]);
      const row = el('div', { class: 'block-row' });
      items.forEach((b) => {
        row.append(el('button', {
          type: 'button',
          class: 'block',
          onclick: () => applyBlock(b),
          title: b.note,
        }, [b.label]));
      });
      section.append(row);
      dom.blockGrid.append(section);
    });
  }
}

function narrate(msg) {
  const line = el('li', { class: 'narr-line', text: msg });
  dom.narration.prepend(line);
  while (dom.narration.childElementCount > 12) dom.narration.lastElementChild.remove();
}

function applyIntent(it) {
  state.pattern = it.pattern;
  state.flags = it.flags;
  if (!state.sample.trim() || dom.buildSampleAuto.checked) {
    state.sample = it.sample;
  }
  narrate(`Loaded “${it.label}”. ${it.note}`);
  update();
  flashPatternInput();
}

function applyBlock(b) {
  if (b.id === 'literal') {
    const txt = window.prompt('Exact text to match (it will be escaped for you):', '');
    if (txt == null || txt === '') return;
    const esc = escapeLiteral(txt);
    state.pattern += esc;
    narrate(`Added exact text “${txt}” → ${esc}`);
  } else if (b.id === 'exactly') {
    const n = window.prompt('Repeat the previous item exactly how many times?', '3');
    if (n == null || !/^\d+$/.test(n)) return;
    state.pattern += `{${n}}`;
    narrate(`Added: repeat the previous item exactly ${n} times.`);
  } else if (b.id === 'range') {
    const n = window.prompt('Minimum repeats?', '2');
    if (n == null || !/^\d+$/.test(n)) return;
    const m = window.prompt('Maximum repeats?', '5');
    if (m == null || !/^\d+$/.test(m)) return;
    state.pattern += `{${n},${m}}`;
    narrate(`Added: repeat the previous item between ${n} and ${m} times.`);
  } else {
    state.pattern += b.snippet;
    narrate(`Added ${b.label} — ${b.note}.`);
  }
  update();
  flashPatternInput();
}

function flashPatternInput() {
  dom.pattern.classList.remove('flash');
  // force reflow to restart the animation
  void dom.pattern.offsetWidth;
  dom.pattern.classList.add('flash');
}

// ---- cheatsheet -------------------------------------------------------------
function renderCheatsheet() {
  if (dom.cheatsheet.childElementCount) return;
  CHEATSHEET.forEach((group) => {
    const box = el('div', { class: 'cheat-group' }, [
      el('h4', { class: 'cheat-title', text: group.group }),
    ]);
    const dl = el('dl', { class: 'cheat-rows' });
    group.rows.forEach(([sym, desc]) => {
      dl.append(
        el('dt', {}, [el('code', { text: sym })]),
        el('dd', { text: desc }),
      );
    });
    box.append(dl);
    dom.cheatsheet.append(box);
  });
}

// ---- mode switching ---------------------------------------------------------
function setMode(mode) {
  state.mode = mode;
  dom.tabExplain.setAttribute('aria-selected', String(mode === 'explain'));
  dom.tabBuild.setAttribute('aria-selected', String(mode === 'build'));
  dom.panelExplain.hidden = mode !== 'explain';
  dom.panelBuild.hidden = mode !== 'build';
  if (mode === 'build') renderBuild();
  writeHash();
}

// ---- master update ----------------------------------------------------------
let rafId = 0;
function update() {
  // Reflect state into the inputs (in case a palette action changed them).
  if (dom.pattern.value !== state.pattern) dom.pattern.value = state.pattern;
  if (dom.sample.value !== state.sample) dom.sample.value = state.sample;
  if (dom.flagsInput.value !== state.flags) dom.flagsInput.value = state.flags;

  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    renderFlags();
    renderExplain();
    renderTester();
    writeHash();
  });
}

// ---- init -------------------------------------------------------------------
function workerUrl() {
  // BASE_URL is injected at build time and already includes the trailing slash
  // (e.g. "/patternsmith/"), so the worker resolves correctly under GH Pages.
  const base = import.meta.env.BASE_URL || '/';
  return (base.endsWith('/') ? base : base + '/') + 'matcher.worker.js';
}

function init() {
  matcher = createMatcher(workerUrl());

  Object.assign(dom, {
    tabExplain: $('#tab-explain'),
    tabBuild: $('#tab-build'),
    panelExplain: $('#panel-explain'),
    panelBuild: $('#panel-build'),
    pattern: $('#pattern'),
    flagsInput: $('#flags-input'),
    flagRow: $('#flag-row'),
    flagDesc: $('#flag-desc'),
    sample: $('#sample'),
    highlight: $('#highlight'),
    matchCount: $('#match-count'),
    groupsTable: $('#groups-table'),
    breakdown: $('#breakdown'),
    summary: $('#summary'),
    segHint: $('#seg-hint'),
    compileStatus: $('#compile-status'),
    replaceToggle: $('#replace-toggle'),
    replaceWrap: $('#replace-wrap'),
    replaceInput: $('#replace-input'),
    replaceOut: $('#replace-out'),
    intentGrid: $('#intent-grid'),
    blockGrid: $('#block-grid'),
    narration: $('#narration'),
    buildSampleAuto: $('#build-sample-auto'),
    cheatsheet: $('#cheatsheet'),
    copyPattern: $('#copy-pattern'),
    clearPattern: $('#clear-pattern'),
  });

  // Load from hash or seed a friendly default.
  const hadHash = readHash();
  if (!hadHash && !state.pattern) {
    state.pattern = '(https?)://([\\w.-]+)';
    state.flags = 'gi';
    state.sample = 'Visit https://patternsmith.dev and http://example.com for the demo.';
  }

  // Wire inputs.
  dom.pattern.value = state.pattern;
  dom.flagsInput.value = state.flags;
  dom.sample.value = state.sample;

  dom.pattern.addEventListener('input', () => { state.pattern = dom.pattern.value; update(); });
  dom.sample.addEventListener('input', () => { state.sample = dom.sample.value; update(); });
  dom.flagsInput.addEventListener('input', () => {
    state.flags = dom.flagsInput.value.replace(/[^gimsuyd]/g, '');
    dom.flagsInput.value = state.flags;
    update();
  });

  dom.tabExplain.addEventListener('click', () => setMode('explain'));
  dom.tabBuild.addEventListener('click', () => setMode('build'));

  dom.replaceToggle.addEventListener('click', () => {
    state.showReplace = !state.showReplace;
    // Re-run just the replacement view; a valid pattern enables the preview.
    renderReplace(!!compile().re);
  });
  dom.replaceInput.addEventListener('input', () => {
    state.replace = dom.replaceInput.value;
    renderReplace(!!compile().re);
  });

  dom.copyPattern.addEventListener('click', async () => {
    const text = '/' + state.pattern + '/' + state.flags;
    try {
      await navigator.clipboard.writeText(text);
      flashButton(dom.copyPattern, 'Copied!');
    } catch {
      // Clipboard may be blocked; fall back to selecting the input.
      dom.pattern.focus();
      dom.pattern.select();
      flashButton(dom.copyPattern, 'Select + copy');
    }
  });

  dom.clearPattern.addEventListener('click', () => {
    state.pattern = '';
    state.replace = '';
    dom.replaceInput.value = '';
    update();
    dom.pattern.focus();
  });

  window.addEventListener('hashchange', () => {
    // Only react to external hash changes (e.g. paste a shared link).
    const before = encodeState();
    readHash();
    if (encodeState() !== before) {
      dom.pattern.value = state.pattern;
      dom.sample.value = state.sample;
      dom.flagsInput.value = state.flags;
      setMode(state.mode);
      update();
    }
  });

  renderCheatsheet();
  setMode(state.mode);
  update();
}

function flashButton(btn, label) {
  const prev = btn.dataset.label || btn.textContent;
  btn.dataset.label = prev;
  btn.textContent = label;
  btn.classList.add('done');
  setTimeout(() => {
    btn.textContent = btn.dataset.label;
    btn.classList.remove('done');
  }, 1200);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
