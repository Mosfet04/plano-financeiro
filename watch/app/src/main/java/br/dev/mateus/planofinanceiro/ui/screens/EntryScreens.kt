package br.dev.mateus.planofinanceiro.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.wear.compose.foundation.lazy.TransformingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberTransformingLazyColumnState
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.ScreenScaffold
import br.dev.mateus.planofinanceiro.R
import br.dev.mateus.planofinanceiro.domain.CategoryView
import br.dev.mateus.planofinanceiro.domain.Source
import br.dev.mateus.planofinanceiro.domain.WatchView
import br.dev.mateus.planofinanceiro.domain.formatBRL
import br.dev.mateus.planofinanceiro.ui.Done
import br.dev.mateus.planofinanceiro.ui.Entry
import br.dev.mateus.planofinanceiro.ui.components.EdgeButtonReserve
import br.dev.mateus.planofinanceiro.ui.components.FixedScreen
import br.dev.mateus.planofinanceiro.ui.components.MoneyText
import br.dev.mateus.planofinanceiro.ui.components.Pill
import br.dev.mateus.planofinanceiro.ui.components.PlanoText
import br.dev.mateus.planofinanceiro.ui.components.SourceTag
import br.dev.mateus.planofinanceiro.ui.components.categoryIcon
import br.dev.mateus.planofinanceiro.ui.theme.PlanoColors
import br.dev.mateus.planofinanceiro.ui.theme.colors
import br.dev.mateus.planofinanceiro.ui.theme.label
import br.dev.mateus.planofinanceiro.ui.theme.px

/** Toque 1: o valor, a fonte, e quanto sobra hoje se gastar isso. */
@Composable
fun AmountScreen(
    entry: Entry,
    view: WatchView,
    onKey: (String) -> Unit,
    onSource: (Source) -> Unit,
    onNext: () -> Unit,
) {
    val left = view.of(entry.source).remainingToday - entry.amount
    val colors = entry.source.colors

    FixedScreen(
        edgeText = "Categoria",
        onEdgeClick = onNext,
        edgeColor = colors.main,
        edgeContentColor = colors.onMain,
        edgeEnabled = entry.amount.value > 0,
        trailingIcon = R.drawable.ic_arrow_right,
    ) {
        // O teclado fica com o que sobra entre o topo e o botão da borda: a
        // altura do botão é fixa em dp e não escala com a tela, então medida
        // fixa nas teclas fazia a última fileira passar por baixo dele.
        Column(
            Modifier.fillMaxSize().padding(top = 38.px, bottom = EdgeButtonReserve + 6.px),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.px),
        ) {
            MoneyText(entry.amount, numberSize = 50, currencySize = 22)
            PlanoText(
                if (left.isNegative) "passa ${(-left).formatBRL()} do limite de hoje" else "sobram ${left.formatBRL()} hoje",
                13,
                color = if (left.isNegative) PlanoColors.Negative else PlanoColors.TextSecondary,
                weight = FontWeight.Medium,
            )
            SourceSelector(entry.source, onSource)
            Keypad(onKey, Modifier.weight(1f))
        }
    }
}

