/**
 * DM Worker — Integration Tests
 *
 * Tests the full comment → DM pipeline with mocked Meta API and Prisma.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

// Use vi.hoisted so these are available inside vi.mock factories (which are hoisted)
const {
  mockPrisma,
  mockSendDM,
  mockDecryptToken,
  mockMatchKeywords,
  mockCheckRateLimit,
  mockIncrementDMCounter,
  mockQueueAdd,
} = vi.hoisted(() => ({
  mockPrisma: {
    automation: {
      findMany: vi.fn(),
    },
    dmLog: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
  mockSendDM: vi.fn(),
  mockDecryptToken: vi.fn(),
  mockMatchKeywords: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockIncrementDMCounter: vi.fn(),
  mockQueueAdd: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/meta/client", () => ({
  sendDM: mockSendDM,
  MetaApiError: class MetaApiError extends Error {
    code: number;
    constructor(code: number, _subcode: number | undefined, _fbTraceId: string | undefined, message: string) {
      super(message);
      this.code = code;
      this.name = "MetaApiError";
    }
  },
}));

vi.mock("@/lib/meta/oauth", () => ({
  decryptToken: mockDecryptToken,
}));

vi.mock("@/lib/utils/keyword-matcher", () => ({
  matchKeywords: mockMatchKeywords,
}));

vi.mock("@/lib/utils/rate-limiter", () => ({
  checkRateLimit: mockCheckRateLimit,
  incrementDMCounter: mockIncrementDMCounter,
}));

vi.mock("@/lib/queue/client", () => ({
  getDMQueue: () => ({
    add: mockQueueAdd,
  }),
  getRedisConnection: vi.fn(),
}));

// Mock BullMQ Worker
vi.mock("bullmq", () => {
  function MockWorker(_name: string, processor: unknown) {
    (global as Record<string, unknown>).__dmWorkerProcessor = processor;
    return {
      on: vi.fn(),
      close: vi.fn(),
    };
  }
  return {
    Worker: MockWorker,
    Queue: vi.fn(),
    Job: vi.fn(),
  };
});

// Import after mocks are set up
import { createDMWorker } from "../lib/queue/dm-worker";

// ─── Test Data ──────────────────────────────────────────────────────────────────

const mockUser = {
  id: "user_123",
  instagramId: "ig_456",
  instagramUsername: "testuser",
  accessToken: "encrypted_token_abc",
  plan: "PRO",
};

const mockAutomation = {
  id: "auto_789",
  userId: "user_123",
  postId: "media_101",
  keywords: ["LINK", "PRICE"],
  dmMessage: "Hey {username}! Here is the link: https://example.com",
  isActive: true,
  wholeWordMatch: true,
  user: mockUser,
};

const mockJobData = {
  commentId: "comment_555",
  commentText: "I want the LINK!",
  commenterId: "commenter_999",
  commenterName: "commenter_user",
  mediaId: "media_101",
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getProcessor(): (job: any) => Promise<void> {
  createDMWorker();
  return (global as Record<string, unknown>).__dmWorkerProcessor as (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    job: any
  ) => Promise<void>;
}

function createMockJob(data = mockJobData) {
  return {
    data,
    id: "job_001",
    attemptsMade: 0,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Default mock implementations for happy path
  mockPrisma.automation.findMany.mockResolvedValue([mockAutomation]);
  mockPrisma.dmLog.findUnique.mockResolvedValue(null); // No dedup match
  mockPrisma.dmLog.create.mockResolvedValue({});
  mockDecryptToken.mockReturnValue("decrypted_token");
  mockMatchKeywords.mockReturnValue({ matched: true, matchedKeyword: "LINK" });
  mockCheckRateLimit.mockResolvedValue({
    allowed: true,
    currentCount: 10,
    remainingDMs: 180,
    shouldRequeue: false,
    requeueDelayMs: 0,
    shouldSkip: false,
  });
  mockIncrementDMCounter.mockResolvedValue(11);
  mockSendDM.mockResolvedValue({ recipient_id: "commenter_999", message_id: "msg_001" });
});

describe("DM Worker — Full Pipeline", () => {
  it("should send a DM for a matching comment", async () => {
    const processor = getProcessor();
    const job = createMockJob();

    await processor(job);

    // Should find automations for the media
    expect(mockPrisma.automation.findMany).toHaveBeenCalledWith({
      where: { postId: "media_101", isActive: true },
      include: { user: true },
    });

    // Should check keyword match
    expect(mockMatchKeywords).toHaveBeenCalledWith(
      "I want the LINK!",
      ["LINK", "PRICE"],
      true
    );

    // Should check dedup
    expect(mockPrisma.dmLog.findUnique).toHaveBeenCalledWith({
      where: { commentId: "auto_789:comment_555" },
    });

    // Should check rate limit
    expect(mockCheckRateLimit).toHaveBeenCalledWith("ig_456", 0);

    // Should decrypt token
    expect(mockDecryptToken).toHaveBeenCalledWith("encrypted_token_abc");

    // Should send DM with merge tag replaced
    expect(mockSendDM).toHaveBeenCalledWith(
      "decrypted_token",
      "commenter_999",
      "Hey commenter_user! Here is the link: https://example.com"
    );

    // Should increment rate counter
    expect(mockIncrementDMCounter).toHaveBeenCalledWith("ig_456");

    // Should log success
    expect(mockPrisma.dmLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "SENT",
        automationId: "auto_789",
        commenterId: "commenter_999",
      }),
    });
  });

  it("should skip when no automations match the media", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([]);
    const processor = getProcessor();

    await processor(createMockJob());

    expect(mockSendDM).not.toHaveBeenCalled();
    expect(mockPrisma.dmLog.create).not.toHaveBeenCalled();
  });

  it("should skip when keywords don't match", async () => {
    mockMatchKeywords.mockReturnValue({ matched: false, matchedKeyword: null });
    const processor = getProcessor();

    await processor(createMockJob());

    expect(mockSendDM).not.toHaveBeenCalled();
  });

  it("should skip duplicate comments (dedup)", async () => {
    mockPrisma.dmLog.findUnique.mockResolvedValue({ id: "existing_log" });
    const processor = getProcessor();

    await processor(createMockJob());

    expect(mockSendDM).not.toHaveBeenCalled();
  });

  it("should requeue when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      currentCount: 190,
      remainingDMs: 0,
      shouldRequeue: true,
      requeueDelayMs: 1800000,
      shouldSkip: false,
    });

    const processor = getProcessor();
    await processor(createMockJob());

    // Should not send DM
    expect(mockSendDM).not.toHaveBeenCalled();

    // Should requeue with delay
    expect(mockQueueAdd).toHaveBeenCalledWith(
      "process-comment",
      expect.objectContaining({
        commentId: "comment_555",
        requeueAttempt: 1,
      }),
      expect.objectContaining({
        delay: 1800000,
      })
    );
  });

  it("should skip with SKIPPED_RATE_LIMIT after max requeue attempts", async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      currentCount: 190,
      remainingDMs: 0,
      shouldRequeue: false,
      requeueDelayMs: 0,
      shouldSkip: true,
    });

    const processor = getProcessor();
    await processor(createMockJob());

    // Should log as skipped
    expect(mockPrisma.dmLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "SKIPPED_RATE_LIMIT",
      }),
    });

    // Should not send DM
    expect(mockSendDM).not.toHaveBeenCalled();
  });

  it("should log FAILED when DM sending fails and re-throw", async () => {
    const error = new Error("API Error");
    mockSendDM.mockRejectedValue(error);

    const processor = getProcessor();

    await expect(processor(createMockJob())).rejects.toThrow("API Error");

    // Should log failure
    expect(mockPrisma.dmLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "FAILED",
        errorMessage: "API Error",
      }),
    });
  });

  it("should handle missing access token", async () => {
    mockPrisma.automation.findMany.mockResolvedValue([
      {
        ...mockAutomation,
        user: { ...mockUser, accessToken: null },
      },
    ]);

    const processor = getProcessor();
    await processor(createMockJob());

    // Should log failure
    expect(mockPrisma.dmLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "FAILED",
        errorMessage: "No access token available",
      }),
    });

    expect(mockSendDM).not.toHaveBeenCalled();
  });

  it("should replace {username} merge tag in DM message", async () => {
    const processor = getProcessor();
    await processor(createMockJob());

    expect(mockSendDM).toHaveBeenCalledWith(
      "decrypted_token",
      "commenter_999",
      "Hey commenter_user! Here is the link: https://example.com"
    );
  });

  it("should use 'there' when commenter name is not available", async () => {
    const processor = getProcessor();
    const { commenterName: _, ...jobDataWithoutName } = mockJobData;
    await processor(
      createMockJob(jobDataWithoutName as typeof mockJobData)
    );

    expect(mockSendDM).toHaveBeenCalledWith(
      "decrypted_token",
      "commenter_999",
      "Hey there! Here is the link: https://example.com"
    );
  });
});
