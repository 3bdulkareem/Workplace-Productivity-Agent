import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { nanoid } from "nanoid";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  chat: router({
    createConversation: protectedProcedure
      .input(z.object({ threadId: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const threadId = input.threadId || nanoid();
        const conversation = await db.getOrCreateConversation(ctx.user.id, threadId);
        return conversation;
      }),

    getConversations: protectedProcedure
      .query(async ({ ctx }) => {
        return db.getConversationsByUser(ctx.user.id);
      }),

    getMessages: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ input }) => {
        return db.getConversationMessages(input.conversationId);
      }),

    sendMessage: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        content: z.string(),
      }))
      .mutation(async ({ input }) => {
        await db.addMessage(input.conversationId, "user", input.content);
        return { success: true };
      }),

    addAssistantMessage: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        content: z.string(),
        agentType: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        await db.addMessage(input.conversationId, "assistant", input.content, input.agentType);
        return { success: true };
      }),

    createInterrupt: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        messageId: z.number(),
        interruptMessage: z.string(),
      }))
      .mutation(async ({ input }) => {
        await db.createInterrupt(input.conversationId, input.messageId, input.interruptMessage);
        return { success: true };
      }),

    getPendingInterrupt: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ input }) => {
        return db.getPendingInterrupt(input.conversationId);
      }),

    resolveInterrupt: protectedProcedure
      .input(z.object({
        interruptId: z.number(),
        status: z.enum(["approved", "rejected"]),
      }))
      .mutation(async ({ input }) => {
        await db.resolveInterrupt(input.interruptId, input.status);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
