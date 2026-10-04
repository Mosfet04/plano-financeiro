package br.dev.mateus.planofinanceiro.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.LifecycleStartEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import br.dev.mateus.planofinanceiro.ui.components.CenteredMessage
import br.dev.mateus.planofinanceiro.ui.components.FixedScreen
import br.dev.mateus.planofinanceiro.ui.screens.AmortizationScreen
import br.dev.mateus.planofinanceiro.ui.screens.AmountScreen
import br.dev.mateus.planofinanceiro.ui.screens.CategoryScreen
import br.dev.mateus.planofinanceiro.ui.screens.DoneScreen
import br.dev.mateus.planofinanceiro.ui.screens.MonthScreen
import br.dev.mateus.planofinanceiro.ui.screens.PairingScreen
import br.dev.mateus.planofinanceiro.ui.screens.PlanScreen
import br.dev.mateus.planofinanceiro.ui.screens.TodayScreen
import br.dev.mateus.planofinanceiro.ui.theme.CashColors

private object Routes {
    const val TODAY = "hoje"
    const val AMOUNT = "valor"
    const val CATEGORY = "categoria"
    const val DONE = "pronto"
    const val MONTH = "mes"
    const val PLAN = "plano"
    const val AMORTIZATION = "amortizacao"
}

/** Escolhe entre parear, carregar e o app; ao voltar para a frente, sincroniza. */
@Composable
fun PlanoNavHost(viewModel: WatchViewModel, openAmount: Boolean) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    LifecycleStartEffect(Unit) {
        viewModel.refresh()
        onStopOrDispose { }
    }

    AppScaffold(timeText = {}) {
        when (val current = state) {
            WatchUiState.NeedsPairing -> {
                val pairing by viewModel.pairing.collectAsStateWithLifecycle()
                PairingScreen(pairing, viewModel::startPairing, viewModel::openOnPhone)
            }
            WatchUiState.Loading -> CenteredMessage("Carregando…")
            WatchUiState.Offline -> FixedScreen("Tentar de novo", { viewModel.refresh() }, CashColors.main, CashColors.onMain) {
                CenteredMessage("Sem conexão", "Ainda não há dados guardados neste relógio.")
            }
            is WatchUiState.Ready -> ReadyNavHost(viewModel, openAmount)
        }
    }
}

@Composable
private fun ReadyNavHost(viewModel: WatchViewModel, openAmount: Boolean) {
    val nav = rememberSwipeDismissableNavController()
    val backToToday = { nav.popBackStack(Routes.TODAY, inclusive = false); Unit }

    LaunchedEffect(openAmount) {
        if (openAmount) {
            viewModel.startEntry()
            nav.navigate(Routes.AMOUNT)
        }
    }

    SwipeDismissableNavHost(navController = nav, startDestination = Routes.TODAY) {
        composable(Routes.TODAY) {
            WithReady(viewModel) { state ->
                TodayScreen(
                    state,
                    onLaunch = {
                        viewModel.startEntry()
                        nav.navigate(Routes.AMOUNT)
                    },
                    onMonth = { nav.navigate(Routes.MONTH) },
                    onPlan = { nav.navigate(Routes.PLAN) },
                )
            }
        }
        composable(Routes.AMOUNT) {
            val entry by viewModel.entry.collectAsStateWithLifecycle()
            WithReady(viewModel) { state ->
                AmountScreen(entry, state.view, viewModel::press, viewModel::pickSource) { nav.navigate(Routes.CATEGORY) }
            }
        }
        composable(Routes.CATEGORY) {
            val entry by viewModel.entry.collectAsStateWithLifecycle()
            WithReady(viewModel) { state ->
                CategoryScreen(entry, state.view) { category ->
                    viewModel.record(category)
                    nav.navigate(Routes.DONE) { popUpTo(Routes.TODAY) }
                }
            }
        }
        composable(Routes.DONE) {
            val done by viewModel.done.collectAsStateWithLifecycle()
            WithReady(viewModel) { state ->
                done?.let {
                    DoneScreen(
                        it,
                        state.view,
                        onUndo = {
                            viewModel.undo()
                            backToToday()
                        },
                        onOk = backToToday,
                    )
                }
            }
        }
        composable(Routes.MONTH) {
            WithReady(viewModel) { state -> MonthScreen(state.view, onOk = backToToday) }
        }
        composable(Routes.PLAN) {
            WithReady(viewModel) { state ->
                PlanScreen(state.snapshot, onAmortization = { nav.navigate(Routes.AMORTIZATION) }, onOk = backToToday)
            }
        }
        composable(Routes.AMORTIZATION) {
            WithReady(viewModel) { state ->
                state.snapshot.amortization?.let { AmortizationScreen(it, onOk = { nav.popBackStack() }) }
            }
        }
    }
}

/** Cada destino lê o estado mais novo por conta própria, não o da criação do grafo. */
@Composable
private fun WithReady(viewModel: WatchViewModel, content: @Composable (WatchUiState.Ready) -> Unit) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    (state as? WatchUiState.Ready)?.let { content(it) }
}
