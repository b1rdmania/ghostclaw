/**
 * Container runtime abstraction for NanoClaw.
 * Containerization removed — agents run directly on host.
 * These are no-ops kept for API compatibility.
 */

import { logger } from './logger.js';

/** No-op: containers are not used. */
export function ensureContainerRuntimeRunning(): void {
  logger.debug('Container runtime check skipped (running without containers)');
}

/** No-op: no containers to clean up. */
export function cleanupOrphans(): void {
  logger.debug('Orphan cleanup skipped (running without containers)');
}
