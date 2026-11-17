import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CODE_ALPHABET,
  generateUniqueRoomCode,
  normalizeCode,
} from '../src/server/roomLogic.ts';

describe('Room Code Generation & Normalization', () => {
  it('generates 6-character codes strictly from the unambiguous alphabet', () => {
    const existing = new Set<string>();
    const ambiguous = ['0', '1', 'I', 'O'];

    for (let i = 0; i < 500; i += 1) {
      const code = generateUniqueRoomCode(existing);
      assert.equal(code.length, 6);
      for (const ch of code) {
        assert.ok(CODE_ALPHABET.includes(ch), `Unexpected char "${ch}" in ${code}`);
        assert.ok(!ambiguous.includes(ch), `Ambiguous char "${ch}" should be excluded`);
      }
      assert.equal(existing.has(code), false);
      existing.add(code);
    }
  });

  it('retries when a candidate code already exists in active rooms', () => {
    const existing = new Set<string>(['AAAAAA']);
    const sequence = [
      0, 0, 0, 0, 0, 0, // Attempt 1 -> AAAAAA (collides)
      1, 2, 3, 4, 5, 6, // Attempt 2 -> BCDEFG (unique)
    ];
    let cursor = 0;

    const code = generateUniqueRoomCode(existing, () => {
      const val = sequence[cursor] ?? 0;
      cursor += 1;
      return val;
    });

    assert.equal(code, 'BCDEFG');
    assert.equal(cursor, 12);
  });

  it('throws if all 100 generation attempts collide', () => {
    const alwaysCollides = {
      has: () => true,
    };
    assert.throws(
      () => generateUniqueRoomCode(alwaysCollides, () => 0),
      /Failed to generate unique room code/
    );
  });

  it('normalizes user-entered codes by trimming, uppercasing, and stripping separators', () => {
    assert.equal(normalizeCode('  k7m-9p2  '), 'K7M9P2');
    assert.equal(normalizeCode('abc 123!'), 'ABC123');
    assert.equal(normalizeCode(''), '');
  });
});
