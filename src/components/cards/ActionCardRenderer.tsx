"use client";

import { ProposedTaskCard } from "./ProposedTaskCard";
import { ProposedMemoryCard } from "./ProposedMemoryCard";
import { ConfirmCommitmentCard } from "./ConfirmCommitmentCard";
import { SuggestionCard } from "./SuggestionCard";
import { ClarificationCard } from "./ClarificationCard";
import { SummaryNoticeCard } from "./SummaryNoticeCard";
import type { ActionCard } from "@/types";

type CardAction = "approve" | "reject" | "dismiss";

interface ActionCardRendererProps {
  card: ActionCard;
  onAction: (
    cardId: string,
    action: CardAction,
    edits?: {
      title?: string;
      dueAt?: string | null;
      tags?: string[];
      estimatedMinutes?: number | null;
      executionStartAt?: string | null;
    }
  ) => Promise<void>;
}

export function ActionCardRenderer({ card, onAction }: ActionCardRendererProps) {
  switch (card.cardType) {
    case "proposed_task":
      return <ProposedTaskCard card={card} onAction={onAction} />;
    case "proposed_memory":
      return <ProposedMemoryCard card={card} onAction={onAction} />;
    case "confirm_commitment":
      return <ConfirmCommitmentCard card={card} onAction={onAction} />;
    case "suggestion":
      return <SuggestionCard card={card} onAction={onAction} />;
    case "clarification":
      return <ClarificationCard card={card} onAction={onAction} />;
    case "summary_notice":
      return <SummaryNoticeCard card={card} onAction={onAction} />;
    default:
      return null;
  }
}
