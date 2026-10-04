package br.dev.mateus.planofinanceiro.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import br.dev.mateus.planofinanceiro.R
import br.dev.mateus.planofinanceiro.domain.DailyAllowance
import br.dev.mateus.planofinanceiro.domain.Source
import br.dev.mateus.planofinanceiro.domain.Verdict
import br.dev.mateus.planofinanceiro.domain.formatBRL
import br.dev.mateus.planofinanceiro.ui.WatchUiState
import br.dev.mateus.planofinanceiro.ui.components.FixedScreen
import br.dev.mateus.planofinanceiro.ui.components.MoneyText
import br.dev.mateus.planofinanceiro.ui.components.Pill
import br.dev.mateus.planofinanceiro.ui.components.PlanoText
import br.dev.mateus.planofinanceiro.ui.components.SourceTag
import br.dev.mateus.planofinanceiro.ui.formatFetchedAt
import br.dev.mateus.planofinanceiro.ui.theme.CashColors
import br.dev.mateus.planofinanceiro.ui.theme.MealCardColors
import br.dev.mateus.planofinanceiro.ui.theme.PlanoColors
import br.dev.mateus.planofinanceiro.ui.theme.colors
import br.dev.mateus.planofinanceiro.ui.theme.label
import br.dev.mateus.planofinanceiro.ui.theme.px
import java.time.Duration
import java.time.Instant

/** A tela principal: quanto ainda dá para gastar hoje, em cada fonte. */
@Composable
fun TodayScreen(state: WatchUiState.Ready, onLaunch: () -> Unit, onMonth: () -> Unit, onPlan: () -> Unit) {
    val view = state.view
    val plan = state.snapshot.plan
    val hasWarning = plan.pendingTurnover != null || state.snapshot.amortization?.verdict == Verdict.AMORTIZE

    FixedScreen(
        edgeText = "Lançar",
        onEdgeClick = onLaunch,
        edgeColor = CashColors.main,
        edgeContentColor = CashColors.onMain,
        leadingIcon = R.drawable.ic_plus,
    ) {
        Rings(cash = ringFraction(view.cash), mealCard = ringFraction(view.mealCard))
        Column(
            Modifier.fillMaxWidth().padding(top = 60.px),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.px),
        ) {
            PlanoText("Pode gastar hoje", 15, color = PlanoColors.TextSecondary, weight = FontWeight.Medium)
            SourceToday(Source.CASH, view.cash)
            SourceToday(Source.MEAL_CARD, view.mealCard)
            Row(Modifier.padding(top = 4.px), horizontalArrangement = Arrangement.spacedBy(10.px)) {
                Pill("Mês", R.drawable.ic_calendar, onMonth)
                Pill("Plano", R.drawable.ic_trending_up, onPlan, badgeColor = CashColors.main.takeIf { hasWarning })
            }
            statusLine(state)?.let { PlanoText(it, 12, color = PlanoColors.TextTertiary) }
        }
    }
}

@Composable
private fun SourceToday(source: Source, allowance: DailyAllowance) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        SourceTag(source.label, source.colors.main, source.colors.label)
        MoneyText(allowance.remainingToday, numberSize = 62, currencySize = 26)
        PlanoText("de ${allowance.dayBudget.formatBRL()}", 13, color = PlanoColors.TextTertiary)
    }
}

/** Lançamento na fila ou dado velho: avisa sem gritar. */
private fun statusLine(state: WatchUiState.Ready): String? = when {
    state.pendingCount == 1 -> "1 lançamento na fila"
    state.pendingCount > 1 -> "${state.pendingCount} lançamentos na fila"
    state.fetchedAt != null && Duration.between(state.fetchedAt, Instant.now()) > Duration.ofHours(2) ->
        formatFetchedAt(state.fetchedAt, state.view.today)
    else -> null
}

/** O anel esvazia conforme o gasto do dia. Sem orçamento no dia, fica vazio. */
private fun ringFraction(allowance: DailyAllowance): Float =
    if (allowance.dayBudget.value <= 0) 0f
    else (allowance.remainingToday.value.toFloat() / allowance.dayBudget.value).coerceIn(0f, 1f)

/** Dois arcos de 270° na borda, abertos embaixo: externo Dinheiro, interno VA. */
@Composable
private fun Rings(cash: Float, mealCard: Float) {
    Canvas(Modifier.fillMaxSize()) {
        val scale = size.minDimension / 480f
        ring(radius = 224f * scale, stroke = 12f * scale, fraction = cash, fill = CashColors.main, track = CashColors.track)
        ring(radius = 208f * scale, stroke = 12f * scale, fraction = mealCard, fill = MealCardColors.main, track = MealCardColors.track)
    }
}

private fun DrawScope.ring(radius: Float, stroke: Float, fraction: Float, fill: Color, track: Color) {
    val topLeft = Offset(center.x - radius, center.y - radius)
    val arcSize = Size(radius * 2, radius * 2)
    val style = Stroke(width = stroke, cap = StrokeCap.Round)
    drawArc(track, startAngle = 135f, sweepAngle = 270f, useCenter = false, topLeft = topLeft, size = arcSize, style = style)
    // Com fração zero o traço redondo ainda desenharia um ponto.
    if (fraction > 0f) {
        drawArc(fill, startAngle = 135f, sweepAngle = 270f * fraction, useCenter = false, topLeft = topLeft, size = arcSize, style = style)
    }
}
