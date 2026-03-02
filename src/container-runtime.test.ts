import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  ensureContainerRuntimeRunning,
  cleanupOrphans,
} from './container-runtime.js';
import { logger } from './logger.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ensureContainerRuntimeRunning', () => {
  it('is a no-op (no containers)', () => {
    ensureContainerRuntimeRunning();
    expect(logger.debug).toHaveBeenCalledWith(
      'Container runtime check skipped (running without containers)',
    );
  });
});

describe('cleanupOrphans', () => {
  it('is a no-op (no containers)', () => {
    cleanupOrphans();
    expect(logger.debug).toHaveBeenCalledWith(
      'Orphan cleanup skipped (running without containers)',
    );
  });
});
