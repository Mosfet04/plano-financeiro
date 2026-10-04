package br.dev.mateus.planofinanceiro.data

import br.dev.mateus.planofinanceiro.domain.PendingOp
import br.dev.mateus.planofinanceiro.domain.WatchSnapshot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

/** Resultado de uma chamada: o que deu, ou por que não deu. */
sealed interface ApiResult<out T> {
    data class Ok<T>(val value: T) : ApiResult<T>

    /** Token revogado ou vencido: o relógio precisa parear de novo. */
    data object Unauthorized : ApiResult<Nothing>

    /** O servidor recusou de vez (código de erro da API). Reenviar não adianta. */
    data class Rejected(val code: String) : ApiResult<Nothing>

    /** Sem rede ou servidor fora: tenta de novo depois. */
    data object Offline : ApiResult<Nothing>
}

@Serializable
data class PairingStart(val deviceCode: String, val userCode: String, val interval: Int, val expiresIn: Int, val verificationUrl: String)

@Serializable
data class Recorded(val transactionId: String, val snapshot: WatchSnapshot)

@Serializable
private data class Undone(val snapshot: WatchSnapshot)

@Serializable
private data class IssuedToken(val token: String)

@Serializable
private data class ApiError(val error: String)

@Serializable
private data class CreateBody(
    val idempotencyKey: String,
    val amountCents: Long,
    val paymentMethod: String,
    val categoryId: String,
    val date: String,
)

/** As rotas do relógio em `app/api/watch`. */
class WatchApi(private val baseUrl: String, private val client: OkHttpClient, private val json: Json) {

    suspend fun startPairing(deviceName: String): ApiResult<PairingStart> =
        post("/api/watch/pairing", """{"deviceName":${json.encodeToString(deviceName)}}""", token = null)

    /** `Rejected("authorization_pending")` enquanto você não confirma no PWA. */
    suspend fun exchange(deviceCode: String): ApiResult<String> =
        when (val result = post<IssuedToken>("/api/watch/pairing/token", """{"deviceCode":${json.encodeToString(deviceCode)}}""", token = null)) {
            is ApiResult.Ok -> ApiResult.Ok(result.value.token)
            is ApiResult.Rejected -> result
            ApiResult.Offline -> ApiResult.Offline
            ApiResult.Unauthorized -> ApiResult.Unauthorized
        }

    suspend fun snapshot(token: String): ApiResult<WatchSnapshot> =
        call(Request.Builder().url(baseUrl + "/api/watch/snapshot").get(), token)

    suspend fun record(token: String, op: PendingOp.Create): ApiResult<Recorded> {
        val body = CreateBody(op.key, op.amount.value, op.source.name, op.categoryId, op.date)
        return post("/api/watch/transactions", json.encodeToString(body), token)
    }

    suspend fun delete(token: String, transactionId: String): ApiResult<WatchSnapshot> =
        when (val result = call<Undone>(Request.Builder().url("$baseUrl/api/watch/transactions/$transactionId").delete(), token)) {
            is ApiResult.Ok -> ApiResult.Ok(result.value.snapshot)
            is ApiResult.Rejected -> result
            ApiResult.Offline -> ApiResult.Offline
            ApiResult.Unauthorized -> ApiResult.Unauthorized
        }

    private suspend inline fun <reified T> post(path: String, body: String, token: String?): ApiResult<T> =
        call(Request.Builder().url(baseUrl + path).post(body.toRequestBody(JSON)), token)

    private suspend inline fun <reified T> call(builder: Request.Builder, token: String?): ApiResult<T> =
        withContext(Dispatchers.IO) {
            token?.let { builder.header("Authorization", "Bearer $it") }
            try {
                client.newCall(builder.build()).execute().use { response ->
                    val text = response.body.string()
                    when {
                        response.isSuccessful -> ApiResult.Ok(json.decodeFromString<T>(text))
                        response.code == 401 -> ApiResult.Unauthorized
                        response.code >= 500 -> ApiResult.Offline
                        else -> ApiResult.Rejected(
                            runCatching { json.decodeFromString<ApiError>(text).error }.getOrDefault("HTTP_${response.code}"),
                        )
                    }
                }
            } catch (_: IOException) {
                ApiResult.Offline
            }
        }

    private companion object {
        val JSON = "application/json".toMediaType()
    }
}
