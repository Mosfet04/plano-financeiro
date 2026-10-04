package br.dev.mateus.planofinanceiro.domain

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

class WatchViewTest {
    private val snapshot = WatchSnapshot(
        today = "2026-10-15",
        month = "2026-10",
        cash = MonthBudget(Cents(170_000)),
        mealCard = MonthBudget(Cents(90_000)),
        ledger = Ledger(
            cash = DaySplit(Cents(30_000), Cents(2_000)),
            mealCard = DaySplit(Cents(10_000), Cents(0)),
            mealCardCredit = Cents(90_000),
        ),
        nextMonth = NextMonth("2026-11", Cents(150_000), Cents(90_000)),
        categories = listOf(Category("mercado", "Mercado", "shopping-cart", Source.MEAL_CARD, Cents(0), Cents(0), Cents(10_000))),
        plan = PlanSummary(minCash = Cents(0), monthlyTopUp = Cents(0)),
    )

    @Test fun `no mesmo dia usa o snapshot como veio`() {
        val view = buildView(snapshot, emptyList(), LocalDate.parse("2026-10-15"))
        // (1.700 − 300) ÷ 17 = 82,35; menos os 20 de hoje.
        assertEquals(Cents(8_235), view.cash.dayBudget)
        assertEquals(Cents(6_235), view.cash.remainingToday)
    }

    @Test fun `a meia-noite o gasto de hoje vira de ontem, sem rede`() {
        val view = buildView(snapshot, emptyList(), LocalDate.parse("2026-10-16"))
        // (1.700 − 320) ÷ 16 = 86,25.
        assertEquals(Cents(8_625), view.cash.dayBudget)
        assertEquals(Cents(8_625), view.cash.remainingToday)
    }

    @Test fun `na virada do mes zera com os orcamentos do mes seguinte`() {
        val view = buildView(snapshot, emptyList(), LocalDate.parse("2026-11-01"))
        assertEquals(Cents(5_000), view.cash.dayBudget) // 1.500 ÷ 30
        assertEquals(Cents(3_000), view.mealCard.dayBudget) // 900 ÷ 30
        assertEquals(Cents.ZERO, view.categories.single().mealCardSpent)
    }

    @Test fun `lancamento na fila entra na conta e na categoria`() {
        val queued = PendingOp.Create("k", Cents(2_390), Source.MEAL_CARD, "mercado", "2026-10-15")
        val view = buildView(snapshot, listOf(queued), LocalDate.parse("2026-10-15"))
        assertEquals(view.mealCard.dayBudget - Cents(2_390), view.mealCard.remainingToday)
        assertEquals(Cents(12_390), view.categories.single().mealCardSpent)
    }

    @Test fun `desfazer na fila devolve o valor`() {
        val undo = PendingOp.Delete("t-1", Cents(2_000), Source.CASH, "mercado", "2026-10-15")
        val view = buildView(snapshot, listOf(undo), LocalDate.parse("2026-10-15"))
        assertEquals(view.cash.dayBudget, view.cash.remainingToday)
    }

    @Test fun `lancamento de ontem na fila conta antes de hoje`() {
        val yesterday = PendingOp.Create("k", Cents(1_600), Source.CASH, "mercado", "2026-10-14")
        val view = buildView(snapshot, listOf(yesterday), LocalDate.parse("2026-10-15"))
        // (1.700 − 316) ÷ 17 = 81,41
        assertEquals(Cents(8_141), view.cash.dayBudget)
    }
}
