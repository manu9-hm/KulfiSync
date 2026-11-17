import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider } from '../firebase.ts';
import {
  deleteCanvasSnapshot,
  deleteGameHistoryRecord,
  ensureRoomArchive,
  listUserPastRooms,
  saveCanvasSnapshotToFirestore,
  saveGameHistoryToFirestore,
  subscribeRoomGameHistory,
  subscribeRoomSnapshots,
  type ArchivedRoom,
  type SavedCanvasSnapshot,
  type SavedGameHistory,
} from '../services/memoriesService.ts';
import type { CanvasStroke, CoupleGameRound, RoomState } from '../types/room.ts';

export function useFirebaseMemories(room: RoomState | null, partnerName: string) {
  const [user, setUser] = useState<User | null>(() => auth.currentUser);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);

  const [pastRooms, setPastRooms] = useState<ArchivedRoom[]>([]);
  const [loadingPastRooms, setLoadingPastRooms] = useState<boolean>(false);
  const [pastRoomsError, setPastRoomsError] = useState<string | null>(null);

  const [snapshots, setSnapshots] = useState<SavedCanvasSnapshot[]>([]);
  const [gameHistory, setGameHistory] = useState<SavedGameHistory[]>([]);
  const [loadingMemories, setLoadingMemories] = useState<boolean>(false);
  const [memoriesError, setMemoriesError] = useState<string | null>(null);

  const [isSavingSnapshot, setIsSavingSnapshot] = useState<boolean>(false);
  const [isSavingGame, setIsSavingGame] = useState<boolean>(false);
  const [savedGameIds, setSavedGameIds] = useState<Record<string, boolean>>({});

  const lastSyncedRoomKeyRef = useRef<string>('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const refreshPastRooms = useCallback(async () => {
    if (!user) {
      setPastRooms([]);
      return;
    }
    setLoadingPastRooms(true);
    setPastRoomsError(null);
    try {
      const items = await listUserPastRooms(user.uid);
      setPastRooms(items);
    } catch (err) {
      setPastRoomsError(
        err instanceof Error ? err.message : 'Unable to load past rooms.'
      );
    } finally {
      setLoadingPastRooms(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setPastRooms([]);
      return;
    }
    if (!room) {
      void refreshPastRooms();
    }
  }, [authReady, user, room, refreshPastRooms]);

  // Sync room metadata and subscribe to room memories whenever signed in & inside a room
  useEffect(() => {
    if (!authReady || !user || !room) {
      setSnapshots([]);
      setGameHistory([]);
      setLoadingMemories(false);
      lastSyncedRoomKeyRef.current = '';
      return;
    }

    const syncKey = `${room.code}:${user.uid}:${room.vibe.updatedAt}:${room.partners.length}`;
    if (lastSyncedRoomKeyRef.current !== syncKey) {
      lastSyncedRoomKeyRef.current = syncKey;
      void ensureRoomArchive(
        room.code,
        room.partners,
        room.vibe,
        user,
        partnerName
      ).catch((err) => {
        setMemoriesError(
          err instanceof Error ? err.message : 'Could not sync room metadata.'
        );
      });
    }

    setLoadingMemories(true);
    setMemoriesError(null);
    let snapReady = false;
    let gameReady = false;

    const unsubSnapshots = subscribeRoomSnapshots(
      room.code,
      user.uid,
      (items) => {
        setSnapshots(items);
        snapReady = true;
        if (gameReady) setLoadingMemories(false);
      },
      (err) => {
        setMemoriesError(err.message);
        setLoadingMemories(false);
      }
    );

    const unsubGames = subscribeRoomGameHistory(
      room.code,
      user.uid,
      (items) => {
        setGameHistory(items);
        const idMap: Record<string, boolean> = {};
        for (const item of items) {
          idMap[item.id] = true;
        }
        setSavedGameIds(idMap);
        gameReady = true;
        if (snapReady) setLoadingMemories(false);
      },
      (err) => {
        setMemoriesError(err.message);
        setLoadingMemories(false);
      }
    );

    return () => {
      unsubSnapshots();
      unsubGames();
    };
  }, [authReady, user, room?.code, room?.vibe.updatedAt, room?.partners.length, partnerName, room]);

  const signInWithGoogle = useCallback(async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Google sign-in was cancelled.';
      if (!message.includes('popup-closed-by-user')) {
        setAuthError(message);
      }
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    await signOut(auth);
  }, []);

  const saveSnapshot = useCallback(
    async (title: string, strokes: CanvasStroke[]): Promise<string> => {
      if (!user || !room) {
        throw new Error('Sign in with Google inside the room to save snapshots.');
      }
      setIsSavingSnapshot(true);
      try {
        return await saveCanvasSnapshotToFirestore(
          room.code,
          title,
          strokes,
          room.partners,
          room.vibe,
          user,
          partnerName
        );
      } finally {
        setIsSavingSnapshot(false);
      }
    },
    [user, room, partnerName]
  );

  const saveCompletedGame = useCallback(
    async (game: CoupleGameRound): Promise<string> => {
      if (!user || !room) {
        throw new Error('Sign in with Google inside the room to save game scores.');
      }
      setIsSavingGame(true);
      try {
        const id = await saveGameHistoryToFirestore(
          room.code,
          game,
          room.partners,
          room.vibe,
          user,
          partnerName
        );
        setSavedGameIds((prev) => ({ ...prev, [id]: true }));
        return id;
      } finally {
        setIsSavingGame(false);
      }
    },
    [user, room, partnerName]
  );

  const removeSnapshot = useCallback(
    async (snapshotId: string) => {
      if (!room) return;
      await deleteCanvasSnapshot(room.code, snapshotId, snapshots.length);
    },
    [room, snapshots.length]
  );

  const removeGameRecord = useCallback(
    async (gameId: string) => {
      if (!room) return;
      await deleteGameHistoryRecord(room.code, gameId, gameHistory.length);
    },
    [room, gameHistory.length]
  );

  return {
    user,
    authReady,
    authError,
    isSigningIn,
    signInWithGoogle,
    signOutUser,
    pastRooms,
    loadingPastRooms,
    pastRoomsError,
    refreshPastRooms,
    snapshots,
    gameHistory,
    loadingMemories,
    memoriesError,
    isSavingSnapshot,
    isSavingGame,
    savedGameIds,
    saveSnapshot,
    saveCompletedGame,
    removeSnapshot,
    removeGameRecord,
  };
}
