import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RetornoPorCodigo } from "@/lib/mimo-retorno-campanhas";

const VAZIO = "—";
const brl = (c: number | null) =>
  c === null ? VAZIO : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: number | null) => (v === null ? VAZIO : v.toLocaleString("pt-BR"));
const vezes = (v: number | null) =>
  v === null ? VAZIO : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`;

/** Investimento x retorno por código de campanha (centro de custo), apenas com vínculos exatos. */
export function MimoRetornoCodigos({ dados }: { dados: RetornoPorCodigo | null }) {
  return (
    <section aria-labelledby="retorno-codigos" className="mt-8">
      <h2 id="retorno-codigos" className="font-medium">
        Retorno por código de campanha
      </h2>
      {!dados ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Códigos de campanha ainda não ativados no banco. Os números acima continuam válidos.
        </p>
      ) : !dados.codigos.length ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Nenhum código cadastrado. Cadastre os códigos e vincule as campanhas Meta em Meta Ads.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <Table aria-label="Retorno por código de campanha">
            <TableHeader>
              <TableRow>
                {[
                  "Código",
                  "Investimento",
                  "Leads CRM",
                  "Custo por lead",
                  "Pedidos",
                  "Faturamento",
                  "CAC",
                  "Retorno",
                ].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.codigos.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <span className="font-mono">{c.codigo}</span>
                    {!c.ativo && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        (arquivado)
                      </span>
                    )}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {c.nome}
                    </span>
                  </TableCell>
                  <TableCell>
                    {brl(c.investimento)}
                    <span className="block text-xs text-muted-foreground">
                      Meta {brl(c.investimentoMeta)} · manual {brl(c.investimentoManual)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {num(c.leadsCrm)}
                    {c.leadsAutomaticos > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        {num(c.leadsAutomaticos)} pelo anúncio
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{brl(c.cplCrm)}</TableCell>
                  <TableCell>{num(c.pedidos)}</TableCell>
                  <TableCell>{brl(c.receita)}</TableCell>
                  <TableCell>{brl(c.cac)}</TableCell>
                  <TableCell>{vezes(c.roas)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40">
                <TableCell className="font-medium">
                  Não atribuídos
                  <span className="block text-xs font-normal text-muted-foreground">
                    Sem código no lead / Meta sem vínculo
                  </span>
                </TableCell>
                <TableCell>
                  {brl(dados.semCodigo.investimentoMeta)}
                  <span className="block text-xs text-muted-foreground">Meta sem código</span>
                </TableCell>
                <TableCell>{num(dados.semCodigo.leads)}</TableCell>
                <TableCell>{VAZIO}</TableCell>
                <TableCell>{num(dados.semCodigo.pedidos)}</TableCell>
                <TableCell>{brl(dados.semCodigo.receita)}</TableCell>
                <TableCell>{VAZIO}</TableCell>
                <TableCell>{VAZIO}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="mt-2 text-xs text-muted-foreground">
            Investimento = campanhas Meta vinculadas pelo ID (linhas inteiras no período) +
            lançamentos manuais pela competência. Leads entram pelo código gravado no lead; pedidos
            herdam pelo lead exato e contam com a primeira confirmação no período. Faturamento soma
            pedidos faturados, enviados e entregues. “—” significa indisponível, não zero.
            {!dados.metaComIds &&
              " O relatório Meta ainda não tem IDs de campanha: o investimento Meta vinculado fica indisponível."}
          </p>
        </div>
      )}
    </section>
  );
}
