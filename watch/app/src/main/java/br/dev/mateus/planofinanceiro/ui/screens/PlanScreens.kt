package br.dev.mateus.planofinanceiro.ui.screens

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.wear.compose.material3.Icon
import br.dev.mateus.planofinanceiro.R
import br.dev.mateus.planofinanceiro.domain.Amortization
import br.dev.mateus.planofinanceiro.domain.DailyAllowance
import br.dev.mateus.planofinanceiro.domain.Source
import br.dev.mateus.planofinanceiro.domain.Verdict
import br.dev.mateus.planofinanceiro.domain.WatchSnapshot
import br.dev.mateus.planofinanceiro.domain.WatchView
import br.dev.mateus.planofinanceiro.domain.formatBRL
import br.dev.mateus.planofinanceiro.ui.components.FixedScreen
import br.dev.mateus.planofinanceiro.ui.components.PlanoText
import br.dev.mateus.planofinanceiro.ui.components.ProgressBar
import br.dev.mateus.planofinanceiro.ui.components.SourceTag
import br.dev.mateus.planofinanceiro.ui.formatMonthShort
import br.dev.mateus.planofinanceiro.ui.formatRate
import br.dev.mateus.planofinanceiro.ui.formatRatesDate
import br.dev.mateus.planofinanceiro.ui.monthName
import br.dev.mateus.planofinanceiro.ui.theme.CashColors
import br.dev.mateus.planofinanceiro.ui.theme.PlanoColors
import br.dev.mateus.planofinanceiro.ui.theme.colors
import br.dev.mateus.planofinanceiro.ui.theme.label
import br.dev.mateus.planofinanceiro.ui.theme.px
import java.time.YearMonth

/** O mês de cada fonte: o que resta, o valor do dia e a barra. */
@Composable
fun MonthScreen(view: WatchView, onOk: () -> Unit) {
    val daysLeft = view.cash.daysLeft
    FixedScreen(edgeText = "OK", onEdgeClick = onOk, edgeColor = PlanoColors.Surface, edgeContentColor = PlanoColors.TextPrimary) {
        Column(
            Modifier.fillMaxWidth().padding(top = 46.px),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            PlanoText(monthName(YearMonth.from(view.today)).replaceFirstChar { it.uppercase() }, 32, weight = FontWeight.SemiBold, numeric = true)
            PlanoText(
                if (daysLeft == 1) "último dia do mês" else "faltam $daysLeft dias, contando hoje",
                14,
                color = PlanoColors.TextSecondary,
            )
            Column(Modifier.width(320.px).padding(top = 30.px), verticalArrangement = Arrangement.spacedBy(22.px)) {
                SourceMonth(Source.CASH, view.cash)
                SourceMonth(Source.MEAL_CARD, view.mealCard)
                PlanoText(
                    "valor do dia = o que resta ÷ dias que faltam",
                    13,
                    modifier = Modifier.fillMaxWidth(),
                    color = PlanoColors.TextTertiary,
                    align = TextAlign.Center,
                )
            }
        }
    }
}

@Composable
private fun SourceMonth(source: Source, allowance: DailyAllowance) {
    val fraction = if (allowance.monthBudget.value <= 0) 0f
    else allowance.monthRemaining.value.toFloat() / allowance.monthBudget.value
    Column(verticalArrangement = Arrangement.spacedBy(8.px)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
            SourceTag(source.label, source.colors.main, source.colors.label, size = 16)
            Row(verticalAlignment = Alignment.Bottom) {
                PlanoText(
                    allowance.dayBudget.formatBRL(),
                    22,
                    color = if (allowance.dayBudget.isNegative) PlanoColors.Negative else PlanoColors.TextPrimary,
                    weight = FontWeight.SemiBold,
                    numeric = true,
                )
                PlanoText("/dia", 14, color = PlanoColors.TextSecondary, weight = FontWeight.Medium, numeric = true)
            }
        }
        ProgressBar(fraction, fill = source.colors.main, track = source.colors.track)
        PlanoText(
            "restam ${allowance.monthRemaining.formatBRL()} de ${allowance.monthBudget.formatBRL()}",
            13,
            color = if (allowance.monthRemaining.isNegative) PlanoColors.Negative else PlanoColors.TextSecondary,
            numeric = true,
        )
    }
}

/** O resumo do plano. Só leitura: a virada continua no celular. */
@Composable
fun PlanScreen(snapshot: WatchSnapshot, onAmortization: () -> Unit, onOk: () -> Unit) {
    val plan = snapshot.plan
    FixedScreen(edgeText = "OK", onEdgeClick = onOk, edgeColor = PlanoColors.Surface, edgeContentColor = PlanoColors.TextPrimary) {
        Column(
            Modifier.fillMaxWidth().padding(top = 42.px),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            PlanoText("Quitação do apê", 14, color = PlanoColors.TextSecondary)
            PlanoText(plan.payoffMonth?.let(::formatMonthShort) ?: "—", 54, weight = FontWeight.SemiBold, numeric = true)

            Row(Modifier.width(308.px).padding(top = 12.px)) {
                Figure(
                    "Menor caixa",
                    plan.minCash.formatBRL(),
                    plan.minCashMonth?.let(::formatMonthShort).orEmpty(),
                    valueColor = if (plan.minCash.isNegative) PlanoColors.Negative else PlanoColors.TextPrimary,
                    modifier = Modifier.weight(1f),
                )
                Figure("Reforço", plan.monthlyTopUp.formatBRL(), "por mês", modifier = Modifier.weight(1f))
            }

            Column(Modifier.width(320.px).padding(top = 12.px), verticalArrangement = Arrangement.spacedBy(8.px)) {
                snapshot.amortization?.let { advice ->
                    InfoCard(
                        icon = R.drawable.ic_info,
                        title = "Amortizar do bolso",
                        detail = amortizationSummary(advice.verdict),
                        onClick = onAmortization,
                    )
                }
                plan.pendingTurnover?.let { month ->
                    InfoCard(
                        icon = R.drawable.ic_calendar,
                        title = "Virada de ${monthName(YearMonth.parse(month))}",
                        detail = "pendente · faça no celular",
                    )
                }
            }
            plan.ratesCapturedAt?.let {
                PlanoText("taxas de ${formatRatesDate(it)}", 12, Modifier.padding(top = 10.px), color = PlanoColors.TextTertiary)
            }
        }
    }
}

