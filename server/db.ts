import { eq, and, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, conversations, messages, interrupts, Conversation, Message, Interrupt } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Conversation queries
export async function getOrCreateConversation(userId: number, threadId: string): Promise<Conversation> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(conversations).where(eq(conversations.threadId, threadId)).limit(1);
  if (existing.length > 0) {
    return existing[0];
  }

  const result = await db.insert(conversations).values({
    userId,
    threadId,
    title: "New Conversation",
  });

  const created = await db.select().from(conversations).where(eq(conversations.threadId, threadId)).limit(1);
  return created[0];
}

export async function getConversationsByUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select().from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt));
}

export async function updateConversationTitle(conversationId: number, title: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.update(conversations)
    .set({ title, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

// Message queries
export async function addMessage(conversationId: number, role: "user" | "assistant" | "system", content: string, agentType?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.insert(messages).values({
    conversationId,
    role,
    content,
    agentType,
  });
}

export async function getConversationMessages(conversationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);
}

// Interrupt queries
export async function createInterrupt(conversationId: number, messageId: number, interruptMessage: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.insert(interrupts).values({
    conversationId,
    messageId,
    interruptMessage,
    status: "pending",
  });
}

export async function getPendingInterrupt(conversationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.select().from(interrupts)
    .where(and(
      eq(interrupts.conversationId, conversationId),
      eq(interrupts.status, "pending")
    ))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function resolveInterrupt(interruptId: number, status: "approved" | "rejected") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.update(interrupts)
    .set({ status, resolvedAt: new Date() })
    .where(eq(interrupts.id, interruptId));
}
