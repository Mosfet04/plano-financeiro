package br.dev.mateus.planofinanceiro.ui

import br.dev.mateus.planofinanceiro.domain.Cents
import br.dev.mateus.planofinanceiro.domain.Source

/**
 * O valor sendo digitado. Digitação em centavos, como na maquininha:
 * 2, 3, 9, 0 → R$ 23,90.
 */
data class Entry(val digits: String = "", val source: Source = Source.CASH) {
    val amount: Cents get() = Cents(digits.toLongOrNull() ?: 0)

    fun press(key: String): Entry = when (key) {
        DELETE -> copy(digits = digits.dropLast(1))
        else -> {
            val next = (digits + key).trimStart('0')
            if (next.length > MAX_DIGITS) this else copy(digits = next)
        }
    }

    companion object {
        const val DELETE = "del"
        /** R$ 99.999,99. */
        const val MAX_DIGITS = 7
        val KEYS = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", DELETE)
    }
}
