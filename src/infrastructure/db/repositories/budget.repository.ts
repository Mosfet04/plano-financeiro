import { and, asc, eq, gte, lte } from "drizzle-orm";

import type {
  BudgetCategoryRepository,
  GoalRepository,
  RecurringItemRepository,
  TransactionRepository,
} from "@/core/application/ports";
import type { BudgetCategory } from "@/core/domain/budget/budget-category.entity";
import type { RecurringItem } from "@/core/domain/expense/recurring-item.entity";
import type { Goal } from "@/core/domain/goal/goal.entity";
import { daysInMonth, type YearMonth } from "@/core/domain/shared/month";
import type { Transaction } from "@/core/domain/transaction/transaction.entity";

import type { Database } from "../client";
import { budgetCategories, goals, recurringItems, transactions } from "../schema";
import { toBudgetCategory, toGoal, toRecurringItem, toTransaction } from "./mappers";

export class DrizzleRecurringItemRepository implements RecurringItemRepository {
  constructor(private readonly db: Database) {}

  async listByPlan(planId: string): Promise<RecurringItem[]> {
    const rows = await this.db.query.recurringItems.findMany({
      where: eq(recurringItems.planId, planId),
      orderBy: asc(recurringItems.sortOrder),
    });
    return rows.map(toRecurringItem);
  }

  async findById(id: string): Promise<RecurringItem | null> {
    const row = await this.db.query.recurringItems.findFirst({
      where: eq(recurringItems.id, id),
    });
    return row ? toRecurringItem(row) : null;
  }

  async save(item: RecurringItem): Promise<void> {
    const values = {
      id: item.id,
      planId: item.planId,
      name: item.name,
      direction: item.direction,
      group: item.group,
      amountCents: item.amount,
      dueDay: item.dueDay,
      startsOn: item.startsOn,
      endsOn: item.endsOn,
      active: item.active,
      sortOrder: item.sortOrder,
    };

    await this.db
      .insert(recurringItems)
      .values(values)
      .onConflictDoUpdate({ target: recurringItems.id, set: values });
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(recurringItems).where(eq(recurringItems.id, id));
  }
}

export class DrizzleBudgetCategoryRepository implements BudgetCategoryRepository {
  constructor(private readonly db: Database) {}

  async listByPlan(planId: string): Promise<BudgetCategory[]> {
    const rows = await this.db.query.budgetCategories.findMany({
      where: eq(budgetCategories.planId, planId),
      orderBy: asc(budgetCategories.sortOrder),
    });
    return rows.map(toBudgetCategory);
  }

  async findById(id: string): Promise<BudgetCategory | null> {
    const row = await this.db.query.budgetCategories.findFirst({
      where: eq(budgetCategories.id, id),
    });
    return row ? toBudgetCategory(row) : null;
  }

  async save(category: BudgetCategory): Promise<void> {
    const values = {
      id: category.id,
      planId: category.planId,
      name: category.name,
      monthlyBudgetCents: category.monthlyBudget,
      defaultPaymentMethod: category.defaultPaymentMethod,
      color: category.color,
      active: category.active,
      sortOrder: category.sortOrder,
    };

    await this.db
      .insert(budgetCategories)
      .values(values)
      .onConflictDoUpdate({ target: budgetCategories.id, set: values });
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(budgetCategories).where(eq(budgetCategories.id, id));
  }
}

export class DrizzleGoalRepository implements GoalRepository {
  constructor(private readonly db: Database) {}

  async listByPlan(planId: string): Promise<Goal[]> {
    const rows = await this.db.query.goals.findMany({
      where: eq(goals.planId, planId),
      orderBy: asc(goals.sortOrder),
    });
    return rows.map(toGoal);
  }

  async findById(id: string): Promise<Goal | null> {
    const row = await this.db.query.goals.findFirst({ where: eq(goals.id, id) });
    return row ? toGoal(row) : null;
  }

  async save(goal: Goal): Promise<void> {
    const values = {
      id: goal.id,
      planId: goal.planId,
      name: goal.name,
      amountCents: goal.amount,
      targetMonth: goal.targetMonth,
      fundingSource: goal.fundingSource,
      note: goal.note,
      status: goal.status,
      sortOrder: goal.sortOrder,
      updatedAt: new Date(),
    };

    await this.db
      .insert(goals)
      .values(values)
      .onConflictDoUpdate({ target: goals.id, set: values });
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(goals).where(eq(goals.id, id));
  }
}

export class DrizzleTransactionRepository implements TransactionRepository {
  constructor(private readonly db: Database) {}

  async listByMonth(planId: string, month: YearMonth): Promise<Transaction[]> {
    // A data é texto "YYYY-MM-DD", então a comparação lexicográfica dá o mês.
    const last = String(daysInMonth(month)).padStart(2, "0");
    const rows = await this.db.query.transactions.findMany({
      where: and(
        eq(transactions.planId, planId),
        gte(transactions.date, `${month}-01`),
        lte(transactions.date, `${month}-${last}`)
      ),
      orderBy: [asc(transactions.date), asc(transactions.createdAt)],
    });
    return rows.map(toTransaction);
  }

  async findById(id: string): Promise<Transaction | null> {
    const row = await this.db.query.transactions.findFirst({ where: eq(transactions.id, id) });
    return row ? toTransaction(row) : null;
  }

  async save(transaction: Transaction): Promise<void> {
    const values = {
      id: transaction.id,
      planId: transaction.planId,
      date: transaction.date,
      description: transaction.description,
      kind: transaction.kind,
      categoryId: transaction.categoryId,
      goalId: transaction.goalId,
      paymentMethod: transaction.paymentMethod,
      amountCents: transaction.amount,
    };

    await this.db
      .insert(transactions)
      .values(values)
      .onConflictDoUpdate({ target: transactions.id, set: values });
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(transactions).where(eq(transactions.id, id));
  }
}
