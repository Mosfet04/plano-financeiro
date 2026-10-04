package br.dev.mateus.planofinanceiro.complication

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationText
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import br.dev.mateus.planofinanceiro.MainActivity
import br.dev.mateus.planofinanceiro.PlanoApp
import br.dev.mateus.planofinanceiro.domain.Cents
import br.dev.mateus.planofinanceiro.domain.DailyAllowance
import br.dev.mateus.planofinanceiro.domain.buildView
import br.dev.mateus.planofinanceiro.domain.formatAmount
import br.dev.mateus.planofinanceiro.domain.formatBRL
import kotlinx.coroutines.flow.first

/**
 * Complicação de mostrador: quanto ainda dá para gastar hoje em Dinheiro.
 * Lê o que está guardado no relógio, como o tile; o app avisa quando muda.
 */
class CashComplicationService : SuspendingComplicationDataSourceService() {

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        val repository = (application as PlanoApp).repository
        val local = repository.state.first()
        val snapshot = local.snapshot ?: return null
        val cash = buildView(snapshot, local.queue, repository.today()).cash
        return build(request.complicationType, cash)
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        build(type, DailyAllowance(Cents(130_000), 28, Cents(4_430), Cents(3_230), Cents(124_040)))

    private fun build(type: ComplicationType, cash: DailyAllowance): ComplicationData? {
        val description = plain("Pode gastar hoje: ${cash.remainingToday.formatBRL()} em dinheiro")
        val value = plain(cash.remainingToday.formatAmount())
        return when (type) {
            ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(value, description)
                .setTitle(plain("hoje"))
                .setTapAction(openApp())
                .build()
            ComplicationType.RANGED_VALUE -> {
                // A faixa é o dia: cheia no começo, vazia quando acaba. Exibição
                // apenas — a conta continua em centavos inteiros.
                val max = cash.dayBudget.value.coerceAtLeast(1).toFloat()
                val current = cash.remainingToday.value.coerceIn(0, max.toLong()).toFloat()
                RangedValueComplicationData.Builder(current, 0f, max, description)
                    .setText(value)
                    .setTapAction(openApp())
                    .build()
            }
            else -> null
        }
    }

    private fun plain(text: String): ComplicationText = PlainComplicationText.Builder(text).build()

    private fun openApp(): PendingIntent = PendingIntent.getActivity(
        this,
        0,
        Intent(this, MainActivity::class.java),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    companion object {
        fun requestUpdate(context: Context) {
            ComplicationDataSourceUpdateRequester
                .create(context, ComponentName(context, CashComplicationService::class.java))
                .requestUpdateAll()
        }
    }
}
