package br.dev.mateus.planofinanceiro.ui

import br.dev.mateus.planofinanceiro.domain.Cents
import org.junit.Assert.assertEquals
import org.junit.Test

class EntryTest {
    private fun type(vararg keys: String) = keys.fold(Entry()) { entry, key -> entry.press(key) }

    @Test fun `digita em centavos`() = assertEquals(Cents(2_390), type("2", "3", "9", "0").amount)

    @Test fun `zeros a esquerda nao contam`() = assertEquals("5", type("0", "00", "5").digits)

    @Test fun `apagar tira o ultimo digito`() = assertEquals(Cents(23), type("2", "3", "9", Entry.DELETE).amount)

    @Test fun `para em sete digitos`() =
        assertEquals(Cents(9_999_999), type("9", "9", "9", "9", "9", "9", "9", "9").amount)
}
