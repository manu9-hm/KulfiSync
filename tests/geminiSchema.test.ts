import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { Type } from '@google/genai';
import { WebSocket } from 'ws';
import { createKulfiServer } from '../src/server/createKulfiServer.ts';
import {
  COUPLE_GAME_RESPONSE_SCHEMA,
  buildCoupleGamePrompt,
  validateAndNormalizeGeminiDeck,
} from '../src/server/roomLogic.ts';

function makeValidKnowMePayload(optionCount = 4, questionCount = 5): string {
  return JSON.stringify({
    questions: Array.from({ length: questionCount }, (_, idx) => ({
      prompt: `  Question ${idx + 1} for tonight?  `,
      options: Array.from({ length: optionCount }, (_, optIdx) => `  Choice ${optIdx + 1}  `),
    })),
  });
}

function makeValidWouldYouRatherPayload(optionCount = 2, questionCount = 5): string {
  return JSON.stringify({
    questions: Array.from({ length: questionCount }, (_, idx) => ({
      prompt: `Dilemma ${idx + 1}?`,
      options: Array.from({ length: optionCount }, (_, optIdx) => `Path ${optIdx + 1}`),
    })),
  });
}

describe('Gemini Couple Game Schema & Payload Validation', () => {
  it('defines a strict structured JSON schema for questions and options', () => {
    assert.equal(COUPLE_GAME_RESPONSE_SCHEMA.type, Type.OBJECT);
    assert.deepEqual(COUPLE_GAME_RESPONSE_SCHEMA.required, ['questions']);
    const questionsProp = COUPLE_GAME_RESPONSE_SCHEMA.properties?.questions;
    assert.equal(questionsProp?.type, Type.ARRAY);
    assert.equal(questionsProp?.items?.type, Type.OBJECT);
    assert.deepEqual(questionsProp?.items?.required, ['prompt', 'options']);
  });

  it('builds prompts tailored to mode, mood tag, and partner names', () => {
    const prompt = buildCoupleGamePrompt('would_you_rather', 'Cozy & Nostalgic', [
      'Aarav',
      'Maya',
    ]);
    assert.match(prompt, /Would You Rather/);
    assert.match(prompt, /Cozy & Nostalgic/);
    assert.match(prompt, /Aarav and Maya/);
  });

  it('validates and normalizes a valid 5-card How Well Do You Know Me deck', () => {
    const deck = validateAndNormalizeGeminiDeck(makeValidKnowMePayload(4, 5), 'know_me', 1700000000);
    assert.equal(deck.length, 5);
    assert.equal(deck[0].prompt, 'Question 1 for tonight?');
    assert.equal(deck[0].options.length, 4);
    assert.equal(deck[0].options[0], 'Choice 1');
    assert.equal(new Set(deck.map((q) => q.id)).size, 5);
  });

  it('validates a 5-card Would You Rather deck and trims extra options', () => {
    const deck = validateAndNormalizeGeminiDeck(
      makeValidWouldYouRatherPayload(3, 6),
      'would_you_rather',
      1700000000
    );
    assert.equal(deck.length, 5);
    for (const card of deck) {
      assert.equal(card.options.length, 2);
    }
  });

  it('rejects malformed JSON, missing questions, incomplete decks, and wrong option counts', () => {
    assert.throws(
      () => validateAndNormalizeGeminiDeck('', 'know_me'),
      /empty response/
    );
    assert.throws(
      () => validateAndNormalizeGeminiDeck('{not valid json', 'know_me'),
      /malformed JSON/
    );
    assert.throws(
      () => validateAndNormalizeGeminiDeck(JSON.stringify({ cards: [] }), 'know_me'),
      /missing a valid "questions" array/
    );
    assert.throws(
      () => validateAndNormalizeGeminiDeck(makeValidKnowMePayload(4, 4), 'know_me'),
      /complete 5-question know_me deck/
    );
    assert.throws(
      () => validateAndNormalizeGeminiDeck(makeValidKnowMePayload(2, 5), 'know_me'),
      /complete 5-question know_me deck with 4 options/
    );
    assert.throws(
      () =>
        validateAndNormalizeGeminiDeck(
          makeValidWouldYouRatherPayload(1, 5),
          'would_you_rather'
        ),
      /complete 5-question would_you_rather deck with 2 options/
    );
  });
});

