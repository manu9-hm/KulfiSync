import crypto from 'node:crypto';
import http from 'node:http';
import { GoogleGenAI } from '@google/genai';
import express, { type Express } from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  ActivityCategory,
  CanvasStroke,
  ClientMessage,
  CoupleGameMode,
  NudgeEvent,
  Partner,
  ServerMessage,
} from '../types/room.ts';
import {
  COUPLE_GAME_RESPONSE_SCHEMA,
  ROOM_IDLE_TTL_MS,
  buildCoupleGamePrompt,
  createInitialRoom,
  evictStaleDisconnectedPartner,
  generateUniqueRoomCode,
  normalizeCode,
  sanitizeCoupleGame,
  sanitizeRoomForPartner,
  validateAndNormalizeGeminiDeck,
  type ClientSession,
  type ServerRoom,
} from './roomLogic.ts';

export type DeckTextGenerator = (params: {
  mode: CoupleGameMode;
  moodTag: string;
  partnerNames: string[];
}) => Promise<string>;

export interface KulfiServerOptions {
  geminiApiKey?: string;
  deckTextGenerator?: DeckTextGenerator;
  heartbeatIntervalMs?: number;
}

export interface KulfiServerInstance {
  app: Express;
  server: http.Server;
  wss: WebSocketServer;
  rooms: Map<string, ServerRoom>;
  sessions: Map<WebSocket, ClientSession>;
  close: () => Promise<void>;
}

