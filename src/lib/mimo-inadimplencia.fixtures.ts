// Fixtures SINTÉTICAS de "Contas a Receber" do Omie. Nenhum dado real.
export const HOJE_FIXTURE = "2026-11-27";
export const AGORA_FIXTURE = new Date("2026-11-27T15:00:00Z");
export const PERIODO_FIXTURE = { de: "2026-01-01", ate: "2026-12-31" };

let seq = 9000;
export function tituloSintetico(campos: Record<string, unknown>) {
  return {
    codigo_lancamento_omie: ++seq,
    codigo_cliente_fornecedor: 10,
    data_vencimento: "26/11/2026",
    data_previsao: "26/11/2026",
    valor_documento: 100,
    status_titulo: "ATRASADO",
    numero_documento: "NF-1",
    numero_parcela: "001/001",
    codigo_categoria: "1.01.01",
    campo_extra_do_omie: { qualquer: "coisa" },
    ...campos,
  };
}

export function titulosSinteticos() {
  seq = 9000;
  const lista = [
    tituloSintetico({ codigo_vendedor: 5 }), // 1 dia, R$ 100,00
    tituloSintetico({ data_vencimento: "12/11/2026", valor_documento: 50, codigo_vendedor: "5" }), // 15 dias
    tituloSintetico({
      codigo_cliente_fornecedor: "20",
      data_vencimento: "11/11/2026",
      valor_documento: 200.1,
    }), // 16 dias, sem vendedor
    tituloSintetico({
      codigo_cliente_fornecedor: 20,
      data_vencimento: "29/08/2026",
      valor_documento: 30.3,
      codigo_vendedor: 0,
    }), // 90 dias
    tituloSintetico({
      codigo_cliente_fornecedor: 30,
      data_vencimento: "28/08/2026",
      valor_documento: 1000,
      codigo_vendedor: 6,
    }), // 91 dias
    tituloSintetico({
      codigo_cliente_fornecedor: 30,
      data_vencimento: "28/10/2026",
      valor_documento: 10,
    }), // 30 dias
    tituloSintetico({
      codigo_cliente_fornecedor: 40,
      data_vencimento: "27/10/2026",
      valor_documento: 20,
      numero_documento: '=HYPERLINK("x")',
    }), // 31 dias
    tituloSintetico({
      data_vencimento: "01/10/2026",
      valor_documento: 500,
      status_titulo: "RECEBIDO",
      codigo_vendedor: 5,
    }),
    tituloSintetico({
      data_vencimento: "27/11/2026",
      valor_documento: 70,
      status_titulo: "VENCE HOJE",
    }),
    tituloSintetico({
      data_vencimento: "10/12/2026",
      valor_documento: 80,
      status_titulo: "A VENCER",
    }),
    tituloSintetico({
      data_vencimento: "10/10/2026",
      valor_documento: 999,
      status_titulo: "CANCELADO",
    }),
    tituloSintetico({
      data_vencimento: "10/10/2026",
      valor_documento: 40,
      status_titulo: "PARCIAL",
    }),
    tituloSintetico({ data_vencimento: "31/12/2025", valor_documento: 300 }), // fora do período
    tituloSintetico({
      data_vencimento: "01/12/2026",
      valor_documento: 60,
      status_titulo: "recebido",
    }),
    tituloSintetico({ data_vencimento: "2026-10-10" }), // data em formato inválido
  ];
  return [...lista, { ...lista[0] }]; // duplicado entre páginas
}
