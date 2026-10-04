package br.dev.mateus.planofinanceiro.data

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import br.dev.mateus.planofinanceiro.domain.PendingOp
import br.dev.mateus.planofinanceiro.domain.Source
import br.dev.mateus.planofinanceiro.domain.WatchSnapshot
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import java.time.Instant

data class LocalState(
    val token: String?,
    val snapshot: WatchSnapshot?,
    val fetchedAt: Instant?,
    val queue: List<PendingOp>,
    val lastSource: Source,
)

private val Context.dataStore by preferencesDataStore(name = "plano")

/**
 * Tudo o que o relógio guarda: o token (cifrado), o último snapshot e a fila
 * de lançamentos que ainda não subiram. O app e o tile abrem daqui, na hora.
 */
class LocalStore(private val context: Context, private val json: Json) {
    private object Keys {
        val token = stringPreferencesKey("token")
        val snapshot = stringPreferencesKey("snapshot")
        val fetchedAt = longPreferencesKey("fetched_at")
        val queue = stringPreferencesKey("queue")
        val lastSource = stringPreferencesKey("last_source")
    }

    val state: Flow<LocalState> = context.dataStore.data.map(::toState)

    suspend fun current(): LocalState = state.first()

    suspend fun saveToken(token: String?) = context.dataStore.edit { prefs ->
        if (token == null) prefs.remove(Keys.token) else prefs[Keys.token] = TokenCipher.encrypt(token)
    }

    suspend fun saveSnapshot(snapshot: WatchSnapshot, at: Instant) = context.dataStore.edit { prefs ->
        prefs[Keys.snapshot] = json.encodeToString(snapshot)
        prefs[Keys.fetchedAt] = at.toEpochMilli()
    }

    suspend fun updateQueue(transform: (List<PendingOp>) -> List<PendingOp>) = context.dataStore.edit { prefs ->
        prefs[Keys.queue] = json.encodeToString(transform(decodeQueue(prefs)))
    }

    suspend fun saveLastSource(source: Source) = context.dataStore.edit { it[Keys.lastSource] = source.name }

    private fun toState(prefs: Preferences) = LocalState(
        token = prefs[Keys.token]?.let(TokenCipher::decrypt),
        snapshot = prefs[Keys.snapshot]?.let { runCatching { json.decodeFromString<WatchSnapshot>(it) }.getOrNull() },
        fetchedAt = prefs[Keys.fetchedAt]?.let(Instant::ofEpochMilli),
        queue = decodeQueue(prefs),
        lastSource = prefs[Keys.lastSource]?.let(Source::valueOf) ?: Source.CASH,
    )

    private fun decodeQueue(prefs: Preferences): List<PendingOp> =
        prefs[Keys.queue]?.let { runCatching { json.decodeFromString<List<PendingOp>>(it) }.getOrNull() }.orEmpty()
}
