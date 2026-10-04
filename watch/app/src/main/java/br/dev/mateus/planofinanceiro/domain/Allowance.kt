package br.dev.mateus.planofinanceiro.domain

import kotlinx.serialization.Serializable
import java.time.LocalDate

/** Gasto de uma fonte, cortado em hoje. */
@Serializable
data class DaySplit(val beforeToday: Cents, val today: Cents) {
    fun add(amount: Cents, isToday: Boolean) =
        if (isToday) copy(today = today + amount) else copy(beforeToday = beforeToday + amount)

    /** O dia virou: o que era de hoje passa a ser de antes. */
    fun rolledOver() = DaySplit(beforeToday + today, Cents.ZERO)

    companion object {
        val EMPTY = DaySplit(Cents.ZERO, Cents.ZERO)
    }
}

data class Spending(val cash: DaySplit, val mealCard: DaySplit)

/**
 * O VA para no crédito: o que passa dele sai do bolso e entra no Dinheiro no
 * dia em que estourou. Porte de `moveMealCardOverflow` do servidor.
 */
fun moveMealCardOverflow(raw: Spending, credit: Cents): Spending {
    val total = raw.mealCard.beforeToday + raw.mealCard.today
    val overflowBefore = maxOf(raw.mealCard.beforeToday - credit, Cents.ZERO)
    val overflowToday = maxOf(total - credit, Cents.ZERO) - overflowBefore
    return Spending(
        cash = DaySplit(raw.cash.beforeToday + overflowBefore, raw.cash.today + overflowToday),
        mealCard = DaySplit(minOf(raw.mealCard.beforeToday, credit), raw.mealCard.today - overflowToday),
    )
}

data class DailyAllowance(
    val monthBudget: Cents,
    /** Dias que faltam no mês, contando hoje. */
    val daysLeft: Int,
    val dayBudget: Cents,
    /** Negativo = passou do limite de hoje. */
    val remainingToday: Cents,
    val monthRemaining: Cents,
)

/**
 * `(orçamento do mês − gasto até ontem) ÷ dias que faltam − gasto de hoje`.
 * Porte de `dailyAllowance` do servidor: mesma divisão para baixo, mesmo
 * negativo dividido quando o mês estoura.
 */
fun dailyAllowance(monthBudget: Cents, spent: DaySplit, today: LocalDate): DailyAllowance {
    val daysLeft = today.lengthOfMonth() - today.dayOfMonth + 1
    val leftBeforeToday = monthBudget - spent.beforeToday
    val dayBudget = Cents(Math.floorDiv(leftBeforeToday.value, daysLeft.toLong()))
    return DailyAllowance(
        monthBudget = monthBudget,
        daysLeft = daysLeft,
        dayBudget = dayBudget,
        remainingToday = dayBudget - spent.today,
        monthRemaining = leftBeforeToday - spent.today,
    )
}
