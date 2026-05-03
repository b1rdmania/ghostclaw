import { describe, it, expect } from 'vitest';

import { shouldBypassFastPath } from './fast-path.js';

describe('shouldBypassFastPath', () => {
  it('matches explicit persistence verbs', () => {
    expect(shouldBypassFastPath('remember that I like coffee')).toBe(true);
    expect(shouldBypassFastPath('Log this: the build is green')).toBe(true);
    expect(shouldBypassFastPath('save this for later')).toBe(true);
    expect(shouldBypassFastPath("don't forget the meeting")).toBe(true);
    expect(shouldBypassFastPath('dont forget the meeting')).toBe(true);
    expect(shouldBypassFastPath('note that prod is down')).toBe(true);
    expect(shouldBypassFastPath('file this under research')).toBe(true);
    expect(shouldBypassFastPath('write this down')).toBe(true);
    expect(shouldBypassFastPath('write down the error code')).toBe(true);
    expect(shouldBypassFastPath('store this for the record')).toBe(true);
    expect(shouldBypassFastPath('keep in mind the timezone')).toBe(true);
    expect(shouldBypassFastPath('for future reference, API is down')).toBe(
      true,
    );
    expect(shouldBypassFastPath('make a note of this')).toBe(true);
    expect(shouldBypassFastPath('take a note on the design')).toBe(true);
    expect(shouldBypassFastPath('bank this fact')).toBe(true);
  });

  it('is case insensitive', () => {
    expect(shouldBypassFastPath('REMEMBER this')).toBe(true);
    expect(shouldBypassFastPath('Note That the build passed')).toBe(true);
  });

  it('does not match normal chat', () => {
    expect(shouldBypassFastPath('hey, how are you?')).toBe(false);
    expect(shouldBypassFastPath('what is the weather today')).toBe(false);
    expect(shouldBypassFastPath("what's on my roadmap")).toBe(false);
    expect(shouldBypassFastPath('can you summarise the commits')).toBe(false);
    expect(shouldBypassFastPath('tell me about the new model')).toBe(false);
  });

  it('does not false-positive on embedded fragments', () => {
    // "noted" should not trigger "note this" — word-boundary required
    expect(shouldBypassFastPath('duly noted, moving on')).toBe(false);
    // "remembered" is a different tense — allowed for pure chat
    expect(shouldBypassFastPath('I remembered the password')).toBe(false);
  });
});
