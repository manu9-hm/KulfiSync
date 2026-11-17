import crypto from 'node:crypto';
import { Type, type Schema } from '@google/genai';
import type { WebSocket } from 'ws';
import type {
  CanvasStroke,
  CoupleGameMode,
  CoupleGameQuestion,
  CoupleGameRound,
  DateActivity,
  NudgeEvent,
  Partner,
  QuestionCard,
  RoomState,
} from '../types/room.ts';

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_IDLE_TTL_MS = 30 * 60 * 1000;
export const STALE_PARTNER_MS = 10 * 60 * 1000;

export interface ServerRoom {
  code: string;
  createdAt: number;
  lastActivityAt: number;
  partners: Partner[];
  sockets: Map<string, WebSocket>;
  activities: DateActivity[];
  deck: QuestionCard[];
  questionRound: {
    cardIndex: number;
    answers: Record<string, string>;
    revealed: boolean;
  };
  vibe: RoomState['vibe'];
  notes: RoomState['notes'];
  lastNudge?: NudgeEvent;
  canvasStrokes: CanvasStroke[];
  coupleGame: {
    id: string;
    mode: CoupleGameMode;
    moodTag: string;
    generatedAt: number;
    generatedByName: string;
    questions: CoupleGameQuestion[];
    currentIndex: number;
    answers: Record<string, Record<string, number>>;
    revealedQuestions: Record<string, boolean>;
  } | null;
  coupleGameGenerating: boolean;
}

export interface ClientSession {
  roomCode: string;
  partnerId: string;
}

export const DEFAULT_ACTIVITIES: Omit<DateActivity, 'votes' | 'completed'>[] = [
  {
    id: 'act-kulfi-flight',
    title: 'Late-Night Kulfi & Chai Run',
    category: 'culinary',
    duration: '45 min',
    description:
      'Pick two flavors you have never tried together—pistachio, rose, or saffron—and split them on a slow walk.',
  },
  {
    id: 'act-vinyl-cook',
    title: 'Phones-Off Candlelit Grazing Board',
    category: 'cozy',
    duration: '1 hr',
    description:
      'Put both phones in another room, light two candles, and assemble whatever snacks are in the kitchen.',
  },
  {
    id: 'act-photo-roulette',
    title: 'Camera Roll Time Capsule',
    category: 'playful',
    duration: '30 min',
    description:
      'Scroll back to the exact same month two years ago and share the story behind three forgotten photos.',
  },
  {
    id: 'act-stargaze-drive',
    title: 'Midnight Lookouts & Hot Cocoa',
    category: 'out',
    duration: '1.5 hr',
    description:
      'Drive or walk to the highest quiet view nearby with a thermos and a shared two-song queue.',
  },
  {
    id: 'act-blind-tasting',
    title: 'Three-Drink Blind Taste Test',
    category: 'playful',
    duration: '25 min',
    description:
      'Mix three tiny mystery pours from the pantry and guess every ingredient with eyes closed.',
  },
  {
    id: 'act-fort-cinema',
    title: 'Double-Feature Living Room Matinee',
    category: 'cozy',
    duration: '2 hr',
    description:
      'Build the softest corner in the house and trade picks: one comfort classic and one wild card.',
  },
];

export const DEFAULT_DECK: QuestionCard[] = [
  {
    id: 'q-1',
    category: 'warm',
    prompt: 'What tiny moment from this past week made you feel most cared for?',
  },
  {
    id: 'q-2',
    category: 'playful',
    prompt: 'If we hopped on a midnight train with zero bags, where do you hope it pulls in at sunrise?',
  },
  {
    id: 'q-3',
    category: 'deep',
    prompt: 'What is something new you are quietly curious to try together over the next six months?',
  },
  {
    id: 'q-4',
    category: 'warm',
    prompt: 'Which ordinary routine of ours would you protect no matter how busy life gets?',
  },
  {
    id: 'q-5',
    category: 'playful',
    prompt: 'If tonight had a movie soundtrack title, what would you name it?',
  },
  {
    id: 'q-6',
    category: 'deep',
    prompt: 'When do you feel like the most relaxed, unguarded version of yourself with me?',
  },
  {
    id: 'q-7',
    category: 'warm',
    prompt: 'What is a small habit of mine that always makes you smile even when you pretend not to notice?',
  },
  {
    id: 'q-8',
    category: 'playful',
    prompt: 'Design our dream Sunday morning in three specific details: food, sound, and weather.',
  },
];

