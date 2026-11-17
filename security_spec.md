# KulfiSync Firestore Security Specification

## 1. Data Invariants
1. Every document in `/rooms/{roomCode}` must have a valid 6-character uppercase alphanumeric `code` matching the path `{roomCode}` (`^[A-Z0-9]{6}$`).
2. `participantUids` on `/rooms/{roomCode}` is strictly bounded to 1–2 verified user UIDs (`size() >= 1 && size() <= 2`), never unbounded.
3. Room creation is atomic with creating `/rooms/{roomCode}/members/{request.auth.uid}` via `existsAfter()`.
4. Subcollection records (`/members/{memberId}`, `/snapshots/{snapshotId}`, `/gameHistory/{gameId}`) must enforce Master Gate membership via `get()` on single-document operations (`get`, `create`, `update`, `delete`) and strict `request.auth.uid in resource.data.participantUids` on `list` queries (zero `get()`/`exists()` inside `allow list`).
5. All `createdAt` and `updatedAt` timestamps must equal `request.time`. `createdAt`, `code`, `createdByUid`, `savedByUid`, and `roomCode` are immutable after creation.
6. Only email-verified authenticated users (`request.auth != null && request.auth.token.email_verified == true`) may read or write room memory documents.
7. Zero PII (`email`, `phone`, `address`) is stored in any room, member, snapshot, or gameHistory document.

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated read/write**: Read `/rooms/K7M9P2` with `request.auth == null`.
2. **Unverified email write**: Create `/rooms/K7M9P2` with `email_verified == false`.
3. **Blanket room list scraping**: Query `collection(db, 'rooms')` without `where('participantUids', 'array-contains', uid)`.
4. **Cross-room snapshot list**: Query `collection(db, 'rooms/K7M9P2/snapshots')` as non-member UID.
5. **Identity spoofing on room create**: Create `/rooms/K7M9P2` with `createdByUid != request.auth.uid`.
6. **Shadow field injection**: Create `/rooms/K7M9P2` with extra key `isAdmin: true`.
7. **ID poisoning**: Write `/rooms/INVALID_LONG_CODE_12345` (fails `isValidRoomCode`).
8. **Timestamp forgery**: Create snapshot with client-supplied `createdAt` instead of `request.time`.
9. **Immutable field mutation**: Update `/rooms/K7M9P2` changing `createdByUid` or `createdAt`.
10. **Member capacity overflow**: Attempt to update `participantUids` to 3 UIDs (`size() == 3`).
11. **Oversized snapshot title / strokes**: Create snapshot with `title.size() > 80` or `strokes.size() > 200`.
12. **Non-owner snapshot deletion**: Attempt to delete a snapshot where `existing().savedByUid != request.auth.uid`.
