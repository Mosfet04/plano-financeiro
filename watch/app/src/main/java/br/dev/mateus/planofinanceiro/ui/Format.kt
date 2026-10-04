package br.dev.mateus.planofinanceiro.ui

import br.dev.mateus.planofinanceiro.data.PlanoRepository
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth

private val MONTHS_SHORT = listOf("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")
private val MONTHS_LONG = listOf(
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
)
private val WEEKDAYS = listOf("seg", "ter", "qua", "qui", "sex", "sáb", "dom")

/** "2030-09" → "set/2030", o formato da planilha e do PWA. */
fun formatMonthShort(month: String): String {
    val value = YearMonth.parse(month)
    return "${MONTHS_SHORT[value.monthValue - 1]}/${value.year}"
}

/** "2026-09" → "setembro". */
fun monthName(month: YearMonth): String = MONTHS_LONG[month.monthValue - 1]

/** Instante das taxas → "qui, 01/10". */
fun formatRatesDate(iso: String): String {
    val date = Instant.parse(iso).atZone(PlanoRepository.ZONE).toLocalDate()
    return "${WEEKDAYS[date.dayOfWeek.value - 1]}, ${"%02d/%02d".format(date.dayOfMonth, date.monthValue)}"
}

/** 0.0766 → "7,66%". Taxa é decimal ao ano, não dinheiro. */
fun formatRate(rate: Double): String =
    BigDecimal(rate * 100).setScale(2, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString().replace('.', ',') + "%"

/** "atualizado às 14:03", ou com a data quando não é de hoje. */
fun formatFetchedAt(at: Instant, today: LocalDate): String {
    val local = at.atZone(PlanoRepository.ZONE)
    val time = "%02d:%02d".format(local.hour, local.minute)
    return if (local.toLocalDate() == today) "atualizado às $time"
    else "atualizado em ${"%02d/%02d".format(local.dayOfMonth, local.monthValue)}"
}
