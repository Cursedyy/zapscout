import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ConfigTira } from "@/components/mimo-tira-config";
import { atualizarConsultasMimo } from "@/lib/mimo-cache";
import { tiraOptions } from "@/lib/mimo-tira.queries";

/** Product registration shortcut: the same catalog used by the Tira-pedido, saved directly. */
export function MimoProdutosPage() {
  const { data: contexto } = useSuspenseQuery(tiraOptions);
  const client = useQueryClient();
  return (
    <section className="min-h-dvh bg-background px-4 py-6 text-foreground md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Pedidos e entregas</p>
          <h1 className="text-2xl font-semibold">Produtos MiMo</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Cadastre novos produtos ou edite os existentes. O produto salvo aparece no Tira-pedido; para
            vender, marque como ativo com preço, unidade e peso confirmados.
          </p>
        </header>
        {!contexto.disponivel && (
          <p role="status" className="border-l-4 border-primary bg-accent px-4 py-3 text-sm">
            A gravação do catálogo está aguardando liberação segura. Você pode revisar os produtos, mas ainda não salvar.
          </p>
        )}
        <ConfigTira
          key={contexto.configVersao ?? "padrao"}
          contexto={contexto}
          area="catalogo"
          cadastroDireto
          refresh={() => void atualizarConsultasMimo(client)}
        />
      </div>
    </section>
  );
}
