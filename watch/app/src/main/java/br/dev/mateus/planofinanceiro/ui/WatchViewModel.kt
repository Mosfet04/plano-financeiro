package br.dev.mateus.planofinanceiro.ui

import android.app.Application
import android.content.Intent
import android.os.Build
import androidx.concurrent.futures.await
import androidx.core.net.toUri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.wear.remote.interactions.RemoteActivityHelper
import br.dev.mateus.planofinanceiro.PlanoApp
import br.dev.mateus.planofinanceiro.data.ApiResult
import br.dev.mateus.planofinanceiro.data.SyncResult
import br.dev.mateus.planofinanceiro.domain.CategoryView
import br.dev.mateus.planofinanceiro.domain.PendingOp
import br.dev.mateus.planofinanceiro.domain.Source
import br.dev.mateus.planofinanceiro.domain.WatchSnapshot
import br.dev.mateus.planofinanceiro.domain.WatchView
import br.dev.mateus.planofinanceiro.domain.buildView
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZonedDateTime

sealed interface WatchUiState {
    data object Loading : WatchUiState
    data object Offline : WatchUiState
    data object NeedsPairing : WatchUiState
    data class Ready(
        val view: WatchView,
        val snapshot: WatchSnapshot,
        val pendingCount: Int,
        val fetchedAt: Instant?,
    ) : WatchUiState
}

data class PairingUi(
    val userCode: String? = null,
    val verificationUrl: String? = null,
    val expired: Boolean = false,
    val offline: Boolean = false,
)

/** O último lançamento, para a tela "Lançado" e o "Desfazer". */
data class Done(val op: PendingOp.Create, val categoryName: String)

class WatchViewModel(app: Application) : AndroidViewModel(app) {
    private val repository = (app as PlanoApp).repository
    private val offline = MutableStateFlow(false)

    val uiState: StateFlow<WatchUiState> =
        combine(repository.state, todayTicker(), offline) { local, today, isOffline ->
            when {
                local.token == null -> WatchUiState.NeedsPairing
                local.snapshot == null -> if (isOffline) WatchUiState.Offline else WatchUiState.Loading
                else -> WatchUiState.Ready(
                    view = buildView(local.snapshot, local.queue, today),
                    snapshot = local.snapshot,
                    pendingCount = local.queue.size,
                    fetchedAt = local.fetchedAt,
                )
            }
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), WatchUiState.Loading)

    private val _entry = MutableStateFlow(Entry())
    val entry: StateFlow<Entry> = _entry.asStateFlow()

    private val _done = MutableStateFlow<Done?>(null)
    val done: StateFlow<Done?> = _done.asStateFlow()

    private val _pairing = MutableStateFlow(PairingUi())
    val pairing: StateFlow<PairingUi> = _pairing.asStateFlow()
    private var pollJob: Job? = null

    fun refresh() = viewModelScope.launch {
        offline.value = repository.sync() == SyncResult.OFFLINE
    }

    fun startEntry() = viewModelScope.launch {
        _entry.value = Entry(source = repository.state.first().lastSource)
    }

    fun press(key: String) = _entry.update { it.press(key) }

    fun pickSource(source: Source) = _entry.update { it.copy(source = source) }

    /** Tocar na categoria já grava: é o terceiro toque. */
    fun record(category: CategoryView) = viewModelScope.launch {
        val current = _entry.value
        val op = repository.record(current.amount, current.source, category.id)
        _done.value = Done(op, category.name)
        _entry.value = Entry(source = current.source)
        offline.value = repository.sync() == SyncResult.OFFLINE
    }

    fun undo() = viewModelScope.launch {
        _done.value?.let { repository.undo(it.op) }
        _done.value = null
    }

    fun startPairing() {
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            _pairing.value = PairingUi()
            when (val started = repository.startPairing(Build.MODEL)) {
                is ApiResult.Ok -> {
                    _pairing.value = PairingUi(started.value.userCode, started.value.verificationUrl)
                    poll(started.value.deviceCode, started.value.interval, started.value.expiresIn)
                }
                else -> _pairing.value = PairingUi(offline = true)
            }
        }
    }

    /** Pergunta ao servidor até você confirmar no PWA ou o código vencer. */
    private suspend fun poll(deviceCode: String, intervalSeconds: Int, expiresInSeconds: Int) {
        var interval = Duration.ofSeconds(intervalSeconds.toLong())
        val deadline = Instant.now().plusSeconds(expiresInSeconds.toLong())
        while (Instant.now() < deadline) {
            delay(interval.toMillis())
            when (val result = repository.exchange(deviceCode)) {
                is ApiResult.Ok -> return
                is ApiResult.Rejected -> when (result.code) {
                    "authorization_pending" -> Unit
                    "slow_down" -> interval = interval.plusSeconds(5)
                    else -> break
                }
                else -> Unit
            }
        }
        _pairing.update { it.copy(expired = true) }
    }

    /** Abre a página de confirmação no celular pareado, já com o código. */
    fun openOnPhone() = viewModelScope.launch {
        val url = _pairing.value.verificationUrl ?: return@launch
        val intent = Intent(Intent.ACTION_VIEW, url.toUri()).addCategory(Intent.CATEGORY_BROWSABLE)
        runCatching { RemoteActivityHelper(getApplication()).startRemoteActivity(intent).await() }
    }

    /** Emite a data de hoje e de novo a cada meia-noite: o valor do dia vira sozinho. */
    private fun todayTicker(): Flow<LocalDate> = flow {
        while (true) {
            val now = ZonedDateTime.now(repository.zone)
            emit(now.toLocalDate())
            val nextMidnight = now.toLocalDate().plusDays(1).atStartOfDay(repository.zone)
            delay(Duration.between(now, nextMidnight).toMillis() + 1_000)
        }
    }
}
