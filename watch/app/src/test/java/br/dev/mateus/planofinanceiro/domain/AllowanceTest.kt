package br.dev.mateus.planofinanceiro.domain

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

/** Os mesmos casos dos testes de `tests/unit/spending` no servidor: os dois têm de bater. */
class AllowanceTest {
    private fun reais(value: Double) = Cents(Math.round(value * 100))
    private fun allowance(today: String, budget: Double, before: Double = 0.0, todaySpent: Double = 0.0) =
        dailyAllowance(reais(budget), DaySplit(reais(before), reais(todaySpent)), LocalDate.parse(today))

    @Test fun `dia 1 divide o mes inteiro`() {
        val result = allowance("2026-10-01", 930.0)
        assertEquals(31, result.daysLeft)
        assertEquals(reais(30.0), result.dayBudget)
        assertEquals(reais(930.0), result.monthRemaining)
    }

    @Test fun `ultimo dia e o que sobrou`() {
        val result = allowance("2026-10-31", 930.0, before = 900.0)
        assertEquals(1, result.daysLeft)
        assertEquals(reais(30.0), result.dayBudget)
    }

    @Test fun `gasto de hoje sai inteiro do dia`() {
        val result = allowance("2026-10-21", 930.0, before = 500.0, todaySpent = 50.0)
        assertEquals(reais(39.09), result.dayBudget)
        assertEquals(reais(-10.91), result.remainingToday)
        assertEquals(reais(380.0), result.monthRemaining)
    }

    @Test fun `mes estourado divide o buraco`() {
        assertEquals(reais(-10.0), allowance("2026-10-22", 900.0, before = 1000.0).dayBudget)
    }

    @Test fun `orcamento zero fica em zero`() {
        assertEquals(Cents.ZERO, allowance("2026-10-15", 0.0).remainingToday)
    }

    @Test fun `arredonda para baixo tambem no negativo`() {
        assertEquals(reais(0.32), allowance("2026-10-01", 10.0).dayBudget)
        assertEquals(reais(-0.33), allowance("2026-10-01", -10.0).dayBudget)
    }

    @Test fun `meses de 28 29 30 e 31 dias`() {
        assertEquals(28, allowance("2026-02-01", 100.0).daysLeft)
        assertEquals(29, allowance("2028-02-01", 100.0).daysLeft)
        assertEquals(30, allowance("2026-11-01", 100.0).daysLeft)
        assertEquals(31, allowance("2026-12-01", 100.0).daysLeft)
    }

    @Test fun `estouro do VA vira Dinheiro no dia em que estourou`() {
        val result = moveMealCardOverflow(
            Spending(DaySplit(reais(10.0), Cents.ZERO), DaySplit(reais(880.0), reais(50.0))),
            credit = reais(900.0),
        )
        assertEquals(DaySplit(reais(880.0), reais(20.0)), result.mealCard)
        assertEquals(DaySplit(reais(10.0), reais(30.0)), result.cash)
    }

    @Test fun `estouro antigo fica antes de hoje`() {
        val result = moveMealCardOverflow(
            Spending(DaySplit.EMPTY, DaySplit(reais(950.0), reais(40.0))),
            credit = reais(900.0),
        )
        assertEquals(DaySplit(reais(900.0), Cents.ZERO), result.mealCard)
        assertEquals(DaySplit(reais(50.0), reais(40.0)), result.cash)
    }

    @Test fun `formata como o PWA`() {
        assertEquals("1.240,40", Cents(124040).formatAmount())
        assertEquals("−R$ 2.435,52", Cents(-243552).formatBRL())
        assertEquals("R$ 0,05", Cents(5).formatBRL())
    }
}