@Composable
private fun SourceSelector(selected: Source, onSource: (Source) -> Unit) {
    Row(
        Modifier.clip(RoundedCornerShape(26.px)).background(PlanoColors.Surface).padding(4.px),
        horizontalArrangement = Arrangement.spacedBy(4.px),
    ) {
        Source.entries.forEach { source ->
            val isSelected = source == selected
            Box(
                Modifier
                    .size(width = 108.px, height = 40.px)
                    .clip(RoundedCornerShape(22.px))
                    .background(if (isSelected) source.colors.main else Color.Transparent)
                    .clickable(role = Role.Tab) { onSource(source) }
                    .semantics { this.selected = isSelected },
                contentAlignment = Alignment.Center,
            ) {
                PlanoText(
                    source.label,
                    15,
                    color = if (isSelected) source.colors.onMain else PlanoColors.TextUnselected,
                    weight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
private fun Keypad(onKey: (String) -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.width(240.px), verticalArrangement = Arrangement.spacedBy(6.px)) {
        Entry.KEYS.chunked(3).forEach { row ->
            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(6.px)) {
                row.forEach { key ->
                    val isDelete = key == Entry.DELETE
                    Box(
                        Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .clip(RoundedCornerShape(24.px))
                            .background(PlanoColors.Key)
                            .clickable { onKey(key) }
                            .semantics { contentDescription = if (isDelete) "Apagar" else key },
                        contentAlignment = Alignment.Center,
                    ) {
                        if (isDelete) {
                            Icon(painterResource(R.drawable.ic_delete), contentDescription = null, tint = PlanoColors.TextPrimary, modifier = Modifier.size(24.px))
                        } else {
                            PlanoText(key, 24, weight = FontWeight.SemiBold, numeric = true)
                        }
                    }
                }
            }
        }
    }
}

/** Toque 2: a categoria. Tocar já grava. */
@Composable
fun CategoryScreen(entry: Entry, view: WatchView, onPick: (CategoryView) -> Unit) {
    val listState = rememberTransformingLazyColumnState()
    // As categorias que normalmente saem desta fonte vêm primeiro.
    val categories = view.categories.sortedByDescending { it.defaultSource == entry.source }

    ScreenScaffold(scrollState = listState) {
        TransformingLazyColumn(
            state = listState,
            contentPadding = PaddingValues(top = 38.px, bottom = 80.px),
            verticalArrangement = Arrangement.spacedBy(8.px),
        ) {
            item {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    SourceTag(
                        "${entry.amount.formatBRL()} · ${entry.source.label}",
                        entry.source.colors.main,
                        entry.source.colors.label,
                        size = 15,
                    )
                    PlanoText("Categoria", 24, weight = FontWeight.Bold)
                }
            }
            items(categories, key = { it.id }) { category ->
                CategoryRow(category, entry.source) { onPick(category) }
            }
        }
    }
}

@Composable
private fun CategoryRow(category: CategoryView, source: Source, onClick: () -> Unit) {
    val colors = source.colors
    Row(
        Modifier
            .width(300.px)
            .height(56.px)
            .clip(RoundedCornerShape(28.px))
            .background(PlanoColors.Surface)
            .clickable(onClick = onClick)
            .padding(start = 10.px, end = 16.px),
        horizontalArrangement = Arrangement.spacedBy(12.px),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(36.px).clip(CircleShape).background(colors.iconBackground), contentAlignment = Alignment.Center) {
            Icon(painterResource(categoryIcon(category.icon)), contentDescription = null, tint = colors.label, modifier = Modifier.size(20.px))
        }
        Column {
            PlanoText(category.name, 17, weight = FontWeight.SemiBold)
            PlanoText(
                when (source) {
                    Source.CASH -> "restam ${category.cashRemaining.formatBRL()} no mês"
                    Source.MEAL_CARD -> "${category.mealCardSpent.formatBRL()} no VA este mês"
                },
                13,
                color = if (source == Source.CASH && category.cashRemaining.isNegative) PlanoColors.Negative else PlanoColors.TextSecondary,
            )
        }
    }
}

/** Toque 3 feito: o que foi lançado, quanto ainda dá hoje, e o "Desfazer". */
@Composable
fun DoneScreen(done: Done, view: WatchView, onUndo: () -> Unit, onOk: () -> Unit) {
    val source = done.op.source
    val colors = source.colors

    FixedScreen(edgeText = "OK", onEdgeClick = onOk, edgeColor = colors.main, edgeContentColor = colors.onMain) {
        Column(
            Modifier.fillMaxWidth().padding(top = 52.px),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.px),
        ) {
            Box(Modifier.size(60.px).clip(CircleShape).background(colors.main), contentAlignment = Alignment.Center) {
                Icon(painterResource(R.drawable.ic_check), contentDescription = null, tint = colors.onMain, modifier = Modifier.size(32.px))
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                PlanoText("Lançado", 28, weight = FontWeight.Bold)
                PlanoText("${done.op.amount.formatBRL()} · ${done.categoryName} · ${source.label}", 16, color = PlanoColors.TextSoft)
            }
            Column(Modifier.padding(top = 8.px), horizontalAlignment = Alignment.CenterHorizontally) {
                PlanoText("Ainda pode hoje", 14, color = PlanoColors.TextSecondary)
                MoneyText(view.of(source).remainingToday, numberSize = 52, currencySize = 22)
            }
            Pill("Desfazer", R.drawable.ic_undo_2, onUndo)
        }
    }
}
