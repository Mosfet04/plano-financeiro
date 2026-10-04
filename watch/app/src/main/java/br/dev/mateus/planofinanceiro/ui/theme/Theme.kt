package br.dev.mateus.planofinanceiro.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material3.ColorScheme
import androidx.wear.compose.material3.MaterialTheme
import br.dev.mateus.planofinanceiro.R
import br.dev.mateus.planofinanceiro.domain.Source

/** As cores do design. Fundo preto puro: no OLED, preto é pixel apagado. */
object PlanoColors {
    val Background = Color(0xFF000000)
    val TextPrimary = Color(0xFFF4F4F8)
    val TextSecondary = Color(0xFFA6A6B4)
    val TextTertiary = Color(0xFF8C8C9A)
    val TextSoft = Color(0xFFE6E6EE)
    val TextUnselected = Color(0xFFC8C8D2)
    val Negative = Color(0xFFFF8A93)
    val Surface = Color(0xFF1C1C24)
    val SurfaceDim = Color(0xFF121218)
    val Key = Color(0xFF17171E)
    val NeutralBar = Color(0xFF6B6B78)
}

data class SourceColors(val main: Color, val track: Color, val label: Color, val onMain: Color, val iconBackground: Color)

val CashColors = SourceColors(
    main = Color(0xFF8F94FA),
    track = Color(0xFF23244A),
    label = Color(0xFFB9BCFF),
    onMain = Color(0xFF0C0C1E),
    iconBackground = Color(0xFF262848),
)

val MealCardColors = SourceColors(
    main = Color(0xFFF2B24F),
    track = Color(0xFF3A2C14),
    label = Color(0xFFF6C77E),
    onMain = Color(0xFF1E1404),
    iconBackground = Color(0xFF3A2C14),
)

val Source.colors: SourceColors get() = if (this == Source.CASH) CashColors else MealCardColors
val Source.label: String get() = if (this == Source.CASH) "Dinheiro" else "VA"

val Barlow = FontFamily(
    Font(R.font.barlow_regular, FontWeight.Normal),
    Font(R.font.barlow_medium, FontWeight.Medium),
    Font(R.font.barlow_semibold, FontWeight.SemiBold),
    Font(R.font.barlow_bold, FontWeight.Bold),
)

/** Para números: condensada e com algarismos tabulares. */
val BarlowCondensed = FontFamily(
    Font(R.font.barlow_semi_condensed_medium, FontWeight.Medium),
    Font(R.font.barlow_semi_condensed_semibold, FontWeight.SemiBold),
)

/**
 * O design foi desenhado numa tela de 480 px (Galaxy Watch 8 de 44 mm). Toda
 * medida é escrita em pixels do design e convertida pela largura real da tela:
 * no de 40 mm (438 px) tudo encolhe na mesma proporção.
 */
val LocalDesignScale = staticCompositionLocalOf { 0.5f }

/** Pixels do design → dp na tela atual. */
val Number.px: Dp
    @Composable get() = (toFloat() * LocalDesignScale.current).dp

/** Pixels do design → sp, sem a escala de fonte do sistema (o layout é fixo). */
val Number.pxSp: TextUnit
    @Composable get() = with(LocalDensity.current) { (toFloat() * LocalDesignScale.current).dp.toSp() }

@Composable
fun PlanoTheme(content: @Composable () -> Unit) {
    val scale = LocalConfiguration.current.screenWidthDp / 480f
    CompositionLocalProvider(LocalDesignScale provides scale) {
        MaterialTheme(
            colorScheme = ColorScheme(
                primary = CashColors.main,
                onPrimary = CashColors.onMain,
                background = PlanoColors.Background,
                onBackground = PlanoColors.TextPrimary,
                onSurface = PlanoColors.TextPrimary,
                surfaceContainer = PlanoColors.Surface,
            ),
            content = content,
        )
    }
}
