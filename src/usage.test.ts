import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  _initTestDatabase,
  getTodayCostUsd,
  getTodaySpendBySource,
  getTodayUsageSummary,
  recordUsage,
} from './db.js';

beforeEach(() => {
  _initTestDatabase();
});

describe('recordUsage + getTodayCostUsd', () => {
  it('returns 0 when nothing recorded', () => {
    expect(getTodayCostUsd()).toBe(0);
  });

  it('sums a single event', () => {
    recordUsage(
      'agent',
      {
        input_tokens: 1000,
        output_tokens: 200,
        cost_usd: 0.42,
        model: 'claude-sonnet-4-6',
      },
      'main',
      'tg:123',
    );
    expect(getTodayCostUsd()).toBeCloseTo(0.42, 5);
  });

  it('sums multiple events in one day', () => {
    recordUsage('agent', { input_tokens: 100, output_tokens: 10, cost_usd: 1 });
    recordUsage('fast-path', {
      input_tokens: 50,
      output_tokens: 5,
      cost_usd: 0.25,
    });
    recordUsage('agent', {
      input_tokens: 80,
      output_tokens: 20,
      cost_usd: 0.5,
    });
    expect(getTodayCostUsd()).toBeCloseTo(1.75, 5);
  });

  it('ignores events before UTC midnight', () => {
    // Record today
    recordUsage('agent', { input_tokens: 1, output_tokens: 1, cost_usd: 3 });

    // Simulate a row from yesterday by bypassing recordUsage. Easiest: mock
    // Date.now to yesterday while recording, then restore.
    const realDate = Date;
    const yesterday = new Date(Date.now() - 48 * 60 * 60 * 1000);
    vi.useFakeTimers();
    vi.setSystemTime(yesterday);
    recordUsage('agent', {
      input_tokens: 1,
      output_tokens: 1,
      cost_usd: 100,
    });
    vi.useRealTimers();
    // Sanity: Date is restored
    expect(new Date().getUTCFullYear()).toBe(new realDate().getUTCFullYear());

    expect(getTodayCostUsd()).toBeCloseTo(3, 5);
  });

  it('treats missing cost_usd as zero', () => {
    recordUsage('agent', { input_tokens: 10, output_tokens: 5 });
    expect(getTodayCostUsd()).toBe(0);
  });
});

describe('getTodaySpendBySource', () => {
  it('returns empty array when nothing recorded', () => {
    expect(getTodaySpendBySource()).toEqual([]);
  });

  it('groups by source and orders by spend descending', () => {
    recordUsage('fast-path', {
      input_tokens: 100,
      output_tokens: 10,
      cost_usd: 0.05,
    });
    recordUsage('fast-path', {
      input_tokens: 100,
      output_tokens: 10,
      cost_usd: 0.02,
    });
    recordUsage('agent', {
      input_tokens: 5000,
      output_tokens: 500,
      cost_usd: 2,
    });

    const rows = getTodaySpendBySource();
    expect(rows).toHaveLength(2);
    expect(rows[0].source).toBe('agent');
    expect(rows[0].events).toBe(1);
    expect(rows[0].cost_usd).toBeCloseTo(2, 5);
    expect(rows[1].source).toBe('fast-path');
    expect(rows[1].events).toBe(2);
    expect(rows[1].cost_usd).toBeCloseTo(0.07, 5);
  });
});

describe('getTodayUsageSummary', () => {
  it('aggregates tokens + cost + event count', () => {
    recordUsage('agent', {
      input_tokens: 1000,
      output_tokens: 100,
      cache_read_input_tokens: 200,
      cost_usd: 0.5,
    });
    recordUsage('fast-path', {
      input_tokens: 500,
      output_tokens: 50,
      cost_usd: 0.01,
    });

    const s = getTodayUsageSummary();
    expect(s.today_events).toBe(2);
    expect(s.today_input_tokens).toBe(1500);
    expect(s.today_output_tokens).toBe(150);
    expect(s.today_cache_read_tokens).toBe(200);
    expect(s.today_usd).toBeCloseTo(0.51, 5);
  });
});
