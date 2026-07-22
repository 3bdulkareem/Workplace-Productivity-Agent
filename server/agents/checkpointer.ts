/**
 * LangGraph Checkpointer Implementation
 * 
 * Manages conversation state persistence with short-term and long-term memory.
 * Short-term memory: Current conversation context (in-memory)
 * Long-term memory: Persistent storage in database
 */

import { getDb } from "../db";
import { conversations, messages } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Checkpoint state interface
 */
export interface CheckpointState {
  threadId: string;
  userId: number;
  timestamp: number;
  state: Record<string, unknown>;
  metadata: {
    agentType?: string;
    interruptRequired?: boolean;
    interruptMessage?: string;
  };
}

/**
 * Short-term memory store (in-memory cache)
 */
class ShortTermMemory {
  private cache: Map<string, CheckpointState> = new Map();
  private maxSize = 100; // Maximum number of checkpoints to keep in memory

  /**
   * Store a checkpoint in short-term memory
   */
  store(checkpoint: CheckpointState): void {
    this.cache.set(checkpoint.threadId, checkpoint);

    // Evict oldest checkpoint if cache exceeds max size
    if (this.cache.size > this.maxSize) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  /**
   * Retrieve a checkpoint from short-term memory
   */
  retrieve(threadId: string): CheckpointState | undefined {
    const checkpoint = this.cache.get(threadId);
    return checkpoint;
  }

  /**
   * Clear all short-term memory
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}

/**
 * Long-term memory store (database persistence)
 */
class LongTermMemory {
  /**
   * Save checkpoint to database
   */
  async save(checkpoint: CheckpointState): Promise<void> {
    try {
      // Log checkpoint for persistence (in production, use proper storage)
      console.log("Checkpoint saved:", {
        threadId: checkpoint.threadId,
        userId: checkpoint.userId,
        timestamp: checkpoint.timestamp,
        state: checkpoint.state,
        metadata: checkpoint.metadata,
      });

      // In production, you would save to database:
      // await db.insert(conversations).values({...})
      // await db.insert(messages).values({...})
    } catch (error) {
      console.error("Error saving checkpoint to long-term memory:", error);
      throw error;
    }
  }

  /**
   * Load checkpoint from database
   */
  async load(threadId: string): Promise<CheckpointState | null> {
    try {
      const db = await getDb();
      if (!db) return null;

      // Find the conversation
      const conversation = await (db.query as any).conversations.findFirst({
        where: eq(conversations.threadId, threadId),
      });

      if (!conversation) {
        return null;
      }

      // Find the latest system message with state
      const stateMessage = await (db.query as any).messages.findFirst({
        where: eq(messages.role, "system"),
      });

      if (!stateMessage) {
        return null;
      }

      return {
        threadId,
        userId: conversation.userId,
        timestamp: stateMessage.createdAt.getTime(),
        state: JSON.parse(stateMessage.content),
        metadata: {
          agentType: stateMessage.agentType || undefined,
          interruptRequired: stateMessage.interruptRequired || false,
        },
      };
    } catch (error) {
      console.error("Error loading checkpoint from long-term memory:", error);
      return null;
    }
  }

  /**
   * Get all checkpoints for a user
   */
  async getAllForUser(userId: number): Promise<CheckpointState[]> {
    try {
      const db = await getDb();
      if (!db) return [];

      const userConversations = await (db.query as any).conversations.findMany({
        where: eq(conversations.userId, userId),
      });

      const checkpoints: CheckpointState[] = [];

      for (const conv of userConversations) {
        const checkpoint = await this.load(conv.threadId);
        if (checkpoint) {
          checkpoints.push(checkpoint);
        }
      }

      return checkpoints;
    } catch (error) {
      console.error("Error retrieving user checkpoints:", error);
      return [];
    }
  }

  /**
   * Delete a checkpoint
   */
  async delete(threadId: string): Promise<void> {
    try {
      const db = await getDb();
      if (!db) return;

      // Find conversation by threadId
      const conversation = await (db.query as any).conversations.findFirst({
        where: eq(conversations.threadId, threadId),
      });

      if (conversation) {
        // Delete associated messages
        await db.delete(messages).where(eq(messages.conversationId, conversation.id));

        // Delete conversation
        await db.delete(conversations).where(eq(conversations.id, conversation.id));
      }
    } catch (error) {
      console.error("Error deleting checkpoint:", error);
      throw error;
    }
  }
}

/**
 * Unified Checkpointer combining short-term and long-term memory
 */
export class Checkpointer {
  private shortTerm: ShortTermMemory;
  private longTerm: LongTermMemory;

  constructor() {
    this.shortTerm = new ShortTermMemory();
    this.longTerm = new LongTermMemory();
  }

  /**
   * Save checkpoint to both short-term and long-term memory
   */
  async save(checkpoint: CheckpointState): Promise<void> {
    // Save to short-term memory (fast)
    this.shortTerm.store(checkpoint);

    // Save to long-term memory (persistent)
    await this.longTerm.save(checkpoint);
  }

  /**
   * Load checkpoint from short-term memory first, then long-term if not found
   */
  async load(threadId: string): Promise<CheckpointState | null> {
    // Try short-term memory first
    const shortTermCheckpoint = this.shortTerm.retrieve(threadId);
    if (shortTermCheckpoint) {
      return shortTermCheckpoint;
    }

    // Fall back to long-term memory
    const longTermCheckpoint = await this.longTerm.load(threadId);
    if (longTermCheckpoint) {
      // Cache in short-term memory for future access
      this.shortTerm.store(longTermCheckpoint);
      return longTermCheckpoint;
    }

    return null;
  }

  /**
   * Get all checkpoints for a user
   */
  async getAllForUser(userId: number): Promise<CheckpointState[]> {
    return this.longTerm.getAllForUser(userId);
  }

  /**
   * Delete a checkpoint
   */
  async delete(threadId: string): Promise<void> {
    // Remove from long-term memory
    await this.longTerm.delete(threadId);
  }

  /**
   * Get memory statistics
   */
  getStats(): {
    shortTerm: { size: number; maxSize: number };
  } {
    return {
      shortTerm: this.shortTerm.getStats(),
    };
  }

  /**
   * Clear short-term memory (long-term persists)
   */
  clearShortTerm(): void {
    this.shortTerm.clear();
  }
}

/**
 * Global checkpointer instance
 */
let globalCheckpointer: Checkpointer | null = null;

/**
 * Get or create the global checkpointer
 */
export function getCheckpointer(): Checkpointer {
  if (!globalCheckpointer) {
    globalCheckpointer = new Checkpointer();
  }
  return globalCheckpointer;
}

/**
 * Create a checkpoint from agent state
 */
export function createCheckpoint(
  threadId: string,
  userId: number,
  state: Record<string, unknown>,
  metadata?: Record<string, unknown>
): CheckpointState {
  return {
    threadId,
    userId,
    timestamp: Date.now(),
    state,
    metadata: {
      agentType: metadata?.agentType as string | undefined,
      interruptRequired: metadata?.interruptRequired as boolean | undefined,
      interruptMessage: metadata?.interruptMessage as string | undefined,
    },
  };
}

/**
 * Example usage:
 * 
 * // Save checkpoint
 * const checkpoint = createCheckpoint(
 *   "thread-123",
 *   456,
 *   { messages: [...], currentAgent: "rag" },
 *   { agentType: "rag", interruptRequired: false }
 * );
 * await getCheckpointer().save(checkpoint);
 * 
 * // Load checkpoint
 * const loaded = await getCheckpointer().load("thread-123");
 * 
 * // Get all user checkpoints
 * const allCheckpoints = await getCheckpointer().getAllForUser(456);
 */
