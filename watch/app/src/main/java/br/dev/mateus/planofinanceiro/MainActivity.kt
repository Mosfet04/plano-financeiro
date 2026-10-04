package br.dev.mateus.planofinanceiro

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.viewmodel.compose.viewModel
import br.dev.mateus.planofinanceiro.ui.PlanoNavHost
import br.dev.mateus.planofinanceiro.ui.theme.PlanoTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // O tile abre direto no teclado de lançamento.
        val openAmount = intent.getBooleanExtra(EXTRA_OPEN_AMOUNT, false)
        setContent {
            PlanoTheme {
                PlanoNavHost(viewModel(), openAmount)
            }
        }
    }

    companion object {
        const val EXTRA_OPEN_AMOUNT = "open_amount"
    }
}
