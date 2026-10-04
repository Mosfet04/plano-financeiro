package br.dev.mateus.planofinanceiro.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import br.dev.mateus.planofinanceiro.PlanoApp
import br.dev.mateus.planofinanceiro.data.PlanoRepository
import br.dev.mateus.planofinanceiro.data.SyncResult
import java.time.Duration
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

/** Sobe a fila e busca o snapshot. Sem rede, pede para tentar de novo. */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val repository = (applicationContext as PlanoApp).repository
        return if (repository.sync() == SyncResult.OFFLINE) Result.retry() else Result.success()
    }
}

/**
 * Logo depois da meia-noite: o valor do dia muda mesmo sem rede (o relógio
 * refaz a conta sozinho), então o tile precisa redesenhar. Reagenda a si mesmo.
 */
class MidnightWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        (applicationContext as PlanoApp).repository.sync()
        SyncScheduler.scheduleMidnight(applicationContext)
        return Result.success()
    }
}

object SyncScheduler {
    private const val PERIODIC = "sync-periodic"
    private const val RETRY = "sync-retry"
    private const val MIDNIGHT = "sync-midnight"

    private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    fun schedulePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(1, TimeUnit.HOURS).setConstraints(online).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    /** Para quando a rede voltar: sobe o que ficou na fila. */
    fun scheduleRetry(context: Context) {
        val request = OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(online).build()
        WorkManager.getInstance(context).enqueueUniqueWork(RETRY, ExistingWorkPolicy.KEEP, request)
    }

    fun scheduleMidnight(context: Context) {
        val now = ZonedDateTime.now(PlanoRepository.ZONE)
        val next = now.toLocalDate().plusDays(1).atStartOfDay(PlanoRepository.ZONE).plusSeconds(30)
        val request = OneTimeWorkRequestBuilder<MidnightWorker>()
            .setInitialDelay(Duration.between(now, next))
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(MIDNIGHT, ExistingWorkPolicy.REPLACE, request)
    }
}
