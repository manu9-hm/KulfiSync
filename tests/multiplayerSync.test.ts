import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { WebSocket } from 'ws';
import { createKulfiServer } from '../src/server/createKulfiServer.ts';
import {
  STALE_PARTNER_MS,
  createInitialRoom,
  evictStaleDisconnectedPartner,
  sanitizeRoomForPartner,
} from '../src/server/roomLogic.ts';
import type { RoomState, ServerMessage } from '../src/types/room.ts';

class TestWsClient {
  ws: WebSocket;
  messages: ServerMessage[] = [];
  private waiters: Array<{
    predicate: (msg: ServerMessage) => boolean;
    resolve: (msg: ServerMessage) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on('message', (buf) => {
      const msg = JSON.parse(buf.toString()) as ServerMessage;
      this.messages.push(msg);
      for (let i = this.waiters.length - 1; i >= 0; i -= 1) {
        const w = this.waiters[i];
        if (w.predicate(msg)) {
          clearTimeout(w.timer);
          this.waiters.splice(i, 1);
          w.resolve(msg);
        }
      }
    });
  }

  static async connect(url: string): Promise<TestWsClient> {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    return new TestWsClient(ws);
  }

  send(payload: unknown): void {
    this.ws.send(JSON.stringify(payload));
  }

  waitFor(predicate: (msg: ServerMessage) => boolean, timeoutMs = 3000): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for WebSocket message after ${timeoutMs}ms`));
      }, timeoutMs);
      this.waiters.push({ predicate, resolve, reject, timer });
    });
  }

  async close(): Promise<void> {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      this.ws.once('close', () => resolve());
      this.ws.close();
    });
  }
}

describe('Multiplayer Sanitization & Stale Eviction Unit Tests', () => {
  it('hides partner answers from each other until both submit or reveal is forced', () => {
    const room = createInitialRoom('TEST22', 1000);
    room.partners = [
      { id: 'p1', name: 'Aarav', connected: true, isTypingNote: false, joinedAt: 1000, lastSeenAt: 1000 },
      { id: 'p2', name: 'Maya', connected: true, isTypingNote: false, joinedAt: 1000, lastSeenAt: 1000 },
    ];
    room.questionRound.answers = { p1: 'Secret rooftop chai' };

    const viewP1 = sanitizeRoomForPartner(room, 'p1');
    const viewP2 = sanitizeRoomForPartner(room, 'p2');

    assert.deepEqual(viewP1.questionRound.submittedIds, ['p1']);
    assert.equal(viewP1.questionRound.answers.p1, 'Secret rooftop chai');
    assert.equal(viewP1.questionRound.revealed, false);

    // P2 sees that P1 submitted, but cannot peek at the text yet
    assert.deepEqual(viewP2.questionRound.submittedIds, ['p1']);
    assert.equal(viewP2.questionRound.answers.p1, undefined);
    assert.equal(viewP2.questionRound.revealed, false);

    // Once both answer, projection reveals both simultaneously
    room.questionRound.answers.p2 = 'Midnight vinyl listening';
    const revealedP1 = sanitizeRoomForPartner(room, 'p1');
    const revealedP2 = sanitizeRoomForPartner(room, 'p2');
    assert.equal(revealedP1.questionRound.revealed, true);
    assert.equal(revealedP1.questionRound.answers.p2, 'Midnight vinyl listening');
    assert.equal(revealedP2.questionRound.answers.p1, 'Secret rooftop chai');
  });

  it('evicts disconnected partners stale beyond STALE_PARTNER_MS while retaining active/recent partners', () => {
    const now = 2_000_000;
    const room = createInitialRoom('EVCT22', now);
    room.partners = [
      {
        id: 'p-active',
        name: 'Aarav',
        connected: true,
        isTypingNote: false,
        joinedAt: 1000,
        lastSeenAt: now - STALE_PARTNER_MS - 5000,
      },
      {
        id: 'p-stale',
        name: 'OldGuest',
        connected: false,
        isTypingNote: false,
        joinedAt: 1000,
        lastSeenAt: now - STALE_PARTNER_MS - 1,
      },
    ];

    evictStaleDisconnectedPartner(room, now);
    assert.deepEqual(
      room.partners.map((p) => p.id),
      ['p-active']
    );
  });
});

describe('Multiplayer State Sync & Edge Cases Integration Tests', () => {
  it('enforces 2-partner cap, handles dual-socket reconnect race without dropping active socket, and syncs state', async () => {
    const kulfi = createKulfiServer({
      deckTextGenerator: async () =>
        JSON.stringify({
          questions: Array.from({ length: 5 }, (_, i) => ({
            prompt: `Card ${i + 1}`,
            options: ['Yes', 'No'],
          })),
        }),
    });
    await new Promise<void>((resolve) => kulfi.server.listen(0, '127.0.0.1', resolve));
    const { port } = kulfi.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;
    const wsUrl = `ws://127.0.0.1:${port}/ws`;