export const COUPLE_GAME_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          prompt: {
            type: Type.STRING,
            description: 'The question or dilemma for the couple.',
          },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              'Exactly 2 options for Would You Rather, or 4 options for How Well Do You Know Me.',
          },
        },
        required: ['prompt', 'options'],
      },
    },
  },
  required: ['questions'],
};

export function generateUniqueRoomCode(
  existingRooms: { has(code: string): boolean },
  randomIntFn: (min: number, max: number) => number = crypto.randomInt
): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += CODE_ALPHABET[randomIntFn(0, CODE_ALPHABET.length)];
    }
    if (!existingRooms.has(code)) {
      return code;
    }
  }
  throw new Error('Failed to generate unique room code');
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function createInitialRoom(code: string, now = Date.now()): ServerRoom {
  return {
    code,
    createdAt: now,
    lastActivityAt: now,
    partners: [],
    sockets: new Map(),
    activities: DEFAULT_ACTIVITIES.map((item) => ({
      ...item,
      votes: {},
      completed: false,
    })),
    deck: [...DEFAULT_DECK],
    questionRound: {
      cardIndex: 0,
      answers: {},
      revealed: false,
    },
    vibe: {
      energy: 2,
      craving: 'Pistachio Kulfi',
      soundtrack: 'Rain & Vinyl',
      updatedAt: now,
    },
    notes: [],
    canvasStrokes: [],
    coupleGame: null,
    coupleGameGenerating: false,
  };
}

export function sanitizeCoupleGame(
  room: ServerRoom,
  viewerId: string
): CoupleGameRound | null {
  if (!room.coupleGame) return null;
  const game = room.coupleGame;

  const submittedByQuestion: Record<string, string[]> = {};
  const visibleAnswers: Record<string, Record<string, number>> = {};
  const revealedQuestions: Record<string, boolean> = {};

  for (const question of game.questions) {
    const rawAnswers = game.answers[question.id] || {};
    const submittedIds = Object.keys(rawAnswers);
    submittedByQuestion[question.id] = submittedIds;

    const bothAnswered =
      room.partners.length >= 2 &&
      room.partners.every((p) => rawAnswers[p.id] !== undefined);
    const isRevealed = Boolean(game.revealedQuestions[question.id] || bothAnswered);
    revealedQuestions[question.id] = isRevealed;

    const filtered: Record<string, number> = {};
    for (const [pid, choiceIdx] of Object.entries(rawAnswers)) {
      if (isRevealed || pid === viewerId) {
        filtered[pid] = choiceIdx;
      }
    }
    visibleAnswers[question.id] = filtered;
  }

  return {
    id: game.id,
    mode: game.mode,
    moodTag: game.moodTag,
    generatedAt: game.generatedAt,
    generatedByName: game.generatedByName,
    questions: game.questions,
    currentIndex: game.currentIndex,
    submittedByQuestion,
    answers: visibleAnswers,
    revealedQuestions,
  };
}

