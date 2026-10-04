import { and, desc, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { PlanReviewRepository } from "@/core/application/ports";
import {
  SuggestionStatus,
  type PlanReview,
  type PlanSuggestion,
  type ReviewWithSuggestions,
} from "@/core/domain/review/plan-review.entity";

import type { Database } from "../client";
import { planReviews, planSuggestions } from "../schema";
import { toPlanReview, toPlanSuggestion } from "./mappers";

export class DrizzlePlanReviewRepository implements PlanReviewRepository {
  constructor(private readonly db: Database) {}

  async listRecent(planId: string, limit: number): Promise<ReviewWithSuggestions[]> {
    const reviews = await this.db.query.planReviews.findMany({
      where: eq(planReviews.planId, planId),
      orderBy: desc(planReviews.createdAt),
      limit,
    });
    if (reviews.length === 0) return [];

    const suggestions = await this.db.query.planSuggestions.findMany({
      where: inArray(
        planSuggestions.reviewId,
        reviews.map((review) => review.id)
      ),
      orderBy: planSuggestions.sortOrder,
    });

    return reviews.map((review) => ({
      review: toPlanReview(review),
      suggestions: suggestions
        .filter((suggestion) => suggestion.reviewId === review.id)
        .map(toPlanSuggestion),
    }));
  }

  /** Um `batch` do neon-http: aposentar, gravar a revisão e as sugestões, tudo ou nada. */
  async submit(review: PlanReview, suggestions: readonly PlanSuggestion[]): Promise<void> {
    const statements: BatchItem<"pg">[] = [
      this.db
        .update(planSuggestions)
        .set({ status: SuggestionStatus.SUPERSEDED })
        .where(
          and(
            eq(planSuggestions.planId, review.planId),
            eq(planSuggestions.status, SuggestionStatus.PENDING)
          )
        ),
      this.db.insert(planReviews).values(review),
    ];
    if (suggestions.length > 0) {
      statements.push(this.db.insert(planSuggestions).values([...suggestions]));
    }

    await this.db.batch(statements as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  }

  async findSuggestion(id: string): Promise<PlanSuggestion | null> {
    const row = await this.db.query.planSuggestions.findFirst({
      where: eq(planSuggestions.id, id),
    });
    return row ? toPlanSuggestion(row) : null;
  }

  async saveSuggestion(suggestion: PlanSuggestion): Promise<void> {
    await this.db
      .update(planSuggestions)
      .set({ status: suggestion.status, decidedAt: suggestion.decidedAt })
      .where(eq(planSuggestions.id, suggestion.id));
  }
}