    try {
      const createRes = await fetch(`${baseUrl}/api/rooms`, { method: 'POST' });
      assert.equal(createRes.status, 201);
      const { code } = (await createRes.json()) as { code: string };

      const p1a = await TestWsClient.connect(wsUrl);
      const p1JoinWait = p1a.waitFor((m) => m.type === 'room:joined');
      p1a.send({ type: 'room:join', code, partnerId: 'p1', name: 'Aarav' });
      await p1JoinWait;

      const p2 = await TestWsClient.connect(wsUrl);
      const p1SeesP2 = p1a.waitFor(
        (m) => m.type === 'room:state' && m.state.partners.length === 2
      );
      const p2JoinWait = p2.waitFor((m) => m.type === 'room:joined');
      p2.send({ type: 'room:join', code, partnerId: 'p2', name: 'Maya' });
      await Promise.all([p1SeesP2, p2JoinWait]);

      // 3rd partner must be rejected with ROOM_FULL
      const p3 = await TestWsClient.connect(wsUrl);
      const p3ErrWait = p3.waitFor((m) => m.type === 'room:error');
      p3.send({ type: 'room:join', code, partnerId: 'p3', name: 'Intruder' });
      const errMsg = await p3ErrWait;
      assert.equal(errMsg.type, 'room:error');
      if (errMsg.type === 'room:error') {
        assert.equal(errMsg.errorCode, 'ROOM_FULL');
      }
      await p3.close();

      // Reconnection race condition: Partner 1 opens new socket p1b BEFORE old socket p1a closes
      const p1b = await TestWsClient.connect(wsUrl);
      const p1bJoinWait = p1b.waitFor((m) => m.type === 'room:joined');
      p1b.send({ type: 'room:join', code, partnerId: 'p1', name: 'Aarav' });
      await p1bJoinWait;

      // Closing stale socket p1a must NOT mark Aarav offline or evict p1b
      await p1a.close();
      await new Promise((r) => setTimeout(r, 30));
      const room = kulfi.rooms.get(code)!;
      const aarav = room.partners.find((p) => p.id === 'p1');
      assert.equal(aarav?.connected, true);
      assert.equal(room.sockets.get('p1')?.readyState, WebSocket.OPEN);

      // Mutual activity vote triggers match:celebrate
      p1b.send({ type: 'activity:vote', activityId: 'act-kulfi-flight', vote: 'yes' });
      const celebrateP1 = p1b.waitFor((m) => m.type === 'match:celebrate');
      const celebrateP2 = p2.waitFor((m) => m.type === 'match:celebrate');
      p2.send({ type: 'activity:vote', activityId: 'act-kulfi-flight', vote: 'yes' });
      const [c1, c2] = await Promise.all([celebrateP1, celebrateP2]);
      assert.equal(c1.type, 'match:celebrate');
      assert.equal(c2.type, 'match:celebrate');

      // Idempotent note:add ignores duplicate note IDs
      const noteWait = p2.waitFor(
        (m) => m.type === 'room:state' && m.state.notes.length === 1
      );
      p1b.send({ type: 'note:add', id: 'note-1', text: 'Bring extra cardamom' });
      p1b.send({ type: 'note:add', id: 'note-1', text: 'Bring extra cardamom' });
      const noteStateMsg = await noteWait;
      assert.equal((noteStateMsg as { state: RoomState }).state.notes.length, 1);

      // Shared Drawing Canvas: live stroke relays to p2, commit syncs, undo only removes caller's stroke, snapshot restore syncs
      const liveStrokeWait = p2.waitFor((m) => m.type === 'canvas:live_stroke');
      p1b.send({
        type: 'canvas:stroke_live',
        stroke: {
          id: 'st-1',
          authorId: 'spoofed',
          authorName: 'Spoof',
          color: '#D94B6A',
          size: 6,
          points: [{ x: 0.1, y: 0.2 }],
          createdAt: Date.now(),
        },
      });
      const liveMsg = await liveStrokeWait;
      if (liveMsg.type === 'canvas:live_stroke') {
        // Server enforces authoritative authorId/authorName
        assert.equal(liveMsg.stroke.authorId, 'p1');
        assert.equal(liveMsg.stroke.authorName, 'Aarav');
      }

      const commit1Wait = p2.waitFor(
        (m) => m.type === 'room:state' && m.state.canvasStrokes.length === 1
      );
      p1b.send({
        type: 'canvas:stroke_commit',
        stroke: {
          id: 'st-1',
          authorId: 'p1',
          authorName: 'Aarav',
          color: '#D94B6A',
          size: 6,
          points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }],
          createdAt: Date.now(),
        },
      });
      await commit1Wait;

      const commit2Wait = p1b.waitFor(
        (m) => m.type === 'room:state' && m.state.canvasStrokes.length === 2
      );
      p2.send({
        type: 'canvas:stroke_commit',
        stroke: {
          id: 'st-2',
          authorId: 'p2',
          authorName: 'Maya',
          color: '#52B788',
          size: 4,
          points: [{ x: 0.6, y: 0.6 }],
          createdAt: Date.now(),
        },
      });
      await commit2Wait;

      // P1 undoes -> removes st-1, keeps st-2 from Maya
      const undoWait = p2.waitFor(
        (m) =>
          m.type === 'room:state' &&
          m.state.canvasStrokes.length === 1 &&
          m.state.canvasStrokes[0].id === 'st-2'
      );
      p1b.send({ type: 'canvas:undo' });
      await undoWait;

      // Load Firestore snapshot onto canvas -> broadcasts restored strokes
      const snapshotWait = p2.waitFor(
        (m) =>
          m.type === 'room:state' &&
          m.state.canvasStrokes.length === 1 &&
          m.state.canvasStrokes[0].color === '#F4B942'
      );
      p1b.send({
        type: 'canvas:load_snapshot',
        strokes: [{ color: '#F4B942', size: 8, points: [{ x: 0.2, y: 0.3 }] }],
      });
      await snapshotWait;

      // Couple game hidden picks & simultaneous reveal
      const genRes = await fetch(`${baseUrl}/api/rooms/${code}/couple-game/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'would_you_rather', moodTag: 'Playful', partnerId: 'p1' }),
      });
      assert.equal(genRes.status, 200);
      const qId = kulfi.rooms.get(code)!.coupleGame!.questions[0].id;

      const p2SeesSubmitOnly = p2.waitFor(
        (m) =>
          m.type === 'room:state' &&
          Boolean(m.state.coupleGame?.submittedByQuestion[qId]?.includes('p1'))
      );
      p1b.send({ type: 'game:answer', questionId: qId, optionIndex: 0 });
      const submitMsg = await p2SeesSubmitOnly;
      if (submitMsg.type === 'room:state') {
        assert.equal(submitMsg.state.coupleGame?.revealedQuestions[qId], false);
        assert.equal(submitMsg.state.coupleGame?.answers[qId]?.p1, undefined);
      }

      const bothRevealedP1 = p1b.waitFor(
        (m) =>
          m.type === 'room:state' && m.state.coupleGame?.revealedQuestions[qId] === true
      );
      p2.send({ type: 'game:answer', questionId: qId, optionIndex: 0 });
      const revealedMsg = await bothRevealedP1;
      if (revealedMsg.type === 'room:state') {
        assert.equal(revealedMsg.state.coupleGame?.answers[qId]?.p1, 0);
        assert.equal(revealedMsg.state.coupleGame?.answers[qId]?.p2, 0);
      }

      // Room restore endpoint rehydrates archived room with lastVibe metadata
      const restoreRes = await fetch(`${baseUrl}/api/rooms/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'ARCH88',
          lastVibe: { energy: 5, craving: 'Mango Gelato', soundtrack: 'Lo-Fi Beats' },
        }),
      });
      assert.equal(restoreRes.status, 201);
      const restoreData = (await restoreRes.json()) as { code: string; restored: boolean };
      assert.equal(restoreData.restored, true);
      assert.equal(kulfi.rooms.get('ARCH88')?.vibe.craving, 'Mango Gelato');

      // Re-restoring active room returns restored: false without overwriting
      const duplicateRestore = await fetch(`${baseUrl}/api/rooms/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'ARCH88' }),
      });
      const dupData = (await duplicateRestore.json()) as { restored: boolean };
      assert.equal(dupData.restored, false);

      await Promise.all([p1b.close(), p2.close()]);
    } finally {
      await kulfi.close();
    }
  });
});