export function sanitizeRoomForPartner(room: ServerRoom, viewerId: string): RoomState {
  const submittedIds = Object.keys(room.questionRound.answers);
  const bothAnswered =
    room.partners.length >= 2 &&
    room.partners.every((p) => Boolean(room.questionRound.answers[p.id]));
  const shouldRevealAll = room.questionRound.revealed || bothAnswered;

  const visibleAnswers: Record<string, string> = {};
  for (const [partnerId, text] of Object.entries(room.questionRound.answers)) {
    if (shouldRevealAll || partnerId === viewerId) {
      visibleAnswers[partnerId] = text;
    }
  }

  return {
    code: room.code,
    createdAt: room.createdAt,
    partners: room.partners.map((p) => ({ ...p })),
    activities: room.activities.map((a) => ({
      ...a,
      votes: { ...a.votes },
    })),
    deck: room.deck,
    questionRound: {
      cardIndex: room.questionRound.cardIndex,
      submittedIds,
      answers: visibleAnswers,
      revealed: shouldRevealAll,
    },
    vibe: { ...room.vibe },
    notes: room.notes.map((n) => ({ ...n })),
    lastNudge: room.lastNudge ? { ...room.lastNudge } : undefined,
    canvasStrokes: room.canvasStrokes.map((s) => ({
      ...s,
      points: s.points.map((pt) => ({ ...pt })),
    })),
    coupleGame: sanitizeCoupleGame(room, viewerId),
    coupleGameGenerating: room.coupleGameGenerating,
  };
}

export function evictStaleDisconnectedPartner(room: ServerRoom, now = Date.now()): void {
  if (room.partners.length < 2) return;
  const activeOrRecent = room.partners.filter(
    (p) => p.connected || now - p.lastSeenAt < STALE_PARTNER_MS
  );
  if (activeOrRecent.length < room.partners.length) {
    room.partners = activeOrRecent;
  }
}

export function buildCoupleGamePrompt(
  mode: CoupleGameMode,
  moodTag: string,
  partnerNames: string[]
): string {
  const modeDescription =
    mode === 'would_you_rather'
      ? 'a "Would You Rather" deck where each of the 5 items asks a couple a vivid evening dilemma with exactly 2 concise, contrasting options (options array length 2).'
      : 'a "How Well Do You Know Me?" deck where each of the 5 items poses a personal lifestyle, preference, or memory-style question that both partners answer independently to see if their picks align, with exactly 4 distinct concise choices (options array length 4).';

  const namesContext =
    partnerNames.length >= 2
      ? `The two partners playing tonight are ${partnerNames[0]} and ${partnerNames[1]}.`
      : partnerNames.length === 1
        ? `One partner (${partnerNames[0]}) is starting the deck for their partner.`
        : '';

  return [
    `Generate ${modeDescription}`,
    `Mood tag selected by the couple: "${moodTag}".`,
    namesContext,
    'Return exactly 5 questions. Keep every prompt under 18 words and every option under 8 words so it fits cleanly on mobile cards.',
  ]
    .filter(Boolean)
    .join(' ');
}

export function validateAndNormalizeGeminiDeck(
  rawText: string,
  mode: CoupleGameMode,
  now = Date.now()
): CoupleGameQuestion[] {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('Gemini returned an empty response.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('Gemini returned malformed JSON that did not match the deck schema.');
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as { questions?: unknown }).questions)
  ) {
    throw new Error('Gemini response JSON is missing a valid "questions" array.');
  }

  const rawQuestions = (parsed as { questions: unknown[] }).questions;
  const expectedOptionCount = mode === 'would_you_rather' ? 2 : 4;
  const cleanedQuestions: CoupleGameQuestion[] = [];

  for (let idx = 0; idx < rawQuestions.length && cleanedQuestions.length < 5; idx += 1) {
    const item = rawQuestions[idx];
    if (!item || typeof item !== 'object') continue;

    const record = item as { prompt?: unknown; options?: unknown };
    if (typeof record.prompt !== 'string' || !record.prompt.trim()) continue;
    if (!Array.isArray(record.options)) continue;

    const opts = record.options
      .map((o) => (typeof o === 'string' ? o.trim() : ''))
      .filter(Boolean)
      .slice(0, expectedOptionCount);

    if (opts.length !== expectedOptionCount) {
      continue;
    }

    cleanedQuestions.push({
      id: `cg-${now.toString(36)}-${cleanedQuestions.length + 1}`,
      prompt: record.prompt.trim(),
      options: opts,
    });
  }

  if (cleanedQuestions.length < 5) {
    throw new Error(
      `Could not generate a complete 5-question ${mode} deck with ${expectedOptionCount} options per card.`
    );
  }

  return cleanedQuestions;
}
