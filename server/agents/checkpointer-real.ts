/**
 * Real LangGraph Checkpointer with Database Persistence
 * 
 * Implements checkpoint storage for:
 * - Short-term memory (in-memory state during execution)
 * - Long-term memory (database persistence via checkpoints table)
 * - Thread management
 */

import { getDb } from "../db";
import { checkpoints, type InsertCheckpoint } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

interface CheckpointData {
  threadId: string;
  userId: string;
  checkpoint: Record<string, any>;
  timestamp: number;
  metadata: Record<string, any>;
}

export class DatabaseCheckpointer {
  private shortTermMemory: Map<string, CheckpointData> = new Map();

  /**
   * Save checkpoint to both short-term and long-term memory
   */
  async save(
    threadId: string,
    userId: string,
    checkpoint: Record<string, any>,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    // Short-term memory
    const data: CheckpointData = {
      threadId,
      userId,
      checkpoint,
      timestamp: Date.now(),
      metadata,
    };

    this.shortTermMemory.set(threadId, data);

    // Long-term memory (database persistence)
    try {
      const db = await getDb();
      if (!db) {
        console.warn("[Checkpointer] Database not available, skipping persistence");
        return;
      }

      // Convert userId from string to number if needed
      const userIdNum = typeof userId === "string" ? parseInt(userId, 10) : userId;

      // Check if checkpoint exists
      const existing = await db
        .select()
        .from(checkpoints)
        .where(eq(checkpoints.threadId, threadId))
        .limit(1);

      if (existing.length > 0) {
        // Update existing checkpoint
        await db
          .update(checkpoints)
          .set({
            checkpoint: JSON.stringify(checkpoint),
            metadata: JSON.stringify(metadata),
            updatedAt: new Date(),
          })
          .where(eq(checkpoints.threadId, threadId));

        console.log(`[Checkpointer] Updated checkpoint for thread ${threadId} in database`);
      } else {
        // Insert new checkpoint
        const insertData: InsertCheckpoint = {
          threadId,
          userId: userIdNum,
          checkpoint: JSON.stringify(checkpoint),
          metadata: JSON.stringify(metadata),
        };

        await db.insert(checkpoints).values(insertData);
        console.log(`[Checkpointer] Saved checkpoint for thread ${threadId} to database`);
      }
    } catch (error) {
      console.error("[Checkpointer] Error saving checkpoint to database:", error);
    }
  }

  /**
   * Retrieve checkpoint from memory or database
   */
  async get(threadId: string): Promise<CheckpointData | null> {
    // Try short-term memory first
    const shortTerm = this.shortTermMemory.get(threadId);
    if (shortTerm) {
      console.log(
        `[Checkpointer] Retrieved checkpoint for thread ${threadId} from short-term memory`
      );
      return shortTerm;
    }

    // Try database (long-term memory)
    try {
      const db = await getDb();
      if (!db) {
        console.warn("[Checkpointer] Database not available");
        return null;
      }

      const result = await db
        .select()
        .from(checkpoints)
        .where(eq(checkpoints.threadId, threadId))
        .limit(1);

      if (result.length > 0) {
        const checkpoint = result[0];
        const data: CheckpointData = {
          threadId: checkpoint.threadId,
          userId: String(checkpoint.userId),
          checkpoint: JSON.parse(checkpoint.checkpoint),
          timestamp: checkpoint.updatedAt.getTime(),
          metadata: checkpoint.metadata ? JSON.parse(checkpoint.metadata) : {},
        };

        console.log(
          `[Checkpointer] Retrieved checkpoint for thread ${threadId} from database`
        );
        return data;
      }
    } catch (error) {
      console.error("[Checkpointer] Error retrieving checkpoint from database:", error);
    }

    return null;
  }

  /**
   * List all checkpoints for a user
   */
  async listForUser(userId: string, limit: number = 10): Promise<CheckpointData[]> {
    const checkpointsList: CheckpointData[] = [];

    try {
      const db = await getDb();
      if (!db) {
        console.warn("[Checkpointer] Database not available");
        return [];
      }

      const userIdNum = typeof userId === "string" ? parseInt(userId, 10) : userId;

      const results = await db
        .select()
        .from(checkpoints)
        .where(eq(checkpoints.userId, userIdNum))
        .limit(limit);

      for (const checkpoint of results) {
        checkpointsList.push({
          threadId: checkpoint.threadId,
          userId: String(checkpoint.userId),
          checkpoint: JSON.parse(checkpoint.checkpoint),
          timestamp: checkpoint.updatedAt.getTime(),
          metadata: checkpoint.metadata ? JSON.parse(checkpoint.metadata) : {},
        });
      }

      console.log(
        `[Checkpointer] Listed ${checkpointsList.length} checkpoints for user ${userId}`
      );
    } catch (error) {
      console.error("[Checkpointer] Error listing checkpoints:", error);
    }

    return checkpointsList;
  }

  /**
   * Update checkpoint with new values
   */
  async update(
    threadId: string,
    updates: Record<string, any>
  ): Promise<void> {
    const checkpoint = this.shortTermMemory.get(threadId);
    if (checkpoint) {
      // Merge updates
      checkpoint.checkpoint = { ...checkpoint.checkpoint, ...updates };
      checkpoint.timestamp = Date.now();

      // Update database
      try {
        const db = await getDb();
        if (!db) {
          console.warn("[Checkpointer] Database not available");
          return;
        }

        await db
          .update(checkpoints)
          .set({
            checkpoint: JSON.stringify(checkpoint.checkpoint),
            updatedAt: new Date(),
          })
          .where(eq(checkpoints.threadId, threadId));

        console.log(`[Checkpointer] Updated checkpoint for thread ${threadId}`);
      } catch (error) {
        console.error("[Checkpointer] Error updating checkpoint:", error);
      }
    }
  }

  /**
   * Clear short-term memory for a thread
   */
  clearThread(threadId: string): void {
    this.shortTermMemory.delete(threadId);
    console.log(`[Checkpointer] Cleared short-term memory for thread ${threadId}`);
  }

  /**
   * Get all thread IDs for a user
   */
  async getThreadsForUser(userId: string): Promise<string[]> {
    const threads: string[] = [];

    try {
      const db = await getDb();
      if (!db) {
        console.warn("[Checkpointer] Database not available");
        return [];
      }

      const userIdNum = typeof userId === "string" ? parseInt(userId, 10) : userId;

      const results = await db
        .select()
        .from(checkpoints)
        .where(eq(checkpoints.userId, userIdNum));

      for (const checkpoint of results) {
        threads.push(checkpoint.threadId);
      }

      console.log(`[Checkpointer] Found ${threads.length} threads for user ${userId}`);
    } catch (error) {
      console.error("[Checkpointer] Error getting threads:", error);
    }

    return threads;
  }

  /**
   * Get memory stats
   */
  getStats(): {
    shortTermMemorySize: number;
    threads: number;
  } {
    return {
      shortTermMemorySize: this.shortTermMemory.size,
      threads: this.shortTermMemory.size,
    };
  }
}

// Global checkpointer instance
let checkpointerInstance: DatabaseCheckpointer | null = null;

export function getCheckpointer(): DatabaseCheckpointer {
  if (!checkpointerInstance) {
    checkpointerInstance = new DatabaseCheckpointer();
  }
  return checkpointerInstance;
}
