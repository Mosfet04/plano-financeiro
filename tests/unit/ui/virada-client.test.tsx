import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ViradaClient, type ViradaData } from "@/app/(app)/mes/virada/virada-client";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const previewTurnover = vi.fn();
const settleMonth = vi.fn();
vi.mock("@/app/actions/closing.actions", () => ({
  previewTurnover: (input: unknown) => previewTurnover(input),
  settleMonth: (input: unknown) => settleMonth(input),
}));

const data: ViradaData = {
  month: "2026-09" as ViradaData["month"],
  checkedOn: "2026-10-01",
  isRedo: false,
  note: "",
  summary: {
    income: 635_488,
    housing: 123_357,
    extraIncome: 0,
    otherFixed: 63_225,
    variableSpent: 70_233,
    goalSpent: 0,
    mealCardOverflow: 0,
    leftover: 378_673,
    planTarget: 303_906,
    transactionCount: 40,
  },
  accounts: [
    {
      id: "picpay",
      name: "Caixinha Picpay",
      balance: 2_808_148,
      checkedOn: "2026-09-10",
      estimatedYield: 19_811,
      expected: 2_827_959,
    },
    {
      id: "nubank",
      name: "Nubank Chroma",
      balance: 1_060_547,
      checkedOn: "2026-09-09",
      estimatedYield: 8_175,
      expected: 1_068_722,
    },
  ],
  matured: [],
  fgts: null,
};

describe("tela da virada", () => {
  beforeEach(() => {
    push.mockReset();
    previewTurnover.mockReset().mockResolvedValue({
      ok: true,
      value: {
        before: {
          startMonth: "2026-09",
          openingCash: 3_868_695,
          payoffMonth: "2031-01",
          minCash: 50_821,
          minCashMonth: "2027-01",
        },
        after: {
          startMonth: "2026-10",
          openingCash: 4_200_587,
          payoffMonth: "2031-01",
          minCash: 366_282,
          minCashMonth: "2027-01",
        },
      },
    });
    settleMonth.mockReset().mockResolvedValue({ ok: true });
  });

  it("percorre revisar → conferir → confirmar e grava com os saldos digitados", async () => {
    const user = userEvent.setup();
    render(<ViradaClient data={data} />);

    // 1. Revisar: a sobra e a meta do mês.
    expect(screen.getByText("Como foi set/2026")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    // 2. Conferir: sem todos os saldos, não segue.
    const seguir = screen.getByRole("button", { name: "Confira todas as contas para seguir" });
    expect(seguir).toBeDisabled();

    // Guardou R$ 3.039,06 na Picpay; a Nubank só rendeu.
    await user.type(screen.getByLabelText("Saldo de Caixinha Picpay agora"), "31318,65");
    await user.click(screen.getByRole("button", { name: /Não guardei nada aqui/ }));

    // A conferência acusa os R$ 747,67 que não chegaram nas caixinhas.
    expect(screen.getByText("Você guardou")).toBeInTheDocument();
    expect(screen.getByText(/747,67 da sobra não chegou nas caixinhas/)).toBeInTheDocument();
    // E avisa que o saldo anterior era do meio do mês.
    expect(screen.getByText(/conferido no meio do mês/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ver o efeito no plano" }));
    expect(previewTurnover).toHaveBeenCalledWith({
      month: "2026-09",
      balances: [
        { accountId: "picpay", balance: 31318.65 },
        { accountId: "nubank", balance: 10687.22 },
      ],
      redeemedInvestmentIds: [],
      fgtsBalance: null,
      note: null,
    });

    // 3. Confirmar: o efeito no plano antes de gravar.
    expect(screen.getByText("O que muda no plano")).toBeInTheDocument();
    expect(screen.getByText(/3\.662,82/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fechar set/2026" }));
    expect(settleMonth).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledWith("/mes?mes=2026-09");
  });

  it("quando o guardado bate com a sobra, diz que bate", async () => {
    const user = userEvent.setup();
    render(<ViradaClient data={data} />);
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    // R$ 3.786,73 na Picpay: exatamente a sobra.
    await user.type(screen.getByLabelText("Saldo de Caixinha Picpay agora"), "32066,32");
    await user.click(screen.getByRole("button", { name: /Não guardei nada aqui/ }));

    expect(screen.getByText("Bate com a sobra do mês.")).toBeInTheDocument();
  });
});
