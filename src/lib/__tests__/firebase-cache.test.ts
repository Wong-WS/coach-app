import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Firestore must keep its cache in memory, never in the browser's IndexedDB.
 *
 * Safari's IndexedDB can stop responding after a long-idle tab is reloaded
 * (or a tab reloads itself after a deploy). With a persistent cache, every
 * Firestore read then hangs inside the SDK, and the dashboard lands on
 * "Couldn't load your account" until the tab is closed. See 2026-11-18.
 */

const firestore = vi.hoisted(() => ({
  getFirestore: vi.fn(() => ({ kind: 'db' })),
  initializeFirestore: vi.fn(() => ({ kind: 'db' })),
  persistentLocalCache: vi.fn(),
  persistentMultipleTabManager: vi.fn(),
  persistentSingleTabManager: vi.fn(),
  memoryLocalCache: vi.fn(),
}));

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ kind: 'app' })),
  getApps: vi.fn(() => []),
}));
vi.mock('firebase/auth', () => ({ getAuth: vi.fn(() => ({ kind: 'auth' })) }));
vi.mock('firebase/firestore', () => firestore);

describe('firebase client init', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('does not use an IndexedDB-backed Firestore cache', async () => {
    vi.stubGlobal('window', {});
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'test-key');

    const { db } = await import('../firebase');

    expect(db).toBeDefined();
    expect(firestore.persistentLocalCache).not.toHaveBeenCalled();
  });
});
