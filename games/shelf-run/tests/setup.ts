// Runs before every unit test file (see vitest.config.ts).
import { vi } from 'vitest';
import { fakeRedis } from './fake-redis';

// No test ever talks to the real database: every Redis.fromEnv() in api/
// gets the in-memory fake.
vi.mock('@upstash/redis', () => ({ Redis: { fromEnv: () => fakeRedis } }));
