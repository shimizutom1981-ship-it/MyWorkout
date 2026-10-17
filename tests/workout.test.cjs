const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const bootstrap = 'render();resetTimer();';
assert.ok(script.endsWith(bootstrap), 'Expected application bootstrap');

function app({mode = 'heavy', logs = [], drafts = {}} = {}) {
  // Synthetic records only; this harness never reads a user's browser data.
  const elements = new Map();
  const storage = new Map();
  const ctx = vm.createContext({
    console,
    document: {getElementById: id => elements.get(id)},
    localStorage: {getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v)},
    window: {addEventListener() {}},
    setTimeout() {},
    clearInterval() {},
    setInterval() {return 1;},
  });
  vm.runInContext(script.slice(0, -bootstrap.length), ctx);
  vm.runInContext('render = () => {}; startTimer = () => {}; toast = () => {};', ctx);
  ctx.fixture = {mode, exercises: [{id: 'press', name: 'Test press'}, {id: 'row', name: 'Test row'}], logs, drafts};
  vm.runInContext('state = fixture', ctx);
  return {
    run: code => vm.runInContext(code, ctx),
    state: () => JSON.parse(vm.runInContext('JSON.stringify(state)', ctx)),
    saved: () => JSON.parse(storage.get('myWorkout_v1')),
    inputs(id, weight, reps) {
      elements.set('w_' + id, {value: String(weight)});
      elements.set('r_' + id, {value: String(reps)});
    },
    history(id) {
      const el = {innerHTML: ''};
      elements.set('h_' + id, el);
      vm.runInContext(`renderHistory(${JSON.stringify(id)})`, ctx);
      return el.innerHTML;
    },
  };
}

for (const [mode, weight, reps] of [
  ['heavy', 20, 4], ['heavy', 20, 6], ['heavy', 17.5, 5],
  ['light', 20, 12], ['light', 20, 13], ['light', 17.5, 15],
]) {
  test(`${mode}: selected ${weight} lb × ${reps} survives record and save`, () => {
    const a = app({mode});
    a.run(`useSuggestion('press', ${weight}, ${reps})`);
    a.inputs('press', weight, reps);
    a.run("record('press')");
    assert.deepEqual(a.state().drafts['press_' + mode], {weight, reps});
    assert.deepEqual(a.saved().drafts['press_' + mode], {weight, reps});
    const log = a.state().logs.at(-1);
    assert.equal(log.weight, weight);
    assert.equal(log.reps, reps);
    assert.equal(log.mode, mode);
  });
}

test('manual values remain selected across consecutive records', () => {
  const a = app();
  a.inputs('press', 27.5, 7);
  a.run("record('press'); record('press')");
  assert.deepEqual(a.state().drafts.press_heavy, {weight: 27.5, reps: 7});
  assert.equal(a.state().logs.length, 2);
  assert.ok(a.state().logs.every(log => log.weight === 27.5 && log.reps === 7));
});

test('recording one exercise/mode preserves all other drafts and existing logs', () => {
  const old = {id: 'old', exerciseId: 'row', mode: 'light', weight: 15, reps: 12, time: 1};
  const drafts = {row_heavy: {weight: 30, reps: 6}, press_light: {weight: 15, reps: 12}};
  const a = app({drafts, logs: [old]});
  a.inputs('press', 25, 4);
  a.run("record('press')");
  assert.deepEqual(a.state().drafts.row_heavy, drafts.row_heavy);
  assert.deepEqual(a.state().drafts.press_light, drafts.press_light);
  assert.deepEqual(a.state().logs[0], old);
  a.run("setMode('light')");
  assert.deepEqual(JSON.parse(a.run("JSON.stringify(draftFor(state.exercises[0]))")), drafts.press_light);
  a.run("setMode('heavy')");
  assert.deepEqual(JSON.parse(a.run("JSON.stringify(draftFor(state.exercises[0]))")), {weight: 25, reps: 4});
});

test('invalid record does not add a log or reset the chosen inputs', () => {
  const a = app();
  a.inputs('press', 25, -1);
  a.run("record('press')");
  assert.equal(a.state().logs.length, 0);
  assert.deepEqual(a.state().drafts.press_heavy, {weight: '25', reps: '-1'});
});

test('history shows the newest five records per exercise, across both modes', () => {
  const logs = Array.from({length: 7}, (_, i) => ({
    id: 'press-' + i, exerciseId: 'press', mode: i % 2 ? 'heavy' : 'light', weight: 15 + i, reps: 5, time: i + 1,
  }));
  logs.splice(3, 0, {id: 'other', exerciseId: 'row', mode: 'heavy', weight: 99, reps: 5, time: 999});
  const a = app({logs});
  const output = a.history('press');
  assert.equal((output.match(/class="hist"/g) || []).length, 5);
  assert.deepEqual([...output.matchAll(/editLog\('([^']+)'\)/g)].map(m => m[1]), ['press-6', 'press-5', 'press-4', 'press-3', 'press-2']);
  assert.deepEqual(a.state().logs, logs, 'Rendering must not discard or reorder stored history');
});

for (const count of [0, 1, 3, 5]) {
  test(`history renders ${count} available records without placeholders`, () => {
    const logs = Array.from({length: count}, (_, i) => ({id: '' + i, exerciseId: 'press', mode: 'heavy', weight: 15, reps: 5, time: i}));
    const a = app({logs});
    assert.equal((a.history('press').match(/class="hist"/g) || []).length, count);
  });
}
