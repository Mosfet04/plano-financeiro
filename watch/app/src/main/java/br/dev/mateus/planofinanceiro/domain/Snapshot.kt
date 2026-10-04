package br.dev.mateus.planofinanceiro.domain

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** De onde sai o gasto. Os nomes são os do servidor. */
@Serializable
enum class Source { CASH, MEAL_CARD }

/** O que `GET /api/watch/snapshot` devolve — só os campos que o relógio usa. */
@Serializable
data class WatchSnapshot(
    /** "YYYY-MM-DD" em America/Sao_Paulo, quando o servidor montou o snapshot. */
    val today: String,
    val month: String,
    val cash: MonthBudget,
    val mealCard: MonthBudget,
    val ledger: Ledger,
    val nextMonth: NextMonth,
    val categories: List<Category>,
    val plan: PlanSummary,
    val amortization: Amortization? = null,
)

@Serializable
data class MonthBudget(val monthBudget: Cents)

/** Gasto bruto do mês, antes de o estouro do VA ir para o Dinheiro. */
@Serializable
data class Ledger(val cash: DaySplit, val mealCard: DaySplit, val mealCardCredit: Cents)

@Serializable
data class NextMonth(val month: String, val cashBudget: Cents, val mealCardBudget: Cents)

@Serializable
data class Category(
    val id: String,
    val name: String,
    val icon: String,
    val defaultPaymentMethod: Source,
    val budget: Cents,
    val cashSpent: Cents,
    val mealCardSpent: Cents,
)

@Serializable
data class PlanSummary(
    val payoffMonth: String? = null,
    val minCash: Cents,
    val minCashMonth: String? = null,
    val monthlyTopUp: Cents,
    val pendingTurnover: String? = null,
    val ratesCapturedAt: String? = null,
)

@Serializable
enum class Verdict { INVEST, BORDERLINE, AMORTIZE }

/** Taxas são decimais ao ano (0.118 = 11,8%) — não são dinheiro. */
@Serializable
data class Amortization(
    val verdict: Verdict,
    val netAnnualYield: Double,
    val debtAnnualCost: Double,
    val cdiAnnual: Double? = null,
)

/** Operação feita no relógio que ainda não subiu para o servidor. */
@Serializable
sealed interface PendingOp {
    val amount: Cents
    val source: Source
    val categoryId: String
    /** "YYYY-MM-DD" do momento do lançamento. */
    val date: String

    @Serializable
    @SerialName("create")
    data class Create(
        /** Chave de idempotência: o reenvio vira o mesmo lançamento. */
        val key: String,
        override val amount: Cents,
        override val source: Source,
        override val categoryId: String,
        override val date: String,
    ) : PendingOp

    /** Desfazer de um lançamento que já tinha subido. */
    @Serializable
    @SerialName("delete")
    data class Delete(
        val transactionId: String,
        override val amount: Cents,
        override val source: Source,
        override val categoryId: String,
        override val date: String,
    ) : PendingOp
}
