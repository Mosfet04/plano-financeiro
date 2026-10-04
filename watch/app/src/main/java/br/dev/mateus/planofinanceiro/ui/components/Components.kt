package br.dev.mateus.planofinanceiro.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.EdgeButton
import androidx.wear.compose.material3.EdgeButtonSize
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.Text
import br.dev.mateus.planofinanceiro.R
import br.dev.mateus.planofinanceiro.domain.Cents
import br.dev.mateus.planofinanceiro.domain.formatAmount
import br.dev.mateus.planofinanceiro.ui.theme.Barlow
import br.dev.mateus.planofinanceiro.ui.theme.BarlowCondensed
import br.dev.mateus.planofinanceiro.ui.theme.PlanoColors
import br.dev.mateus.planofinanceiro.ui.theme.px
import br.dev.mateus.planofinanceiro.ui.theme.pxSp

/** Texto com tamanho em pixels do design. `numeric` usa a condensada tabular. */
@Composable
fun PlanoText(
    text: String,
    size: Int,
    modifier: Modifier = Modifier,
    color: Color = PlanoColors.TextPrimary,
    weight: FontWeight = FontWeight.Normal,
    numeric: Boolean = false,
    align: TextAlign? = null,
) {
    Text(
        text = text,
        modifier = modifier,
        style = TextStyle(
            color = color,
            fontSize = size.pxSp,
            lineHeight = (size * 1.15f).pxSp,
            fontWeight = weight,
            fontFamily = if (numeric) BarlowCondensed else Barlow,
            fontFeatureSettings = if (numeric) "tnum" else null,
            textAlign = align ?: TextAlign.Unspecified,
        ),
    )
}

/** "R$" pequeno e cinza ao lado do valor grande; negativo em vermelho. */
@Composable
fun MoneyText(amount: Cents, numberSize: Int, currencySize: Int, modifier: Modifier = Modifier) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(4.px), verticalAlignment = Alignment.Bottom) {
        PlanoText("R$", currencySize, color = PlanoColors.TextSecondary, weight = FontWeight.Medium, numeric = true)
        PlanoText(
            amount.formatAmount(),
            numberSize,
            color = if (amount.isNegative) PlanoColors.Negative else PlanoColors.TextPrimary,
            weight = FontWeight.SemiBold,
            numeric = true,
        )
    }
}

/** Bolinha da cor da fonte + nome. */
@Composable
fun SourceTag(name: String, dotColor: Color, textColor: Color, size: Int = 14) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.px), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(8.px).clip(CircleShape).background(dotColor))
        PlanoText(name, size, color = textColor, weight = FontWeight.SemiBold)
    }
}

/** Botão em pílula da superfície (#1C1C24): Mês, Plano, Desfazer. */
@Composable
fun Pill(
    text: String,
    @DrawableRes icon: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    badgeColor: Color? = null,
) {
    Box(modifier) {
        Row(
            Modifier
                .height(44.px)
                .clip(RoundedCornerShape(22.px))
                .background(PlanoColors.Surface)
                .clickable(onClick = onClick)
                .padding(horizontal = 18.px),
            horizontalArrangement = Arrangement.spacedBy(6.px),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(painterResource(icon), contentDescription = null, tint = PlanoColors.TextSoft, modifier = Modifier.size(18.px))
            PlanoText(text, 15, color = PlanoColors.TextSoft, weight = FontWeight.SemiBold)
        }
        if (badgeColor != null) {
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 8.px, end = 10.px)
                    .size(8.px)
                    .clip(CircleShape)
                    .background(badgeColor),
            )
        }
    }
}

/** Barra de progresso horizontal, com a fração entre 0 e 1. */
@Composable
fun ProgressBar(fraction: Float, fill: Color, track: Color, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(10.px).clip(RoundedCornerShape(5.px)).background(track)) {
        Box(Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).height(10.px).clip(RoundedCornerShape(5.px)).background(fill))
    }
}

/**
 * Altura que o `EdgeButton` `ExtraSmall` ocupa na borda de baixo: 46 dp mais
 * 3 dp de margem em cima e embaixo. A biblioteca não expõe esse número, e é
 * ele que o conteúdo precisa respeitar para não passar por baixo do botão.
 */
val EdgeButtonReserve: Dp = 46.dp + 3.dp * 2

/** Tela redonda de layout fixo, com a ação principal colada na borda de baixo. */
@Composable
fun FixedScreen(
    edgeText: String,
    onEdgeClick: () -> Unit,
    edgeColor: Color,
    edgeContentColor: Color,
    edgeEnabled: Boolean = true,
    @DrawableRes leadingIcon: Int? = null,
    @DrawableRes trailingIcon: Int? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(Modifier.fillMaxSize().background(PlanoColors.Background)) {
        content()
        EdgeButton(
            onClick = onEdgeClick,
            modifier = Modifier.align(Alignment.BottomCenter),
            buttonSize = EdgeButtonSize.ExtraSmall,
            enabled = edgeEnabled,
            colors = ButtonDefaults.buttonColors(containerColor = edgeColor, contentColor = edgeContentColor),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.px), verticalAlignment = Alignment.CenterVertically) {
                leadingIcon?.let { Icon(painterResource(it), contentDescription = null, modifier = Modifier.size(22.px)) }
                PlanoText(edgeText, 19, color = edgeContentColor, weight = FontWeight.Bold)
                trailingIcon?.let { Icon(painterResource(it), contentDescription = null, modifier = Modifier.size(20.px)) }
            }
        }
    }
}

/** Ícone de categoria pelo nome que o PWA grava (lista fechada do Lucide). */
@DrawableRes
fun categoryIcon(name: String): Int = when (name) {
    "shopping-cart" -> R.drawable.ic_shopping_cart
    "utensils" -> R.drawable.ic_utensils
    "car" -> R.drawable.ic_car
    "bus" -> R.drawable.ic_bus
    "pill" -> R.drawable.ic_pill
    "house" -> R.drawable.ic_house
    "wrench" -> R.drawable.ic_wrench
    "paw-print" -> R.drawable.ic_paw_print
    "heart" -> R.drawable.ic_heart
    "star" -> R.drawable.ic_star
    "shopping-bag" -> R.drawable.ic_shopping_bag
    "repeat" -> R.drawable.ic_repeat
    "gift" -> R.drawable.ic_gift
    "shirt" -> R.drawable.ic_shirt
    "graduation-cap" -> R.drawable.ic_graduation_cap
    else -> R.drawable.ic_tag
}

/** Mensagem centralizada para estados sem dado (carregando, sem rede). */
@Composable
fun CenteredMessage(title: String, detail: String? = null) {
    Box(Modifier.fillMaxSize().background(PlanoColors.Background).padding(horizontal = 60.px), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            PlanoText(title, 20, weight = FontWeight.SemiBold, align = TextAlign.Center)
            if (detail != null) PlanoText(detail, 14, color = PlanoColors.TextSecondary, align = TextAlign.Center)
        }
    }
}
