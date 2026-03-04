import { EventEmitter } from 'events';

/**
 * Lightweight signal to wake the message loop immediately when a
 * channel receives a message, instead of waiting for the next poll tick.
 */
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

/** Channels call this after storing a message. */
export function signalNewMessage(): void {
  emitter.emit('message');
}

/**
 * Returns a promise that resolves when either:
 * - a new message signal fires, or
 * - the timeout expires (fallback poll interval)
 */
export function waitForMessage(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const onMessage = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      emitter.removeListener('message', onMessage);
      resolve();
    }, timeoutMs);
    emitter.once('message', onMessage);
  });
}