function sendJson(ws: WebSocket, payload: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function createKulfiServer(options: KulfiServerOptions = {}): KulfiServerInstance {
  const rooms = new Map<string, ServerRoom>();
  const sessions = new Map<WebSocket, ClientSession>();

  function broadcastRoomState(room: ServerRoom): void {
    for (const [partnerId, ws] of room.sockets.entries()) {
      sendJson(ws, {
        type: 'room:state',
        state: sanitizeRoomForPartner(room, partnerId),
      });
    }
  }

  function broadcastEvent(room: ServerRoom, payload: ServerMessage): void {
    for (const ws of room.sockets.values()) {
      sendJson(ws, payload);
    }
  }

  function handleJoinRoom(
    ws: WebSocket,
    codeRaw: string,
    partnerIdRaw: string,
    nameRaw: string
  ): void {
    const code = normalizeCode(codeRaw);
    const partnerId = partnerIdRaw.trim();
    const cleanName = nameRaw.trim().slice(0, 32) || 'Partner';

    if (code.length !== 6) {
      sendJson(ws, {
        type: 'room:error',
        errorCode: 'INVALID_CODE',
        message: 'Invite codes are exactly 6 characters.',
      });
      return;
    }

    const room = rooms.get(code);
    if (!room) {
      sendJson(ws, {
        type: 'room:error',
        errorCode: 'ROOM_NOT_FOUND',
        message: `Room ${code} was not found. Double-check the code or create a new room.`,
      });
      return;
    }

    const now = Date.now();
    room.lastActivityAt = now;

    // Clean up previous session if this socket was already bound elsewhere
    const existingSession = sessions.get(ws);
    if (existingSession && existingSession.roomCode !== code) {
      const oldRoom = rooms.get(existingSession.roomCode);
      if (oldRoom && oldRoom.sockets.get(existingSession.partnerId) === ws) {
        oldRoom.sockets.delete(existingSession.partnerId);
        const oldPartner = oldRoom.partners.find((p) => p.id === existingSession.partnerId);
        if (oldPartner) {
          oldPartner.connected = false;
          oldPartner.lastSeenAt = now;
        }
        broadcastRoomState(oldRoom);
      }
    }

    let partner = room.partners.find((p) => p.id === partnerId);
    if (!partner) {
      evictStaleDisconnectedPartner(room, now);
      if (room.partners.length >= 2) {
        sendJson(ws, {
          type: 'room:error',
          errorCode: 'ROOM_FULL',
          message: `Room ${code} already has 2 partners connected.`,
        });
        return;
      }

      partner = {
        id: partnerId,
        name: cleanName,
        connected: true,
        isTypingNote: false,
        joinedAt: now,
        lastSeenAt: now,
      };
      room.partners.push(partner);
    } else {
      partner.name = cleanName;
      partner.connected = true;
      partner.lastSeenAt = now;
    }

    room.sockets.set(partner.id, ws);
    sessions.set(ws, { roomCode: code, partnerId: partner.id });

    sendJson(ws, {
      type: 'room:joined',
      partnerId: partner.id,
      state: sanitizeRoomForPartner(room, partner.id),
    });

    for (const [otherId, otherWs] of room.sockets.entries()) {
      if (otherId !== partner.id) {
        sendJson(otherWs, {
          type: 'room:state',
          state: sanitizeRoomForPartner(room, otherId),
        });
      }
    }
  }

  function handleClientMessage(ws: WebSocket, msg: ClientMessage): void {
    if (msg.type === 'ping') {
      sendJson(ws, { type: 'pong' });
      return;
    }

    if (msg.type === 'room:join') {
      handleJoinRoom(ws, msg.code, msg.partnerId, msg.name);
      return;
    }

    const session = sessions.get(ws);
    if (!session) {
      sendJson(ws, {
        type: 'room:error',
        errorCode: 'ROOM_NOT_FOUND',
        message: 'You are not connected to an active room.',
      });
      return;
    }

    const room = rooms.get(session.roomCode);
    if (!room) {
      sendJson(ws, {
        type: 'room:error',
        errorCode: 'ROOM_NOT_FOUND',
        message: 'This room has expired or closed.',
      });
      return;
    }

    const partner = room.partners.find((p) => p.id === session.partnerId);
    if (!partner) return;

    const now = Date.now();
    room.lastActivityAt = now;
    partner.lastSeenAt = now;

    switch (msg.type) {
      case 'room:leave': {
        room.sockets.delete(session.partnerId);
        room.partners = room.partners.filter((p) => p.id !== session.partnerId);
        sessions.delete(ws);
        broadcastRoomState(room);
        break;
      }

      case 'partner:rename': {
        const nextName = msg.name.trim().slice(0, 32);
        if (nextName) {
          partner.name = nextName;
          broadcastRoomState(room);
        }
        break;
      }

      case 'activity:vote': {
        const activity = room.activities.find((a) => a.id === msg.activityId);
        if (!activity) return;

        if (msg.vote === null) {
          delete activity.votes[partner.id];
        } else if (msg.vote === 'yes' || msg.vote === 'no') {
          activity.votes[partner.id] = msg.vote;
        }

        const yesCount = room.partners.filter(
          (p) => activity.votes[p.id] === 'yes'
        ).length;

        broadcastRoomState(room);

        if (room.partners.length === 2 && yesCount === 2 && msg.vote === 'yes') {
          broadcastEvent(room, {
            type: 'match:celebrate',
            activityId: activity.id,
            title: activity.title,
          });
        }
        break;
      }

      case 'activity:add': {
        const id = msg.id.trim();
        const title = msg.title.trim().slice(0, 80);
        const description = msg.description.trim().slice(0, 200);
        const duration = msg.duration.trim().slice(0, 24) || '45 min';
        const validCategories: ActivityCategory[] = ['cozy', 'culinary', 'out', 'playful'];
        const category: ActivityCategory = validCategories.includes(msg.category)
          ? msg.category
          : 'cozy';

        if (!id || !title) return;
        if (room.activities.some((a) => a.id === id)) return;

        room.activities.unshift({
          id,
          title,
          category,
          duration,
          description: description || 'Custom idea added for tonight.',
          addedByPartnerId: partner.id,
          votes: { [partner.id]: 'yes' },
          completed: false,
        });
        broadcastRoomState(room);
        break;
      }

      case 'activity:toggle_complete': {
        const activity = room.activities.find((a) => a.id === msg.activityId);
        if (!activity) return;
        activity.completed = !activity.completed;
        broadcastRoomState(room);
        break;
      }

      case 'activity:remove': {
        const exists = room.activities.some((a) => a.id === msg.activityId);
        if (!exists) return;
        room.activities = room.activities.filter((a) => a.id !== msg.activityId);
        broadcastRoomState(room);
        break;
      }

      case 'deck:next': {
        room.questionRound = {
          cardIndex: (room.questionRound.cardIndex + 1) % room.deck.length,
          answers: {},
          revealed: false,
        };
        broadcastRoomState(room);
        break;
      }

      case 'deck:prev': {
        room.questionRound = {
          cardIndex:
            (room.questionRound.cardIndex - 1 + room.deck.length) % room.deck.length,
          answers: {},
          revealed: false,
        };
        broadcastRoomState(room);
        break;
      }

      case 'deck:shuffle': {
        const currentId = room.deck[room.questionRound.cardIndex]?.id;
        const shuffled = [...room.deck];
        for (let i = shuffled.length - 1; i > 0; i -= 1) {
          const j = crypto.randomInt(0, i + 1);
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        if (shuffled[0]?.id === currentId && shuffled.length > 1) {
          [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
        }
        room.deck = shuffled;
        room.questionRound = {
          cardIndex: 0,
          answers: {},
          revealed: false,
        };
        broadcastRoomState(room);
        break;
      }

      case 'deck:answer': {
        const cleanText = msg.text.trim().slice(0, 400);
        if (!cleanText) return;
        room.questionRound.answers[partner.id] = cleanText;
        const bothAnswered =
          room.partners.length >= 2 &&
          room.partners.every((p) => Boolean(room.questionRound.answers[p.id]));
        if (bothAnswered) {
          room.questionRound.revealed = true;
        }
        broadcastRoomState(room);
        break;
      }

      case 'deck:reveal': {
        if (Object.keys(room.questionRound.answers).length > 0) {
          room.questionRound.revealed = true;
          broadcastRoomState(room);
        }
        break;
      }

      case 'vibe:update': {
        if (typeof msg.energy === 'number' && msg.energy >= 1 && msg.energy <= 5) {
          room.vibe.energy = Math.round(msg.energy);
        }
        if (typeof msg.craving === 'string' && msg.craving.trim()) {
          room.vibe.craving = msg.craving.trim().slice(0, 40);
        }
        if (typeof msg.soundtrack === 'string' && msg.soundtrack.trim()) {
          room.vibe.soundtrack = msg.soundtrack.trim().slice(0, 40);
        }
        room.vibe.updatedByName = partner.name;
        room.vibe.updatedAt = now;
        broadcastRoomState(room);
        break;
      }

      case 'nudge:send': {
        const cleanMessage = msg.message.trim().slice(0, 80);
        if (!cleanMessage) return;
        const nudge: NudgeEvent = {
          fromId: partner.id,
          fromName: partner.name,
          message: cleanMessage,
          at: now,
        };
        room.lastNudge = nudge;
        broadcastRoomState(room);
        broadcastEvent(room, { type: 'nudge:received', nudge });
        break;
      }

      case 'note:add': {
        const id = msg.id.trim();
        const text = msg.text.trim().slice(0, 320);
        if (!id || !text) return;
        if (room.notes.some((n) => n.id === id)) return;

        room.notes.unshift({
          id,
          authorId: partner.id,
          authorName: partner.name,
          text,
          createdAt: now,
        });
        if (room.notes.length > 50) {
          room.notes = room.notes.slice(0, 50);
        }
        partner.isTypingNote = false;
        broadcastRoomState(room);
        break;
      }

      case 'note:typing': {
        const nextTyping = Boolean(msg.isTyping);
        if (partner.isTypingNote !== nextTyping) {
          partner.isTypingNote = nextTyping;
          broadcastRoomState(room);
        }
        break;
      }

      case 'canvas:stroke_live': {
        const stroke = msg.stroke;
        if (!stroke || !stroke.id || !Array.isArray(stroke.points)) return;
        const sanitizedStroke: CanvasStroke = {
          id: stroke.id,
          authorId: partner.id,
          authorName: partner.name,
          color: typeof stroke.color === 'string' ? stroke.color.slice(0, 24) : '#F4F1EC',
          size: typeof stroke.size === 'number' ? Math.max(2, Math.min(24, stroke.size)) : 4,
          points: stroke.points
            .slice(0, 2000)
            .filter((pt) => typeof pt?.x === 'number' && typeof pt?.y === 'number'),
          createdAt: stroke.createdAt || now,
        };
        for (const [otherId, otherWs] of room.sockets.entries()) {
          if (otherId !== partner.id) {
            sendJson(otherWs, { type: 'canvas:live_stroke', stroke: sanitizedStroke });
          }
        }
        break;
      }

      case 'canvas:stroke_commit': {
        const stroke = msg.stroke;
        if (!stroke || !stroke.id || !Array.isArray(stroke.points) || stroke.points.length === 0) {
          return;
        }
        if (room.canvasStrokes.some((s) => s.id === stroke.id)) return;

        const committed: CanvasStroke = {
          id: stroke.id,
          authorId: partner.id,
          authorName: partner.name,
          color: typeof stroke.color === 'string' ? stroke.color.slice(0, 24) : '#F4F1EC',
          size: typeof stroke.size === 'number' ? Math.max(2, Math.min(24, stroke.size)) : 4,
          points: stroke.points
            .slice(0, 4000)
            .filter((pt) => typeof pt?.x === 'number' && typeof pt?.y === 'number'),
          createdAt: stroke.createdAt || now,
        };
        if (committed.points.length === 0) return;

        room.canvasStrokes.push(committed);
        if (room.canvasStrokes.length > 400) {
          room.canvasStrokes = room.canvasStrokes.slice(-400);
        }
        broadcastRoomState(room);
        break;
      }

      case 'canvas:undo': {
        for (let i = room.canvasStrokes.length - 1; i >= 0; i -= 1) {
          if (room.canvasStrokes[i]?.authorId === partner.id) {
            room.canvasStrokes.splice(i, 1);
            broadcastRoomState(room);
            break;
          }
        }
        break;
      }

      case 'canvas:clear': {
        room.canvasStrokes = [];
        broadcastRoomState(room);
        break;
      }

      case 'canvas:load_snapshot': {
        if (!Array.isArray(msg.strokes)) return;
        room.canvasStrokes = msg.strokes
          .slice(0, 200)
          .map((s, idx) => ({
            id: `restored-${now.toString(36)}-${idx}`,
            authorId: partner.id,
            authorName: partner.name,
            color: typeof s.color === 'string' ? s.color.slice(0, 24) : '#F4F1EC',
            size: typeof s.size === 'number' ? Math.max(2, Math.min(24, s.size)) : 4,
            points: Array.isArray(s.points)
              ? s.points
                  .slice(0, 500)
                  .filter((pt) => typeof pt?.x === 'number' && typeof pt?.y === 'number')
              : [],
            createdAt: now,
          }))
          .filter((s) => s.points.length > 0);
        broadcastRoomState(room);
        break;
      }

      case 'game:answer': {
        const game = room.coupleGame;
        if (!game) return;
        const question = game.questions.find((q) => q.id === msg.questionId);
        if (!question) return;
        if (
          typeof msg.optionIndex !== 'number' ||
          msg.optionIndex < 0 ||
          msg.optionIndex >= question.options.length
        ) {
          return;
        }
        if (!game.answers[question.id]) {
          game.answers[question.id] = {};
        }
        game.answers[question.id][partner.id] = Math.floor(msg.optionIndex);

        const bothAnswered =
          room.partners.length >= 2 &&
          room.partners.every((p) => game.answers[question.id]?.[p.id] !== undefined);
        if (bothAnswered) {
          game.revealedQuestions[question.id] = true;
        }
        broadcastRoomState(room);
        break;
      }

      case 'game:next': {
        const game = room.coupleGame;
        if (!game || game.questions.length === 0) return;
        game.currentIndex = Math.min(game.currentIndex + 1, game.questions.length - 1);
        broadcastRoomState(room);
        break;
      }

      case 'game:prev': {
        const game = room.coupleGame;
        if (!game || game.questions.length === 0) return;
        game.currentIndex = Math.max(game.currentIndex - 1, 0);
        broadcastRoomState(room);
        break;
      }

      case 'game:jump': {
        const game = room.coupleGame;
        if (!game || game.questions.length === 0) return;
        if (
          typeof msg.index === 'number' &&
          msg.index >= 0 &&
          msg.index < game.questions.length
        ) {
          game.currentIndex = Math.floor(msg.index);
          broadcastRoomState(room);
        }
        break;
      }

      case 'game:reveal': {
        const game = room.coupleGame;
        if (!game) return;
        const answersForQ = game.answers[msg.questionId];
        if (answersForQ && Object.keys(answersForQ).length > 0) {
          game.revealedQuestions[msg.questionId] = true;
          broadcastRoomState(room);
        }
        break;
      }

      case 'game:reset': {
        room.coupleGame = null;
        broadcastRoomState(room);
        break;
      }
    }
  }

  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, activeRooms: rooms.size });
  });

  app.post('/api/rooms', (_req, res) => {
    const code = generateUniqueRoomCode(rooms);
    const room = createInitialRoom(code);
    rooms.set(code, room);
    res.status(201).json({ code });
  });

  app.post('/api/rooms/restore', (req, res) => {
    const body = (req.body || {}) as {
      code?: string;
      lastVibe?: { energy?: number; craving?: string; soundtrack?: string };
    };
    const code = normalizeCode(body.code || '');
    if (code.length !== 6) {
      res.status(400).json({ error: 'Invite codes must be 6 characters.' });
      return;
    }
    if (rooms.has(code)) {
      res.json({ code, restored: false });
      return;
    }
    const room = createInitialRoom(code);
    if (body.lastVibe) {
      if (
        typeof body.lastVibe.energy === 'number' &&
        body.lastVibe.energy >= 1 &&
        body.lastVibe.energy <= 5
      ) {
        room.vibe.energy = Math.round(body.lastVibe.energy);
      }
      if (typeof body.lastVibe.craving === 'string' && body.lastVibe.craving.trim()) {
        room.vibe.craving = body.lastVibe.craving.trim().slice(0, 40);
      }
      if (typeof body.lastVibe.soundtrack === 'string' && body.lastVibe.soundtrack.trim()) {
        room.vibe.soundtrack = body.lastVibe.soundtrack.trim().slice(0, 40);
      }
    }
    rooms.set(code, room);
    res.status(201).json({ code, restored: true });
  });

  app.get('/api/rooms/:code', (req, res) => {
    const code = normalizeCode(req.params.code || '');
    const partnerId =
      typeof req.query.partnerId === 'string' ? req.query.partnerId.trim() : '';

    if (code.length !== 6) {
      res.status(400).json({
        exists: false,
        code,
        partnerCount: 0,
        isFull: false,
        canReconnect: false,
        error: 'Invite codes must be 6 characters.',
      });
      return;
    }

    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({
        exists: false,
        code,
        partnerCount: 0,
        isFull: false,
        canReconnect: false,
        error: `Room ${code} does not exist.`,
      });
      return;
    }

    evictStaleDisconnectedPartner(room);
    const canReconnect = Boolean(
      partnerId && room.partners.some((p) => p.id === partnerId)
    );
    const isFull = room.partners.length >= 2 && !canReconnect;

    res.json({
      exists: true,
      code,
      partnerCount: room.partners.length,
      isFull,
      canReconnect,
    });
  });

  app.post('/api/rooms/:code/couple-game/generate', async (req, res) => {
    const code = normalizeCode(req.params.code || '');
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ error: `Room ${code} was not found.` });
      return;
    }

    const body = (req.body || {}) as {
      mode?: string;
      moodTag?: string;
      partnerId?: string;
    };

    const mode: CoupleGameMode =
      body.mode === 'would_you_rather' ? 'would_you_rather' : 'know_me';
    const moodTag =
      typeof body.moodTag === 'string' && body.moodTag.trim()
        ? body.moodTag.trim().slice(0, 40)
        : 'Playful';
    const partnerId =
      typeof body.partnerId === 'string' ? body.partnerId.trim() : '';

    const apiKey = options.geminiApiKey ?? process.env.GEMINI_API_KEY;
    if (!options.deckTextGenerator && (!apiKey || apiKey === 'MY_GEMINI_API_KEY')) {
      res.status(503).json({
        error:
          'Gemini API key is not configured on the server. Please set GEMINI_API_KEY in Settings > Secrets.',
      });
      return;
    }

    const requester = room.partners.find((p) => p.id === partnerId);
    const partnerNames = room.partners.map((p) => p.name).filter(Boolean);

    room.coupleGameGenerating = true;
    room.lastActivityAt = Date.now();
    broadcastRoomState(room);

    try {
      let responseText = '';
      if (options.deckTextGenerator) {
        responseText = await options.deckTextGenerator({
          mode,
          moodTag,
          partnerNames,
        });
      } else {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const prompt = buildCoupleGamePrompt(mode, moodTag, partnerNames);
        const requestPayload = {
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            systemInstruction:
              'You create warm, witty, emotionally resonant date-night card games for couples in an intimate evening setting. Avoid clichés and repetitive phrasing. Always return strictly valid JSON matching the schema.',
            responseMimeType: 'application/json',
            responseSchema: COUPLE_GAME_RESPONSE_SCHEMA,
          },
        };

        let lastErr: unknown = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const response = await ai.models.generateContent(requestPayload);
            responseText = (response.text ?? '').trim();
            if (responseText) break;
          } catch (err) {
            lastErr = err;
            const msg = err instanceof Error ? err.message : String(err);
            const isTransient =
              msg.includes('503') ||
              msg.includes('UNAVAILABLE') ||
              msg.includes('429') ||
              msg.includes('RESOURCE_EXHAUSTED');
            if (!isTransient || attempt === 2) {
              throw err;
            }
            await new Promise((r) => setTimeout(r, 600 * Math.pow(2, attempt)));
          }
        }

        if (!responseText && lastErr) {
          throw lastErr;
        }
      }

      const cleanedQuestions = validateAndNormalizeGeminiDeck(responseText, mode);
      const roundId = `round-${Date.now().toString(36)}`;
      room.coupleGame = {
        id: roundId,
        mode,
        moodTag,
        generatedAt: Date.now(),
        generatedByName: requester?.name || 'Partner',
        questions: cleanedQuestions,
        currentIndex: 0,
        answers: {},
        revealedQuestions: {},
      };
      room.coupleGameGenerating = false;
      room.lastActivityAt = Date.now();
      broadcastRoomState(room);

      res.json({
        ok: true,
        game: sanitizeCoupleGame(room, partnerId),
      });
    } catch (err) {
      room.coupleGameGenerating = false;
      broadcastRoomState(room);
      let friendlyMessage = 'Failed to generate AI couple game deck. Please try again.';
      const rawMessage = err instanceof Error ? err.message : String(err);
      try {
        const parsedErr = JSON.parse(rawMessage) as {
          error?: { message?: string; code?: number };
        };
        if (parsedErr?.error?.message) {
          friendlyMessage = parsedErr.error.message;
        }
      } catch {
        if (rawMessage && rawMessage.length < 240) {
          friendlyMessage = rawMessage;
        }
      }
      if (!options.deckTextGenerator) {
        console.error('Gemini couple game error:', err);
      }
      res.status(502).json({ error: friendlyMessage });
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const aliveSockets = new WeakMap<WebSocket, boolean>();

  wss.on('connection', (ws) => {
    aliveSockets.set(ws, true);

    ws.on('pong', () => {
      aliveSockets.set(ws, true);
    });

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString()) as ClientMessage;
        if (!parsed || typeof parsed.type !== 'string') return;
        handleClientMessage(ws, parsed);
      } catch {
        sendJson(ws, {
          type: 'room:error',
          errorCode: 'INVALID_PAYLOAD',
          message: 'Malformed message received.',
        });
      }
    });

    ws.on('close', () => {
      const session = sessions.get(ws);
      sessions.delete(ws);
      if (!session) return;

      const room = rooms.get(session.roomCode);
      if (!room) return;

      if (room.sockets.get(session.partnerId) === ws) {
        room.sockets.delete(session.partnerId);
        const partner = room.partners.find((p) => p.id === session.partnerId);
        if (partner) {
          partner.connected = false;
          partner.isTypingNote = false;
          partner.lastSeenAt = Date.now();
        }
        broadcastRoomState(room);
      }
    });
  });

  const heartbeatInterval = setInterval(() => {
    for (const ws of wss.clients) {
      if (aliveSockets.get(ws) === false) {
        ws.terminate();
        continue;
      }
      aliveSockets.set(ws, false);
      ws.ping();
    }

    const now = Date.now();
    for (const [code, room] of rooms.entries()) {
      if (room.sockets.size === 0 && now - room.lastActivityAt > ROOM_IDLE_TTL_MS) {
        rooms.delete(code);
      }
    }
  }, options.heartbeatIntervalMs ?? 25000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  const close = async (): Promise<void> => {
    clearInterval(heartbeatInterval);
    for (const client of wss.clients) {
      client.terminate();
    }
    await new Promise<void>((resolve) => {
      wss.close(() => {
        server.close(() => resolve());
      });
    });
  };

  return {
    app,
    server,
    wss,
    rooms,
    sessions,
    close,
  };
}
