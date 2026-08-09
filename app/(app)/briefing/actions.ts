"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  abandonBriefing,
  briefingGroups,
  createBriefingSession,
  finaliseBriefing,
  runBriefingGroup,
  type BriefingGroupResult,
  type BriefingProgress,
} from "@/lib/briefing";
import { requireUserIdOrThrow } from "@/lib/session";

/**
 * The briefing in three actions instead of one.
 *
 * A single action ran the whole debate — four currency groups, five rounds
 * each — and could not finish inside a serverless function's sixty seconds.
 * It was killed after writing most of its rounds but before computing the
 * consensus, which is why the page showed a full briefing and no verdict.
 *
 * The client now opens a session, runs the groups CONCURRENTLY, and asks for
 * the consensus at the end. Each invocation carries one group.
 */

const SESSION = z.string().min(1).max(64);

export async function openBriefing(): Promise<{
  sessionId: string;
  groups: Array<{ index: number; label: string }>;
}> {
  const userId = await requireUserIdOrThrow();
  const sessionId = await createBriefingSession(userId);
  return { sessionId, groups: briefingGroups() };
}

const groupInput = z.object({ sessionId: SESSION, groupIndex: z.number().int().min(0).max(15) });

export async function runBriefingGroupAction(input: unknown): Promise<BriefingGroupResult> {
  const userId = await requireUserIdOrThrow();
  const { sessionId, groupIndex } = groupInput.parse(input);
  return runBriefingGroup(userId, sessionId, groupIndex);
}

export async function closeBriefing(input: unknown): Promise<BriefingProgress> {
  const userId = await requireUserIdOrThrow();
  const sessionId = SESSION.parse(input);

  const result = await finaliseBriefing(userId, sessionId);
  revalidatePath("/briefing");
  return result;
}

export async function failBriefing(input: unknown): Promise<void> {
  await requireUserIdOrThrow();
  const { sessionId, reason } = z
    .object({ sessionId: SESSION, reason: z.string().max(300) })
    .parse(input);

  await abandonBriefing(sessionId, reason);
  revalidatePath("/briefing");
}