@Composable
private fun Figure(label: String, value: String, caption: String, modifier: Modifier = Modifier, valueColor: Color = PlanoColors.TextPrimary) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        PlanoText(label, 13, color = PlanoColors.TextSecondary)
        PlanoText(value, 24, color = valueColor, weight = FontWeight.SemiBold, numeric = true)
        PlanoText(caption, 13, color = PlanoColors.TextSecondary)
    }
}

/** Card de aviso. Com `onClick`, abre o detalhe; sem, é só informação. */
@Composable
private fun InfoCard(@DrawableRes icon: Int, title: String, detail: String, onClick: (() -> Unit)? = null) {
    val interactive = onClick != null
    Row(
        Modifier
            .fillMaxWidth()
            .height(60.px)
            .clip(RoundedCornerShape(22.px))
            .background(if (interactive) PlanoColors.Surface else PlanoColors.SurfaceDim)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(start = 12.px, end = 14.px),
        horizontalArrangement = Arrangement.spacedBy(12.px),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(36.px).clip(CircleShape).background(if (interactive) CashColors.iconBackground else PlanoColors.Surface),
            contentAlignment = Alignment.Center,
        ) {
            Icon(painterResource(icon), contentDescription = null, tint = if (interactive) CashColors.label else PlanoColors.TextUnselected, modifier = Modifier.size(20.px))
        }
        Column(Modifier.weight(1f)) {
            PlanoText(title, 16, weight = FontWeight.SemiBold)
            PlanoText(detail, 13, color = PlanoColors.TextSecondary)
        }
        if (interactive) {
            Icon(painterResource(R.drawable.ic_chevron_right), contentDescription = null, tint = PlanoColors.TextSecondary, modifier = Modifier.size(18.px))
        }
    }
}

private fun amortizationSummary(verdict: Verdict) = when (verdict) {
    Verdict.INVEST -> "hoje atrasa a quitação"
    Verdict.BORDERLINE -> "as taxas empataram"
    Verdict.AMORTIZE -> "hoje compensa"
}

/** Vale tirar do caixa e amortizar? Compara o que o caixa rende com o que a dívida custa. */
@Composable
fun AmortizationScreen(advice: Amortization, onOk: () -> Unit) {
    val (title, explanation) = when (advice.verdict) {
        Verdict.INVEST -> "Ainda não compensa" to "Deixe no caixa: amortizar agora atrasa a quitação."
        Verdict.BORDERLINE -> "Empate técnico" to "As taxas estão empatadas. Vale acompanhar a cada quinta."
        Verdict.AMORTIZE -> "Compensa amortizar" to "Tire do caixa e amortize: a dívida custa mais do que o caixa rende."
    }
    val widest = maxOf(advice.netAnnualYield, advice.debtAnnualCost).takeIf { it > 0 } ?: 1.0

    FixedScreen(edgeText = "Entendi", onEdgeClick = onOk, edgeColor = CashColors.main, edgeContentColor = CashColors.onMain) {
        Column(
            Modifier.fillMaxWidth().padding(top = 46.px),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(Modifier.size(40.px).clip(CircleShape).background(CashColors.iconBackground), contentAlignment = Alignment.Center) {
                Icon(painterResource(R.drawable.ic_trending_up), contentDescription = null, tint = CashColors.label, modifier = Modifier.size(22.px))
            }
            PlanoText("Amortizar do bolso?", 15, Modifier.padding(top = 8.px), color = PlanoColors.TextSecondary)
            PlanoText(title, 36, weight = FontWeight.SemiBold, numeric = true)

            Column(Modifier.width(280.px).padding(top = 20.px), verticalArrangement = Arrangement.spacedBy(14.px)) {
                RateBar("Seu caixa rende", advice.netAnnualYield, widest, CashColors.main)
                RateBar("O contrato custa", advice.debtAnnualCost, widest, PlanoColors.NeutralBar)
            }
            Column(Modifier.width(300.px).padding(top = 18.px), horizontalAlignment = Alignment.CenterHorizontally) {
                PlanoText(explanation, 15, color = PlanoColors.TextSoft, align = TextAlign.Center)
                advice.cdiAnnual?.let {
                    PlanoText("CDI ${formatRate(it)} · líquido de IR", 12, color = PlanoColors.TextTertiary)
                }
            }
        }
    }
}

@Composable
private fun RateBar(label: String, rate: Double, widest: Double, color: Color) {
    Column(verticalArrangement = Arrangement.spacedBy(6.px)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
            PlanoText(label, 14, color = PlanoColors.TextSoft)
            PlanoText("${formatRate(rate)} a.a.", 20, weight = FontWeight.SemiBold, numeric = true)
        }
        Box(Modifier.fillMaxWidth((rate / widest).toFloat().coerceIn(0f, 1f)).height(10.px).clip(RoundedCornerShape(5.px)).background(color))
    }
}
