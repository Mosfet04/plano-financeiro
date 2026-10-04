package br.dev.mateus.planofinanceiro.data

import br.dev.mateus.planofinanceiro.domain.Cents
import br.dev.mateus.planofinanceiro.domain.PendingOp
import br.dev.mateus.planofinanceiro.domain.Source
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

enum class SyncResult { SYNCED, OFFLINE, UNPAIRED }

/**
 * Junta o que está guardado com o servidor. Toda escrita entra primeiro na
 * fila local e depois sobe: é o que deixa lançar sem rede e mostra o valor do
 * dia certo na hora, com ou sem resposta do servidor.
 */
class PlanoRepository(
    private val store: LocalStore,
    private val api: WatchApi,
    private val clock: Clock,
    /** Agenda uma sincronização para quando a rede voltar. */
    private val scheduleRetry: () -> Unit,
    /** Avisa o tile e a complicação que o dado mudou. */
    private val onDataChanged: () -> Unit,
) {
    val state: Flow<LocalState> = store.state

    private val syncLock = Mutex()
    /** Chave do relógio → id no servidor, para o "Desfazer" de algo que já subiu. */
    private val sentIds = ConcurrentHashMap<String, String>()

    val zone: ZoneId get() = ZONE

    fun today(): LocalDate = LocalDate.now(clock.withZone(ZONE))

    suspend fun startPairing(deviceName: String) = api.startPairing(deviceName)

    /** Troca o código pelo token; quando vem, guarda e já busca o primeiro snapshot. */
    suspend fun exchange(deviceCode: String): ApiResult<String> {
        val result = api.exchange(deviceCode)
        if (result is ApiResult.Ok) {
            store.saveToken(result.value)
            sync()
        }
        return result
    }

    /**
     * Lança na fila — a tela já mostra o valor novo — e devolve a operação,
     * para o "Desfazer". Quem chama sobe com `sync()`.
     */
    suspend fun record(amount: Cents, source: Source, categoryId: String): PendingOp.Create {
        val op = PendingOp.Create(UUID.randomUUID().toString(), amount, source, categoryId, today().toString())
        store.updateQueue { it + op }
        store.saveLastSource(source)
        onDataChanged()
        return op
    }

    /**
     * Se ainda está na fila, some dela. Se já subiu, entra na fila um "apagar".
     * O lock espera um envio em andamento terminar: ou o lançamento ainda está
     * na fila, ou já tem id no servidor.
     */
    suspend fun undo(op: PendingOp.Create) {
        val wasQueued = syncLock.withLock {
            val queued = op in store.current().queue
            if (queued) store.updateQueue { it - op }
            queued
        }
        if (!wasQueued) {
            val transactionId = sentIds[op.key] ?: return
            store.updateQueue { it + PendingOp.Delete(transactionId, op.amount, op.source, op.categoryId, op.date) }
            sync()
        }
        onDataChanged()
    }

    /** Sobe a fila e, se nada subiu, busca o snapshot. */
    suspend fun sync(): SyncResult = syncLock.withLock {
        val token = store.current().token ?: return@withLock SyncResult.UNPAIRED
        val result = flush(token) ?: refresh(token)
        if (result == SyncResult.OFFLINE && store.current().queue.isNotEmpty()) scheduleRetry()
        onDataChanged()
        result
    }

    /** Nulo quando a fila estava vazia — aí falta buscar o snapshot. */
    private suspend fun flush(token: String): SyncResult? {
        val queue = store.current().queue
        if (queue.isEmpty()) return null
        for (op in queue) {
            val result = when (op) {
                is PendingOp.Create -> api.record(token, op).onOk {
                    sentIds[op.key] = it.transactionId
                    store.saveSnapshot(it.snapshot, clock.instant())
                }
                is PendingOp.Delete -> api.delete(token, op.transactionId).onOk {
                    store.saveSnapshot(it, clock.instant())
                }
            }
            when (result) {
                // Recusado de vez (categoria apagada, data velha): reenviar não adianta.
                is ApiResult.Ok, is ApiResult.Rejected -> store.updateQueue { it - op }
                ApiResult.Offline -> return SyncResult.OFFLINE
                ApiResult.Unauthorized -> return unpair()
            }
        }
        return SyncResult.SYNCED
    }

    private suspend fun refresh(token: String): SyncResult = when (val result = api.snapshot(token)) {
        is ApiResult.Ok -> {
            store.saveSnapshot(result.value, clock.instant())
            SyncResult.SYNCED
        }
        ApiResult.Unauthorized -> unpair()
        else -> SyncResult.OFFLINE
    }

    /** A fila fica: depois de parear de novo no mesmo plano, ela sobe. */
    private suspend fun unpair(): SyncResult {
        store.saveToken(null)
        return SyncResult.UNPAIRED
    }

    private suspend inline fun <T> ApiResult<T>.onOk(action: (T) -> Unit): ApiResult<T> {
        if (this is ApiResult.Ok) action(value)
        return this
    }

    companion object {
        val ZONE: ZoneId = ZoneId.of("America/Sao_Paulo")
    }
}
