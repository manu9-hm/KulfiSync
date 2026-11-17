import type { User } from 'firebase/auth';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase.ts';
import { OperationType, handleFirestoreError } from '../lib/firestoreError.ts';
import type {
  CanvasStroke,
  CoupleGameMode,
  CoupleGameRound,
  Partner,
  VibeState,
} from '../types/room.ts';

export interface ArchivedRoom {
  code: string;
  createdByUid: string;
  participantUids: string[];
  partnerNames: string[];
  partnerCount: number;
  lastCraving: string;
  lastSoundtrack: string;
  lastEnergy: number;
  snapshotCount: number;
  gameCount: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface SavedCanvasStrokeCompact {
  color: string;
  size: number;
  points: { x: number; y: number }[];
}

export interface SavedCanvasSnapshot {
  id: string;
  roomCode: string;
  title: string;
  savedByUid: string;
  savedByName: string;
  participantUids: string[];
  strokeCount: number;
  strokes: SavedCanvasStrokeCompact[];
  createdAtMs: number;
}

export interface SavedGameRoundItem {
  prompt: string;
  options: string[];
  picks: { partnerName: string; optionText: string }[];
  matched: boolean;
}

export interface SavedGameHistory {
  id: string;
  roomCode: string;
  mode: CoupleGameMode;
  moodTag: string;
  savedByUid: string;
  savedByName: string;
  participantUids: string[];
  partnerNames: string[];
  matchScore: number;
  totalQuestions: number;
  rounds: SavedGameRoundItem[];
  createdAtMs: number;
}

function toMillis(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number') return val;
  return Date.now();
}

function cleanName(raw: string, fallback = 'Partner'): string {
  const trimmed = raw.trim().slice(0, 32);
  return trimmed || fallback;
}

function compactStrokesForFirestore(strokes: CanvasStroke[]): SavedCanvasStrokeCompact[] {
  return strokes.slice(-200).map((s) => {
    const pts = s.points || [];
    const maxPts = 64;
    let sampled = pts;
    if (pts.length > maxPts) {
      sampled = [];
      const step = (pts.length - 1) / (maxPts - 1);
      for (let i = 0; i < maxPts; i += 1) {
        const idx = Math.round(i * step);
        if (pts[idx]) sampled.push(pts[idx]);
      }
    }
    return {
      color: (s.color || '#F4F1EC').slice(0, 24),
      size: Math.max(2, Math.min(24, Number(s.size) || 4)),
      points: sampled.map((pt) => ({
        x: Number(Number(pt.x).toFixed(4)),
        y: Number(Number(pt.y).toFixed(4)),
      })),
    };
  });
}

async function backfillParticipantAccess(
  roomCode: string,
  ownerUid: string,
  participantUids: string[]
): Promise<void> {
  if (participantUids.length < 2) return;
  const subcollections = ['snapshots', 'gameHistory'] as const;

  for (const sub of subcollections) {
    const colPath = `rooms/${roomCode}/${sub}`;
    try {
      const q = query(
        collection(db, colPath),
        where('participantUids', 'array-contains', ownerUid)
      );
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      let updates = 0;
      snap.forEach((docSnap) => {
        const data = docSnap.data() as { savedByUid?: string; participantUids?: string[] };
        if (
          data.savedByUid === ownerUid &&
          Array.isArray(data.participantUids) &&
          data.participantUids.length < 2
        ) {
          batch.update(docSnap.ref, { participantUids });
          updates += 1;
        }
      });
      if (updates > 0) {
        await batch.commit();
      }
    } catch {
      // Non-critical background sync
    }
  }
}

export async function ensureRoomArchive(
  roomCode: string,
  partners: Partner[],
  vibe: VibeState,
  user: User,
  myDisplayName: string
): Promise<ArchivedRoom> {
  const roomPath = `rooms/${roomCode}`;
  const roomRef = doc(db, 'rooms', roomCode);
  const memberRef = doc(db, 'rooms', roomCode, 'members', user.uid);
  const safeMyName = cleanName(myDisplayName || user.displayName || 'Partner');
  const safeCraving = (vibe.craving || 'Pistachio Kulfi').trim().slice(0, 40) || 'Pistachio Kulfi';
  const safeSoundtrack = (vibe.soundtrack || 'Rain & Vinyl').trim().slice(0, 40) || 'Rain & Vinyl';
  const safeEnergy = Math.max(1, Math.min(5, Math.round(vibe.energy || 2)));

  let snap;
  try {
    snap = await getDoc(roomRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, roomPath);
  }

  if (!snap.exists()) {
    const batch = writeBatch(db);
    batch.set(roomRef, {
      code: roomCode,
      createdByUid: user.uid,
      participantUids: [user.uid],
      partnerNames: [safeMyName],
      partnerCount: 1,
      lastCraving: safeCraving,
      lastSoundtrack: safeSoundtrack,
      lastEnergy: safeEnergy,
      snapshotCount: 0,
      gameCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(memberRef, {
      uid: user.uid,
      roomCode,
      displayName: safeMyName,
      joinedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, roomPath);
    }

    return {
      code: roomCode,
      createdByUid: user.uid,
      participantUids: [user.uid],
      partnerNames: [safeMyName],
      partnerCount: 1,
      lastCraving: safeCraving,
      lastSoundtrack: safeSoundtrack,
      lastEnergy: safeEnergy,
      snapshotCount: 0,
      gameCount: 0,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    };
  }

  const existing = snap.data() as {
    code: string;
    createdByUid: string;
    participantUids: string[];
    partnerNames: string[];
    partnerCount: number;
    lastCraving: string;
    lastSoundtrack: string;
    lastEnergy: number;
    snapshotCount: number;
    gameCount: number;
    createdAt: unknown;
    updatedAt: unknown;
  };

  const uids = Array.isArray(existing.participantUids) ? existing.participantUids : [];
  const namesFromLive = partners
    .map((p) => cleanName(p.name))
    .filter(Boolean)
    .slice(0, 2);

  if (!uids.includes(user.uid) && uids.length < 2) {
    const nextUids = [...uids, user.uid].slice(0, 2);
    const nextNames = Array.from(
      new Set([...(existing.partnerNames || []), safeMyName, ...namesFromLive])
    )
      .map((n) => cleanName(n))
      .slice(0, 2);

    const batch = writeBatch(db);
    batch.update(roomRef, {
      participantUids: nextUids,
      partnerNames: nextNames.length > 0 ? nextNames : [safeMyName],
      partnerCount: nextUids.length,
      updatedAt: serverTimestamp(),
    });
    batch.set(memberRef, {
      uid: user.uid,
      roomCode,
      displayName: safeMyName,
      joinedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, roomPath);
    }

    return {
      ...existing,
      participantUids: nextUids,
      partnerNames: nextNames,
      partnerCount: nextUids.length,
      createdAtMs: toMillis(existing.createdAt),
      updatedAtMs: Date.now(),
    };
  }

  if (uids.includes(user.uid)) {
    const mergedNames = Array.from(
      new Set([...(namesFromLive.length > 0 ? namesFromLive : existing.partnerNames || [safeMyName])])
    )
      .map((n) => cleanName(n))
      .slice(0, 2);

    const batch = writeBatch(db);
    batch.update(roomRef, {
      partnerNames: mergedNames.length > 0 ? mergedNames : [safeMyName],
      lastCraving: safeCraving,
      lastSoundtrack: safeSoundtrack,
      lastEnergy: safeEnergy,
      updatedAt: serverTimestamp(),
    });
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, roomPath);
    }

    if (uids.length === 2) {
      void backfillParticipantAccess(roomCode, user.uid, uids);
    }
  }

  return {
    ...existing,
    createdAtMs: toMillis(existing.createdAt),
    updatedAtMs: toMillis(existing.updatedAt),
  };
}

export async function saveCanvasSnapshotToFirestore(
  roomCode: string,
  title: string,
  strokes: CanvasStroke[],
  partners: Partner[],
  vibe: VibeState,
  user: User,
  myDisplayName: string
): Promise<string> {
  const compactStrokes = compactStrokesForFirestore(strokes);
  if (compactStrokes.length === 0) {
    throw new Error('Draw at least one stroke before saving a snapshot.');
  }

  const archive = await ensureRoomArchive(roomCode, partners, vibe, user, myDisplayName);
  const snapshotId = `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const safeTitle = title.trim().slice(0, 80) || 'Evening Sketch';
  const safeSaver = cleanName(myDisplayName || user.displayName || 'Partner');
  const snapshotPath = `rooms/${roomCode}/snapshots/${snapshotId}`;

  const batch = writeBatch(db);
  batch.set(doc(db, 'rooms', roomCode, 'snapshots', snapshotId), {
    id: snapshotId,
    roomCode,
    title: safeTitle,
    savedByUid: user.uid,
    savedByName: safeSaver,
    participantUids: archive.participantUids,
    strokeCount: compactStrokes.length,
    strokes: compactStrokes,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'rooms', roomCode), {
    snapshotCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, snapshotPath);
  }

  return snapshotId;
}

export async function saveGameHistoryToFirestore(
  roomCode: string,
  game: CoupleGameRound,
  partners: Partner[],
  vibe: VibeState,
  user: User,
  myDisplayName: string
): Promise<string> {
  const archive = await ensureRoomArchive(roomCode, partners, vibe, user, myDisplayName);
  const gameId = game.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const gamePath = `rooms/${roomCode}/gameHistory/${gameId}`;
  const safeSaver = cleanName(myDisplayName || user.displayName || 'Partner');

  let matchScore = 0;
  const rounds: SavedGameRoundItem[] = game.questions.slice(0, 5).map((q) => {
    const ansMap = game.answers[q.id] || {};
    const picks = partners.slice(0, 2).map((p) => {
      const idx = ansMap[p.id];
      const optionText =
        typeof idx === 'number' && q.options[idx] ? q.options[idx] : 'No pick';
      return {
        partnerName: cleanName(p.name),
        optionText: optionText.slice(0, 80),
      };
    });

    const p0 = partners[0];
    const p1 = partners[1];
    const matched = Boolean(
      p0 &&
        p1 &&
        ansMap[p0.id] !== undefined &&
        ansMap[p1.id] !== undefined &&
        ansMap[p0.id] === ansMap[p1.id]
    );
    if (matched) matchScore += 1;

    return {
      prompt: q.prompt.slice(0, 160),
      options: q.options.slice(0, 4).map((o) => o.slice(0, 80)),
      picks: picks.length > 0 ? picks : [{ partnerName: safeSaver, optionText: 'Completed' }],
      matched,
    };
  });

  const safePartnerNames = partners
    .map((p) => cleanName(p.name))
    .slice(0, 2);

  const batch = writeBatch(db);
  batch.set(doc(db, 'rooms', roomCode, 'gameHistory', gameId), {
    id: gameId,
    roomCode,
    mode: game.mode,
    moodTag: game.moodTag.slice(0, 40) || 'Playful',
    savedByUid: user.uid,
    savedByName: safeSaver,
    participantUids: archive.participantUids,
    partnerNames: safePartnerNames.length > 0 ? safePartnerNames : [safeSaver],
    matchScore,
    totalQuestions: rounds.length,
    rounds,
    createdAt: serverTimestamp(),
  });
  batch.update(doc(db, 'rooms', roomCode), {
    gameCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, gamePath);
  }

  return gameId;
}

export function subscribeRoomSnapshots(
  roomCode: string,
  uid: string,
  onData: (items: SavedCanvasSnapshot[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `rooms/${roomCode}/snapshots`;
  const q = query(
    collection(db, path),
    where('participantUids', 'array-contains', uid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: SavedCanvasSnapshot[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        items.push({
          id: String(d.id || docSnap.id),
          roomCode: String(d.roomCode || roomCode),
          title: String(d.title || 'Evening Sketch'),
          savedByUid: String(d.savedByUid || ''),
          savedByName: String(d.savedByName || 'Partner'),
          participantUids: Array.isArray(d.participantUids) ? d.participantUids : [],
          strokeCount: Number(d.strokeCount || 0),
          strokes: Array.isArray(d.strokes) ? d.strokes : [],
          createdAtMs: toMillis(d.createdAt),
        });
      });
      items.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function subscribeRoomGameHistory(
  roomCode: string,
  uid: string,
  onData: (items: SavedGameHistory[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `rooms/${roomCode}/gameHistory`;
  const q = query(
    collection(db, path),
    where('participantUids', 'array-contains', uid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: SavedGameHistory[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        items.push({
          id: String(d.id || docSnap.id),
          roomCode: String(d.roomCode || roomCode),
          mode: d.mode === 'would_you_rather' ? 'would_you_rather' : 'know_me',
          moodTag: String(d.moodTag || 'Playful'),
          savedByUid: String(d.savedByUid || ''),
          savedByName: String(d.savedByName || 'Partner'),
          participantUids: Array.isArray(d.participantUids) ? d.participantUids : [],
          partnerNames: Array.isArray(d.partnerNames) ? d.partnerNames : [],
          matchScore: Number(d.matchScore || 0),
          totalQuestions: Number(d.totalQuestions || 5),
          rounds: Array.isArray(d.rounds) ? d.rounds : [],
          createdAtMs: toMillis(d.createdAt),
        });
      });
      items.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function listUserPastRooms(uid: string): Promise<ArchivedRoom[]> {
  const path = 'rooms';
  try {
    const q = query(
      collection(db, path),
      where('participantUids', 'array-contains', uid)
    );
    const snap = await getDocs(q);
    const list: ArchivedRoom[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      list.push({
        code: String(d.code || docSnap.id),
        createdByUid: String(d.createdByUid || ''),
        participantUids: Array.isArray(d.participantUids) ? d.participantUids : [],
        partnerNames: Array.isArray(d.partnerNames) ? d.partnerNames : [],
        partnerCount: Number(d.partnerCount || 1),
        lastCraving: String(d.lastCraving || 'Pistachio Kulfi'),
        lastSoundtrack: String(d.lastSoundtrack || 'Rain & Vinyl'),
        lastEnergy: Number(d.lastEnergy || 2),
        snapshotCount: Number(d.snapshotCount || 0),
        gameCount: Number(d.gameCount || 0),
        createdAtMs: toMillis(d.createdAt),
        updatedAtMs: toMillis(d.updatedAt),
      });
    });
    list.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function getArchivedRoomForRejoin(
  roomCode: string
): Promise<ArchivedRoom | null> {
  const path = `rooms/${roomCode}`;
  try {
    const snap = await getDoc(doc(db, 'rooms', roomCode));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      code: String(d.code || roomCode),
      createdByUid: String(d.createdByUid || ''),
      participantUids: Array.isArray(d.participantUids) ? d.participantUids : [],
      partnerNames: Array.isArray(d.partnerNames) ? d.partnerNames : [],
      partnerCount: Number(d.partnerCount || 1),
      lastCraving: String(d.lastCraving || 'Pistachio Kulfi'),
      lastSoundtrack: String(d.lastSoundtrack || 'Rain & Vinyl'),
      lastEnergy: Number(d.lastEnergy || 2),
      snapshotCount: Number(d.snapshotCount || 0),
      gameCount: Number(d.gameCount || 0),
      createdAtMs: toMillis(d.createdAt),
      updatedAtMs: toMillis(d.updatedAt),
    };
  } catch {
    return null;
  }
}

export async function deleteCanvasSnapshot(
  roomCode: string,
  snapshotId: string,
  currentCount: number
): Promise<void> {
  const path = `rooms/${roomCode}/snapshots/${snapshotId}`;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'rooms', roomCode, 'snapshots', snapshotId));
  batch.update(doc(db, 'rooms', roomCode), {
    snapshotCount: Math.max(0, currentCount - 1),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteGameHistoryRecord(
  roomCode: string,
  gameId: string,
  currentCount: number
): Promise<void> {
  const path = `rooms/${roomCode}/gameHistory/${gameId}`;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'rooms', roomCode, 'gameHistory', gameId));
  batch.update(doc(db, 'rooms', roomCode), {
    gameCount: Math.max(0, currentCount - 1),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
