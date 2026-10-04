package br.dev.mateus.planofinanceiro.domain

import kotlinx.serialization.Serializable
import kotlin.math.abs

/** Dinheiro é sempre inteiro em centavos — como no servidor. Nunca `Double`. */
@Serializable
@JvmInline
value class Cents(val value: Long) : Comparable<Cents> {
    operator fun plus(other: Cents) = Cents(value + other.value)
    operator fun minus(other: Cents) = Cents(value - other.value)
    operator fun unaryMinus() = Cents(-value)
    override fun compareTo(other: Cents) = value.compareTo(other.value)

    val isNegative: Boolean get() = value < 0

    companion object {
        val ZERO = Cents(0)
    }
}

fun minOf(a: Cents, b: Cents): Cents = if (a <= b) a else b
fun maxOf(a: Cents, b: Cents): Cents = if (a >= b) a else b

/** "1.240,40", com "−" quando negativo. Sem símbolo, para o "R$" pequeno ao lado. */
fun Cents.formatAmount(): String {
    val absolute = abs(value)
    val reais = (absolute / 100).toString().reversed().chunked(3).joinToString(".").reversed()
    val centavos = (absolute % 100).toString().padStart(2, '0')
    return "${if (isNegative) "−" else ""}$reais,$centavos"
}

/** "R$ 1.240,40" ou "−R$ 2.435,52". */
fun Cents.formatBRL(): String = if (isNegative) "−R$ ${(-this).formatAmount()}" else "R$ ${formatAmount()}"
