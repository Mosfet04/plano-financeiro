package br.dev.mateus.planofinanceiro

import android.app.Application
import br.dev.mateus.planofinanceiro.complication.CashComplicationService
import br.dev.mateus.planofinanceiro.data.LocalStore
import br.dev.mateus.planofinanceiro.data.PlanoRepository
import br.dev.mateus.planofinanceiro.data.WatchApi
import br.dev.mateus.planofinanceiro.sync.SyncScheduler
import br.dev.mateus.planofinanceiro.tile.PlanoTileService
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import java.time.Clock
import java.util.concurrent.TimeUnit

/** Raiz de composição do relógio: monta as dependências uma vez só. */
class PlanoApp : Application() {
    lateinit var repository: PlanoRepository
        private set

    override fun onCreate() {
        super.onCreate()
        val json = Json { ignoreUnknownKeys = true }
        val client = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()

        repository = PlanoRepository(
            store = LocalStore(this, json),
            api = WatchApi(BuildConfig.BASE_URL, client, json),
            clock = Clock.systemUTC(),
            scheduleRetry = { SyncScheduler.scheduleRetry(this) },
            onDataChanged = {
                PlanoTileService.requestUpdate(this)
                CashComplicationService.requestUpdate(this)
            },
        )

        SyncScheduler.schedulePeriodic(this)
        SyncScheduler.scheduleMidnight(this)
    }
}
