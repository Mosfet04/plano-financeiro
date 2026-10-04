package br.dev.mateus.planofinanceiro.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import br.dev.mateus.planofinanceiro.R
import br.dev.mateus.planofinanceiro.ui.PairingUi
import br.dev.mateus.planofinanceiro.ui.components.CenteredMessage
import br.dev.mateus.planofinanceiro.ui.components.FixedScreen
import br.dev.mateus.planofinanceiro.ui.components.PlanoText
import br.dev.mateus.planofinanceiro.ui.theme.CashColors
import br.dev.mateus.planofinanceiro.ui.theme.PlanoColors
import br.dev.mateus.planofinanceiro.ui.theme.px

/**
 * Sem token: mostra o código para você confirmar em Dispositivos, no PWA.
 * "Abrir no celular" abre essa página já preenchida no Android pareado.
 */
@Composable
fun PairingScreen(ui: PairingUi, onStart: () -> Unit, onOpenOnPhone: () -> Unit) {
    LaunchedEffect(Unit) { onStart() }

    when {
        ui.offline -> FixedScreen("Tentar de novo", onStart, CashColors.main, CashColors.onMain) {
            CenteredMessage("Sem conexão", "O relógio precisa de internet para parear.")
        }
        ui.expired -> FixedScreen("Novo código", onStart, CashColors.main, CashColors.onMain) {
            CenteredMessage("O código venceu", "Gere outro e confirme em até 10 minutos.")
        }
        else -> FixedScreen(
            edgeText = "Abrir no celular",
            onEdgeClick = onOpenOnPhone,
            edgeColor = CashColors.main,
            edgeContentColor = CashColors.onMain,
            edgeEnabled = ui.userCode != null,
            leadingIcon = R.drawable.ic_smartphone,
        ) {
            Column(
                Modifier.fillMaxWidth().padding(top = 90.px),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.px),
            ) {
                PlanoText("Parear com o plano", 15, color = PlanoColors.TextSecondary, weight = FontWeight.Medium)
                PlanoText(ui.userCode?.let { "${it.take(4)}-${it.drop(4)}" } ?: "…", 52, weight = FontWeight.SemiBold, numeric = true)
                PlanoText(
                    "Confirme no PWA, em ⋮ → Dispositivos",
                    14,
                    Modifier.width(300.px),
                    color = PlanoColors.TextSecondary,
                    align = TextAlign.Center,
                )
                PlanoText("aguardando confirmação…", 12, color = PlanoColors.TextTertiary)
            }
        }
    }
}
