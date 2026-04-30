/**
 * Rate Limiter — Unit Tests
 *
 * Tests the 190 DMs/hour cap enforcement using mocked Redis.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so these are available inside vi.mock factories
const { mockGet, mockIncr, mockExpire, mockDel, mockExec } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockIncr: vi.fn(),
  mockExpire: vi.fn(),
  mockDel: vi.fn(),
  mockExec: vi.fn(),
}));

vi.mock("ioredis", () => {
  const MockRedis = vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.get = mockGet;
    this.del = mockDel;
    this.pipeline = () => ({
      incr: mockIncr,
      expire: mockExpire,
      exec: mockExec,
    });
    return this;
  });
  return { default: MockRedis };
});

// Set env before importing
vi.stubEnv("REDIS_URL", "redis://localhost:6379");

import {
  checkRateLimit,
  incrementDMCounter,
  RATE_LIMIT_MAX,
} from "../lib/utils/rate-limiter";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkRateLimit", () => {
  it("should allow when count is below limit", async () => {
    mockGet.mockResolvedValue("50");

    const result = await checkRateLimit("account_123");

    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(50);
    expect(result.remainingDMs).toBe(RATE_LIMIT_MAX - 50);
    expect(result.shouldRequeue).toBe(false);
    expect(result.shouldSkip).toBe(false);
  });

  it("should allow when no previous count exists", async () => {
    mockGet.mockResolvedValue(null);

    const result = await checkRateLimit("account_123");

    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(0);
    expect(result.remainingDMs).toBe(RATE_LIMIT_MAX);
  });

  it("should deny when count reaches the limit", async () => {
    mockGet.mockResolvedValue("190");

    const result = await checkRateLimit("account_123");

    expect(result.allowed).toBe(false);
    expect(result.shouldRequeue).toBe(true);
    expect(result.shouldSkip).toBe(false);
  });

  it("should deny when count exceeds the limit", async () => {
    mockGet.mockResolvedValue("250");

    const result = await checkRateLimit("account_123");

    expect(result.allowed).toBe(false);
    expect(result.remainingDMs).toBe(0);
  });

  it("should recommend requeue on first rate limit hit", async () => {
    mockGet.mockResolvedValue("190");

    const result = await checkRateLimit("account_123", 0);

    expect(result.allowed).toBe(false);
    expect(result.shouldRequeue).toBe(true);
    expect(result.requeueDelayMs).toBeGreaterThan(0);
    expect(result.shouldSkip).toBe(false);
  });

  it("should skip after max requeue attempts", async () => {
    mockGet.mockResolvedValue("190");

    const result = await checkRateLimit("account_123", 3);

    expect(result.allowed).toBe(false);
    expect(result.shouldRequeue).toBe(false);
    expect(result.shouldSkip).toBe(true);
  });

  it("should still recommend requeue at attempt 2", async () => {
    mockGet.mockResolvedValue("190");

    const result = await checkRateLimit("account_123", 2);

    expect(result.allowed).toBe(false);
    expect(result.shouldRequeue).toBe(true);
    expect(result.shouldSkip).toBe(false);
  });
});

describe("incrementDMCounter", () => {
  it("should increment the counter and set expiry", async () => {
    mockExec.mockResolvedValue([[null, 51], [null, 1]]);

    const count = await incrementDMCounter("account_123");

    expect(mockIncr).toHaveBeenCalledWith("rate:dm:account_123");
    expect(mockExpire).toHaveBeenCalledWith("rate:dm:account_123", 3600);
    expect(count).toBe(51);
  });

  it("should return 0 if exec returns null", async () => {
    mockExec.mockResolvedValue(null);

    const count = await incrementDMCounter("account_123");
    expect(count).toBe(0);
  });
});
