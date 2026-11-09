import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { PoliticaComercialAgente as Politica } from "@/lib/mimo-agente-politica";

function centavos(texto: string) {
  if (!/^\d+(?:[.,]\d{0,2})?$/.test(texto)) return 0;
  const [inteiro, decimal = ""] = texto.replace(",", ".").split(".");
  const valor = Number(inteiro) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(valor) ? valor : 0;
}
export function PoliticaComercialAgente({
  value: p,
  onChange,
}: {
  value: Politica | null;
  onChange: (value: Politica | null) => void;
}) {
  const editar = (alteracoes: Partial<Politica>) =>
    p && onChange({ ...p, ...alteracoes, revisada: false });
  const minimo = (valor: number, alterar: (n: number) => void, label: string) => (
    <label className="grid gap-2 text-sm">
      {label}
      <Input
        aria-label={label}
        type="number"
        min="0.01"
        step="0.01"
        value={valor ? valor / 100 : ""}
        onChange={(e) => alterar(centavos(e.target.value))}
      />
    </label>
  );
  return (
    <section className="space-y-4 rounded-lg border p-4">
      <h2 className="font-medium">Condições comerciais aprovadas</h2>
      <p className="text-sm text-muted-foreground">
        O agente informa somente as condições revisadas abaixo. Preços de produtos, taxas,
        negociação e exceções seguem para a equipe. Nenhuma condição é preenchida automaticamente.
      </p>
      {!p ? (
        <Button
          variant="outline"
          onClick={() =>
            onChange({
              revisada: false,
              regioes: [],
              demais: { minimoCentavos: 0, frete: "FOB" },
              pix: false,
              cartao: null,
              boleto: null,
              bonificacaoFrete: false,
            })
          }
        >
          Configurar condições comerciais
        </Button>
      ) : (
        <>
          <p className="text-sm">
            A condição regional exige um estado explícito. Cidade, DDD e nome de parceiro não
            definem a regra.
          </p>
          {p.regioes.map((r, i) => (
            <div key={i} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm">
                Estados (UFs separadas por vírgula)
                <Input
                  aria-label={`Estados da região ${i + 1}`}
                  value={r.ufs.join(",")}
                  onChange={(e) =>
                    editar({
                      regioes: p.regioes.map((v, j) =>
                        j === i
                          ? {
                              ...v,
                              ufs: e.target.value
                                .toUpperCase()
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            }
                          : v,
                      ),
                    })
                  }
                />
              </label>
              {minimo(
                r.minimoCentavos,
                (n) =>
                  editar({
                    regioes: p.regioes.map((v, j) => (j === i ? { ...v, minimoCentavos: n } : v)),
                  }),
                `Pedido mínimo da região ${i + 1} (R$)`,
              )}
              <label className="grid gap-2 text-sm">
                Frete da região
                <select
                  aria-label={`Frete da região ${i + 1}`}
                  className="rounded border bg-background p-2"
                  value={r.frete}
                  onChange={(e) =>
                    editar({
                      regioes: p.regioes.map((v, j) =>
                        j === i ? { ...v, frete: e.target.value as "CIF" | "FOB" } : v,
                      ),
                    })
                  }
                >
                  <option>CIF</option>
                  <option>FOB</option>
                </select>
              </label>
              <Button
                variant="outline"
                onClick={() => editar({ regioes: p.regioes.filter((_, j) => j !== i) })}
              >
                Remover região {i + 1}
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            disabled={p.regioes.length >= 27}
            onClick={() =>
              editar({ regioes: [...p.regioes, { ufs: [], minimoCentavos: 0, frete: "CIF" }] })
            }
          >
            Adicionar região
          </Button>
          <div className="grid gap-3 sm:grid-cols-2">
            {minimo(
              p.demais.minimoCentavos,
              (n) => editar({ demais: { ...p.demais, minimoCentavos: n } }),
              "Pedido mínimo das demais localidades (R$)",
            )}
            <label className="grid gap-2 text-sm">
              Frete das demais localidades
              <select
                className="rounded border bg-background p-2"
                value={p.demais.frete}
                onChange={(e) =>
                  editar({ demais: { ...p.demais, frete: e.target.value as "CIF" | "FOB" } })
                }
              >
                <option>CIF</option>
                <option>FOB</option>
              </select>
            </label>
          </div>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={p.pix}
              onChange={(e) => editar({ pix: e.target.checked })}
            />
            Aceitar Pix
          </label>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!p.cartao}
              onChange={(e) =>
                editar({ cartao: e.target.checked ? { maxParcelas: 1, juros: "consultar" } : null })
              }
            />
            Informar pagamento com cartão
          </label>
          {p.cartao && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm">
                Máximo de parcelas
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={p.cartao.maxParcelas}
                  onChange={(e) =>
                    editar({ cartao: { ...p.cartao!, maxParcelas: Number(e.target.value) } })
                  }
                />
              </label>
              <label className="grid gap-2 text-sm">
                Juros
                <select
                  className="rounded border bg-background p-2"
                  value={p.cartao.juros}
                  onChange={(e) =>
                    editar({
                      cartao: {
                        ...p.cartao!,
                        juros: e.target.value as NonNullable<Politica["cartao"]>["juros"],
                      },
                    })
                  }
                >
                  <option value="com_juros">Com juros; equipe confirma taxas</option>
                  <option value="sem_juros">Sem juros</option>
                  <option value="consultar">Equipe confirma as condições</option>
                </select>
              </label>
            </div>
          )}
          <label className="grid gap-2 text-sm">
            Boleto
            <select
              className="rounded border bg-background p-2"
              value={p.boleto ?? "nao_informar"}
              onChange={(e) =>
                editar({
                  boleto:
                    e.target.value === "nao_informar"
                      ? null
                      : (e.target.value as Politica["boleto"]),
                })
              }
            >
              <option value="nao_informar">Não informar disponibilidade</option>
              <option value="analise_credito">A prazo, sujeito à análise de crédito</option>
              <option value="consultar">Equipe confirma disponibilidade</option>
            </select>
          </label>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={p.bonificacaoFrete}
              onChange={(e) => editar({ bonificacaoFrete: e.target.checked })}
            />
            Mencionar bonificação em frete FOB quando o cliente pedir ajuda com o frete; a equipe
            confirma o valor
          </label>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={p.revisada}
              onChange={(e) => onChange({ ...p, revisada: e.target.checked })}
            />
            A equipe revisou estas condições comerciais
          </label>
          <Button variant="outline" onClick={() => onChange(null)}>
            Desabilitar respostas comerciais automáticas
          </Button>
        </>
      )}
    </section>
  );
}