describe('POST /api/rooms/:code/couple-game/generate Integration', () => {
  it('generates, validates, persists, and broadcasts a couple game deck over WebSocket', async () => {
    const kulfi = createKulfiServer({
      deckTextGenerator: async () => makeValidKnowMePayload(4, 5),
    });
    await new Promise<void>((resolve) => kulfi.server.listen(0, '127.0.0.1', resolve));
    const { port } = kulfi.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const createRes = await fetch(`${baseUrl}/api/rooms`, { method: 'POST' });
      const { code } = (await createRes.json()) as { code: string };

      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const states: Array<{ coupleGameGenerating: boolean; hasGame: boolean }> = [];

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          ws.send(
            JSON.stringify({
              type: 'room:join',
              code,
              partnerId: 'p1',
              name: 'Aarav',
            })
          );
        });
        ws.on('message', (buf) => {
          const msg = JSON.parse(buf.toString()) as {
            type: string;
            state?: { coupleGameGenerating: boolean; coupleGame: unknown };
          };
          if (msg.type === 'room:joined') {
            resolve();
          } else if (msg.type === 'room:state' && msg.state) {
            states.push({
              coupleGameGenerating: msg.state.coupleGameGenerating,
              hasGame: Boolean(msg.state.coupleGame),
            });
          }
        });
        ws.on('error', reject);
      });

      const genRes = await fetch(`${baseUrl}/api/rooms/${code}/couple-game/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'know_me',
          moodTag: 'Deep & Romantic',
          partnerId: 'p1',
        }),
      });
      assert.equal(genRes.status, 200);
      const genData = (await genRes.json()) as {
        ok: boolean;
        game: { moodTag: string; questions: Array<{ options: string[] }> };
      };
      assert.equal(genData.ok, true);
      assert.equal(genData.game.moodTag, 'Deep & Romantic');
      assert.equal(genData.game.questions.length, 5);
      assert.equal(genData.game.questions[0].options.length, 4);

      await new Promise((r) => setTimeout(r, 40));
      assert.ok(states.some((s) => s.coupleGameGenerating === true));
      assert.ok(states.some((s) => s.coupleGameGenerating === false && s.hasGame === true));

      ws.close();
    } finally {
      await kulfi.close();
    }
  });

  it('recovers cleanly with 502 and resets coupleGameGenerating when Gemini returns invalid schema JSON', async () => {
    const kulfi = createKulfiServer({
      deckTextGenerator: async () => JSON.stringify({ questions: [{ prompt: 'Only 1', options: ['A'] }] }),
    });
    await new Promise<void>((resolve) => kulfi.server.listen(0, '127.0.0.1', resolve));
    const { port } = kulfi.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const createRes = await fetch(`${baseUrl}/api/rooms`, { method: 'POST' });
      const { code } = (await createRes.json()) as { code: string };

      const genRes = await fetch(`${baseUrl}/api/rooms/${code}/couple-game/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'know_me', moodTag: 'Playful' }),
      });

      assert.equal(genRes.status, 502);
      const errJson = (await genRes.json()) as { error: string };
      assert.match(errJson.error, /complete 5-question know_me deck/);
      assert.equal(kulfi.rooms.get(code)?.coupleGameGenerating, false);
      assert.equal(kulfi.rooms.get(code)?.coupleGame, null);
    } finally {
      await kulfi.close();
    }
  });

  it('returns 503 when Gemini API key is missing and 404 for unknown rooms', async () => {
    const kulfi = createKulfiServer({ geminiApiKey: '' });
    await new Promise<void>((resolve) => kulfi.server.listen(0, '127.0.0.1', resolve));
    const { port } = kulfi.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const notFoundRes = await fetch(`${baseUrl}/api/rooms/ZZZZ99/couple-game/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'know_me' }),
      });
      assert.equal(notFoundRes.status, 404);

      const createRes = await fetch(`${baseUrl}/api/rooms`, { method: 'POST' });
      const { code } = (await createRes.json()) as { code: string };

      const missingKeyRes = await fetch(`${baseUrl}/api/rooms/${code}/couple-game/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'know_me' }),
      });
      assert.equal(missingKeyRes.status, 503);
    } finally {
      await kulfi.close();
    }
  });
});
