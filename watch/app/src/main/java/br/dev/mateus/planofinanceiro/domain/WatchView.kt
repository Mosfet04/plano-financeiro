package br.dev.mateus.planofinanceiro.domain

import java.time.LocalDate
import java.time.YearMonth

/** O que as telas e o tile mostram, já com a fila e a data de hoje aplicadas. */
data class WatchView(
    val today: LocalDate,
    val cash: DailyAllowance,
    val mealCard: DailyAllowance,
    val categories: List<CategoryView>,
) {
    fun of(source: Source) = if (source == Source.CASH) cash else mealCard
}

data class CategoryView(
    val id: String,
    val name: String,
    val icon: String,
    val defaultSource: Source,
    val budget: Cents,
    val cashSpent: Cents,
    val mealCardSpent: Cents,
) {
    val cashRemaining: Cents get() = budget - cashSpent
}

/**
 * Refaz a conta do dia a partir do último snapshot. É o que deixa o relógio
 * certo sem rede: à meia-noite o gasto de hoje vira de ontem, na virada do mês
 * o ledger zera com os orçamentos do mês seguinte, e o que está na fila entra
 * na conta antes de subir.
 */
fun buildView(snapshot: WatchSnapshot, queue: List<PendingOp>, today: LocalDate): WatchView {
    val month = YearMonth.from(today)
    val sameMonth = YearMonth.parse(snapshot.month) == month
    val dayChanged = today > LocalDate.parse(snapshot.today)

    var cash = if (sameMonth) snapshot.ledger.cash else DaySplit.EMPTY
    var mealCard = if (sameMonth) snapshot.ledger.mealCard else DaySplit.EMPTY
    if (sameMonth && dayChanged) {
        cash = cash.rolledOver()
        mealCard = mealCard.rolledOver()
    }
    val cashBudget = if (sameMonth) snapshot.cash.monthBudget else snapshot.nextMonth.cashBudget
    val credit = if (sameMonth) snapshot.ledger.mealCardCredit else snapshot.nextMonth.mealCardBudget

    val categories = snapshot.categories.associate { category ->
        category.id to CategoryView(
            id = category.id,
            name = category.name,
            icon = category.icon,
            defaultSource = category.defaultPaymentMethod,
            budget = category.budget,
            cashSpent = if (sameMonth) category.cashSpent else Cents.ZERO,
            mealCardSpent = if (sameMonth) category.mealCardSpent else Cents.ZERO,
        )
    }.toMutableMap()

    for (op in queue) {
        val date = LocalDate.parse(op.date)
        if (YearMonth.from(date) != month) continue
        val delta = if (op is PendingOp.Delete) -op.amount else op.amount
        val isToday = date >= today
        when (op.source) {
            Source.CASH -> cash = cash.add(delta, isToday)
            Source.MEAL_CARD -> mealCard = mealCard.add(delta, isToday)
        }
        categories[op.categoryId]?.let { category ->
            categories[op.categoryId] = when (op.source) {
                Source.CASH -> category.copy(cashSpent = category.cashSpent + delta)
                Source.MEAL_CARD -> category.copy(mealCardSpent = category.mealCardSpent + delta)
            }
        }
    }

    val allocated = moveMealCardOverflow(Spending(cash, mealCard), credit)
    return WatchView(
        today = today,
        cash = dailyAllowance(cashBudget, allocated.cash, today),
        mealCard = dailyAllowance(credit, allocated.mealCard, today),
        categories = snapshot.categories.mapNotNull { categories[it.id] },
    )
}
