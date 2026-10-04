package br.dev.mateus.planofinanceiro.tile

import android.content.ComponentName
import android.content.Context
import androidx.wear.protolayout.ActionBuilders.booleanExtra
import androidx.wear.protolayout.ActionBuilders.launchAction
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER
import androidx.wear.protolayout.LayoutElementBuilders.LayoutElement
import androidx.wear.protolayout.layout.box
import androidx.wear.protolayout.layout.column
import androidx.wear.protolayout.layout.row
import androidx.wear.protolayout.layout.spacer
import androidx.wear.protolayout.material3.ColorScheme
import androidx.wear.protolayout.material3.MaterialScope
import androidx.wear.protolayout.material3.ProgressIndicatorColors
import androidx.wear.protolayout.material3.Typography
import androidx.wear.protolayout.material3.circularProgressIndicator
import androidx.wear.protolayout.material3.primaryLayout
import androidx.wear.protolayout.material3.text
import androidx.wear.protolayout.material3.textEdgeButton
import androidx.wear.protolayout.modifiers.clickable
import androidx.wear.protolayout.types.LayoutColor
import androidx.wear.protolayout.types.argb
import androidx.wear.protolayout.types.layoutString
import androidx.wear.tiles.Material3TileService
import androidx.wear.tiles.RequestBuilders.TileRequest
import androidx.wear.tiles.TileBuilders.Tile
import androidx.wear.tiles.TileService
import androidx.wear.tiles.tile
import androidx.wear.tiles.timeline
import androidx.wear.tiles.timelineEntry
import br.dev.mateus.planofinanceiro.MainActivity
import br.dev.mateus.planofinanceiro.PlanoApp
import br.dev.mateus.planofinanceiro.data.PlanoRepository
import br.dev.mateus.planofinanceiro.domain.DailyAllowance
import br.dev.mateus.planofinanceiro.domain.buildView
import br.dev.mateus.planofinanceiro.domain.formatAmount
import br.dev.mateus.planofinanceiro.ui.formatMonthShort
import kotlinx.coroutines.flow.first
import java.time.ZonedDateTime
import kotlin.time.Duration.Companion.milliseconds

/**
 * O tile: os dois valores do dia e o "Lançar", que abre direto o teclado.
 * Lê só o que está guardado no relógio — nunca espera a rede.
 */
class PlanoTileService : Material3TileService(allowDynamicTheme = false, defaultColorScheme = TILE_COLORS) {

    override suspend fun MaterialScope.tileResponse(requestParams: TileRequest): Tile {
        val repository = (application as PlanoApp).repository
        val local = repository.state.first()
        val snapshot = local.snapshot

        val layout = if (local.token == null || snapshot == null) {
            primaryLayout(
                mainSlot = { text("Abra o app para parear".layoutString, typography = Typography.BODY_MEDIUM, maxLines = 2) },
                onClick = openApp(),
            )
        } else {
            val view = buildView(snapshot, local.queue, repository.today())
            primaryLayout(
                titleSlot = { text("Pode gastar hoje".layoutString, color = SECONDARY_TEXT) },
                mainSlot = {
                    column(
                        row(
                            ring(view.cash, "Dinheiro", CASH, CASH_TRACK, CASH_LABEL),
                            spacer(width = dp(8f)),
                            ring(view.mealCard, "VA", MEAL_CARD, MEAL_CARD_TRACK, MEAL_CARD_LABEL),
                        ),
                        text(
                            "Quitação ${snapshot.plan.payoffMonth?.let(::formatMonthShort) ?: "—"}".layoutString,
                            typography = Typography.LABEL_SMALL,
                            color = SECONDARY_TEXT,
                        ),
                        horizontalAlignment = HORIZONTAL_ALIGN_CENTER,
                    )
                },
                bottomSlot = {
                    textEdgeButton(onClick = openApp(openAmount = true)) { text("Lançar".layoutString) }
                },
                onClick = openApp(),
            )
        }

        // O valor do dia muda à meia-noite: o tile pede de novo nessa hora.
        val now = ZonedDateTime.now(PlanoRepository.ZONE)
        val nextMidnight = now.toLocalDate().plusDays(1).atStartOfDay(PlanoRepository.ZONE)
        val untilMidnight = (nextMidnight.toInstant().toEpochMilli() - now.toInstant().toEpochMilli() + 30_000).milliseconds
        return tile(timeline = timeline(timelineEntry(layout)), freshness = untilMidnight)
    }

    /** Anel de 270°, aberto embaixo, com o que ainda dá hoje no meio. */
    private fun MaterialScope.ring(
        allowance: DailyAllowance,
        label: String,
        fill: LayoutColor,
        track: LayoutColor,
        labelColor: LayoutColor,
    ): LayoutElement {
        val progress = if (allowance.dayBudget.value <= 0) 0f
        else (allowance.remainingToday.value.toFloat() / allowance.dayBudget.value).coerceIn(0f, 1f)
        return box(
            circularProgressIndicator(
                staticProgress = progress,
                startAngleDegrees = -135f,
                endAngleDegrees = 135f,
                strokeWidth = 6f,
                colors = ProgressIndicatorColors(indicatorColor = fill, trackColor = track),
                size = dp(RING_SIZE),
            ),
            column(
                text(
                    allowance.remainingToday.formatAmount().layoutString,
                    typography = Typography.NUMERAL_EXTRA_SMALL,
                    color = if (allowance.remainingToday.isNegative) NEGATIVE else PRIMARY_TEXT,
                ),
                text(label.layoutString, typography = Typography.LABEL_SMALL, color = labelColor),
                horizontalAlignment = HORIZONTAL_ALIGN_CENTER,
            ),
            width = dp(RING_SIZE),
            height = dp(RING_SIZE),
        )
    }

    private fun openApp(openAmount: Boolean = false) = clickable(
        launchAction(
            ComponentName(this, MainActivity::class.java),
            if (openAmount) mapOf(MainActivity.EXTRA_OPEN_AMOUNT to booleanExtra(true)) else emptyMap(),
        ),
    )

    companion object {
        private const val RING_SIZE = 72f

        private val CASH = 0xFF8F94FA.argb
        private val CASH_TRACK = 0xFF23244A.argb
        private val CASH_LABEL = 0xFFB9BCFF.argb
        private val MEAL_CARD = 0xFFF2B24F.argb
        private val MEAL_CARD_TRACK = 0xFF3A2C14.argb
        private val MEAL_CARD_LABEL = 0xFFF6C77E.argb
        private val PRIMARY_TEXT = 0xFFF4F4F8.argb
        private val SECONDARY_TEXT = 0xFFA6A6B4.argb
        private val NEGATIVE = 0xFFFF8A93.argb

        /** As cores do app, fixas: o tile não segue o tema dinâmico do sistema. */
        private val TILE_COLORS = ColorScheme(
            primary = CASH,
            onPrimary = 0xFF0C0C1E.argb,
            background = 0xFF000000.argb,
            onBackground = PRIMARY_TEXT,
            onSurface = PRIMARY_TEXT,
        )

        /** Pede ao sistema para redesenhar o tile com o dado novo. */
        fun requestUpdate(context: Context) {
            TileService.getUpdater(context).requestUpdate(PlanoTileService::class.java)
        }
    }
}
