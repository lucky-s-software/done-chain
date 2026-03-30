import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildAttentionWindow, getRecentConversationHistory } from "@/lib/ai/attention";
import { buildNormalizedTags, persistExtraction } from "@/lib/ai/extractions";
import { parseUserMessage } from "@/lib/ai/parser";
import {
  getClarificationState,
  startClarification,
  advanceClarification,
  resolveClarification,
  deriveTopicKey,
} from "@/lib/ai/clarification";
import { getProfile, updateProfileFromConversation } from "@/lib/engine/profile";
import { runPromptImprover } from "@/lib/ai/promptImprover";
import { createAiUsageCollector } from "@/lib/ai/usageTelemetry";

export async function POST(req: NextRequest) {
  try {
    const aiUsage = createAiUsageCollector();
    const body = await req.json();
    const content = typeof body?.content === "string" ? body.content : "";
    const thinkingMode = Boolean(body?.thinkingMode);

    if (!content?.trim()) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    // 1. Save user message
    const userMessage = await prisma.message.create({
      data: { role: "user", content },
    });

    // 2. Build attention window + recent conversation history
    const recentConversationHistory = await getRecentConversationHistory(prisma, 12);
    const profile = await getProfile().catch((error) => {
      console.warn("[chat] profile unavailable:", error);
      return "";
    });

    // 2a. Run prompt improver (knowledge selection + intent enrichment)
    const { knowledgeContent, enrichedContext } = await runPromptImprover(
      content,
      profile,
      aiUsage.push
    ).catch(
      () => ({ knowledgeContent: "", enrichedContext: "" })
    );

    const knowledgeContext = [enrichedContext, knowledgeContent].filter(Boolean).join("\n\n") || undefined;

    const attentionContext = await buildAttentionWindow(prisma, recentConversationHistory, {
      profile: profile || undefined,
      knowledgeContext,
      includeRecentMessages: false,
    });

    // 3. Manage clarification lifecycle
    const topicKey = deriveTopicKey(content);
    const clarificationState = getClarificationState(topicKey);

    // 3. Parse with DeepSeek
    const { reply, extractions, followUpQuestions, suggestedActions } = await parseUserMessage(
      content,
      attentionContext,
      recentConversationHistory.map(({ role, content: messageContent }) => ({
        role,
        content: messageContent,
      })),
      clarificationState !== "none" ? topicKey : undefined,
      aiUsage.push,
      { thinkingMode }
    );

    // Update clarification state based on follow-up questions in response
    if (followUpQuestions.length > 0) {
      if (clarificationState === "none") {
        startClarification(topicKey, content, followUpQuestions);
      } else if (clarificationState === "round_1") {
        advanceClarification(topicKey, followUpQuestions);
      } else if (clarificationState === "round_2") {
        resolveClarification(topicKey);
      }
    } else if (clarificationState !== "none") {
      resolveClarification(topicKey);
    }

    // 4. Save assistant message
    const assistantMessage = await prisma.message.create({
      data: { role: "assistant", content: reply },
    });

    let memoriesCreated = 0;
    const actionCardTaskIds = new Set<string>();

    // 5. Process extractions
    for (const ext of extractions) {
      const normalizedTags = buildNormalizedTags(ext);
      const persisted = await persistExtraction(prisma, ext, userMessage.id);

      if (ext.type === "memory" && persisted.entryId) {
        await prisma.entry.update({
          where: { id: persisted.entryId },
          data: { reviewed: true },
        });

        await prisma.actionCard.create({
          data: {
            messageId: assistantMessage.id,
            cardType: "proposed_memory",
            payload: {
              entryId: persisted.entryId,
              content: ext.content,
              tags: normalizedTags,
              confidence: ext.confidence,
            },
            status: "pending",
          },
        });

        if (persisted.createdMemory) {
          memoriesCreated++;
        }
      } else if ((ext.type === "task" || ext.type === "reminder") && persisted.taskId) {
        if (persisted.taskDisposition === "duplicate_existing") {
          continue;
        }

        if (actionCardTaskIds.has(persisted.taskId)) {
          continue;
        }

        const toIso = (value: Date | null | undefined): string | null =>
          value ? value.toISOString() : null;

        const updateMode = persisted.taskDisposition === "updated_existing";
        const existingTask = persisted.existingTask;
        const proposedEdits = persisted.proposedTaskEdits;

        const payload = updateMode && existingTask
          ? {
              taskId: persisted.taskId,
              title: proposedEdits?.title ?? existingTask.title,
              content: ext.content,
              dueAt: toIso(
                proposedEdits?.dueAt !== undefined ? proposedEdits.dueAt : existingTask.dueAt
              ),
              dueType: existingTask.dueType,
              reminderAt: toIso(existingTask.reminderAt),
              estimatedMinutes:
                proposedEdits?.estimatedMinutes !== undefined
                  ? proposedEdits.estimatedMinutes
                  : existingTask.estimatedMinutes,
              executionStartAt: toIso(
                proposedEdits?.executionStartAt !== undefined
                  ? proposedEdits.executionStartAt
                  : existingTask.executionStartAt
              ),
              tags: proposedEdits?.tags ?? existingTask.tags,
              person: ext.person ?? existingTask.person ?? null,
              confidence: ext.confidence,
              proposalMode: "update",
              existingTaskTitle: existingTask.title,
              proposedEdits: {
                ...(proposedEdits?.title ? { title: proposedEdits.title } : {}),
                ...(proposedEdits?.dueAt !== undefined
                  ? { dueAt: toIso(proposedEdits.dueAt) }
                  : {}),
                ...(proposedEdits?.estimatedMinutes !== undefined
                  ? { estimatedMinutes: proposedEdits.estimatedMinutes }
                  : {}),
                ...(proposedEdits?.executionStartAt !== undefined
                  ? { executionStartAt: toIso(proposedEdits.executionStartAt) }
                  : {}),
                ...(proposedEdits?.tags ? { tags: proposedEdits.tags } : {}),
                ...(proposedEdits?.personId !== undefined
                  ? { personId: proposedEdits.personId }
                  : {}),
                ...(proposedEdits?.projectId !== undefined
                  ? { projectId: proposedEdits.projectId }
                  : {}),
              },
            }
          : {
              taskId: persisted.taskId,
              title: ext.title,
              content: ext.content,
              dueAt: ext.dueAt?.toISOString() ?? null,
              dueType: ext.dueType,
              reminderAt: ext.reminderAt?.toISOString() ?? null,
              estimatedMinutes: ext.estimatedMinutes ?? null,
              executionStartAt: ext.executionStartAt?.toISOString() ?? null,
              tags: normalizedTags,
              person: ext.person,
              confidence: ext.confidence,
              proposalMode: "create",
            };

        await prisma.actionCard.create({
          data: {
            messageId: assistantMessage.id,
            cardType: "proposed_task",
            payload,
            status: "pending",
          },
        });
        actionCardTaskIds.add(persisted.taskId);
      }
    }

    // 6. Log credits
    await prisma.creditLedger.create({
      data: {
        eventType: "parse",
        credits: 1 + extractions.length,
      },
    });

    const shouldRefreshProfile =
      !profile ||
      content.trim().split(/\s+/).length >= 16 ||
      extractions.some((item) => item.type === "memory");
    if (shouldRefreshProfile) {
      const excerpt = `[USER]: ${content}\n[ASSISTANT]: ${reply}`;
      await updateProfileFromConversation(excerpt).catch((error) =>
        console.warn("[chat] profile refresh failed:", error)
      );
    }

    // 7. Return full response with action cards
    const fullMessage = await prisma.message.findUnique({
      where: { id: assistantMessage.id },
      include: { actionCards: true },
    });
    const aiUsageReport = aiUsage.report();
    console.info("[chat] deepseek usage", aiUsageReport);

    return NextResponse.json({
      message: fullMessage,
      memoriesCreated,
      followUpQuestions,
      suggestedActions,
      aiUsage: aiUsageReport,
    });
  } catch (err) {
    console.error("[chat] error:", err);
    const details = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to process message", details },
      { status: 500 }
    );
  }
}
