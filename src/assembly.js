function shuffle(values, random) {
  const result = values.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
      throw new RangeError('The random source must return a number in [0, 1).');
    }
    const j = Math.floor(sample * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Random labels and a separately shuffled installation sequence. */
export class AssemblyChallenge {
  constructor(ids, { random = Math.random } = {}) {
    if (!Array.isArray(ids)) throw new TypeError('Assembly ids must be an array.');
    this.ids = ids.map(String);
    if (new Set(this.ids).size !== this.ids.length) throw new Error('Assembly ids must be unique.');
    if (typeof random !== 'function') throw new TypeError('random must be a function.');
    this.random = random;
    this.round = 0;
    this.installed = new Set();
    this.queue = [];
    this._numbers = new Map();
    this._known = new Set(this.ids);
    this._cursor = 0;
    this.active = false;
  }

  begin() {
    // Labels and order are both shuffled. The next requested label is therefore
    // not simply 1,2,3, and the same physical piece changes number each round.
    const labels = shuffle(this.ids, this.random);
    const queue = shuffle(this.ids, this.random);
    this._numbers = new Map(labels.map((id, index) => [id, index + 1]));
    this.queue = queue;
    this.installed.clear();
    this._cursor = 0;
    this.round += 1;
    this.active = true;
    return this.snapshot();
  }

  get total() { return this.ids.length; }
  get nextId() { return this.active ? this.queue[this._cursor] ?? null : null; }
  get expectedNumber() { return this.nextId === null ? null : this.numberFor(this.nextId); }
  get complete() { return this.active && this._cursor === this.ids.length; }
  get remaining() { return this.ids.length - this.installed.size; }
  get progress() {
    return this.ids.length ? this.installed.size / this.ids.length : this.active ? 1 : 0;
  }

  numberFor(id) { return this._numbers.get(String(id)) ?? null; }

  idForNumber(number) {
    const target = Number(number);
    for (const [id, label] of this._numbers) if (label === target) return id;
    return null;
  }

  attempt(value) {
    const id = String(value);
    const expected = this.expectedNumber;
    const base = { id, number: this.numberFor(id), expected };
    let reason = null;
    if (!this.active) reason = 'not-started';
    else if (!this._known.has(id)) reason = 'unknown-part';
    else if (this.installed.has(id)) reason = 'already-installed';
    else if (this.complete) reason = 'complete';
    else if (id !== this.nextId) reason = 'wrong-order';
    if (reason) {
      return {
        ...base, ok: false, reason, complete: this.complete,
        nextId: this.nextId, nextNumber: this.expectedNumber,
        remaining: this.remaining, progress: this.progress,
      };
    }
    this.installed.add(id);
    this._cursor += 1;
    return {
      ...base, ok: true, reason: 'installed', complete: this.complete,
      nextId: this.nextId, nextNumber: this.expectedNumber,
      remaining: this.remaining, progress: this.progress,
    };
  }

  installNext() {
    if (this.nextId === null) {
      return {
        ok: false, complete: this.complete, reason: this.active ? 'complete' : 'not-started',
        id: null, number: null, expected: null, nextId: null, nextNumber: null,
        remaining: this.remaining, progress: this.progress,
      };
    }
    return this.attempt(this.nextId);
  }

  reset() {
    this.installed.clear();
    this.queue = [];
    this._numbers.clear();
    this._cursor = 0;
    this.active = false;
    return this.snapshot();
  }

  snapshot({ includeOrder = false } = {}) {
    const snapshot = {
      active: this.active, complete: this.complete, round: this.round,
      total: this.total, installed: this.installed.size, remaining: this.remaining,
      progress: this.progress, nextId: this.nextId, expectedNumber: this.expectedNumber,
    };
    if (includeOrder) {
      snapshot.queue = this.queue.slice();
      snapshot.labels = Object.fromEntries(this._numbers);
      snapshot.installedIds = [...this.installed];
    }
    return snapshot;
  }
}
