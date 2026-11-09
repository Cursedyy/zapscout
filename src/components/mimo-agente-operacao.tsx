import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  enviarMaterialAgenteMimo,
  desativarMaterialAgenteMimo,
  responderAgenteMimo,
} from "@/lib/mimo-agente.functions";
export type MaterialPainelAgente = { id: string; nome: string; tipo: string; ativo: boolean };
export function MateriaisAgente({
  materiais,
  selecionados,
  selecionar,
}: {
  materiais: MaterialPainelAgente[];
  selecionados: string[];
  selecionar: (ids: string[]) => void;
}) {
  const [nome, setNome] = useState(""),
    [tipo, setTipo] = useState<"catalogo" | "apresentacao">("catalogo"),
    [arquivo, setArquivo] = useState<File | null>(null);
  const qc = useQueryClient(),
    atualizar = () => qc.invalidateQueries({ queryKey: ["mimo-agente"] });
  const upload = useMutation({
    mutationFn: async () => {
      if (!arquivo) throw Error("Selecione um arquivo.");
      if (arquivo.size > 5242880) throw Error("Use um arquivo de até 5 MB.");
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 8192)
        bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
      if (!["application/pdf", "image/png", "image/jpeg"].includes(arquivo.type))
        throw Error("Use PDF, PNG ou JPEG.");
      return enviarMaterialAgenteMimo({
        data: {
          nome: nome.trim() || arquivo.name,
          tipo,
          base64: btoa(bin),
          mime: arquivo.type as "application/pdf" | "image/png" | "image/jpeg",
        },
      });
    },
    onSuccess: () => {
      atualizar();
      setNome("");
      setArquivo(null);
      toast.success("Material guardado. Selecione-o e publique uma versão para autorizar o envio.");
    },
    onError: (e) => toast.error(e.message),
  });
  const desativar = useMutation({
    mutationFn: desativarMaterialAgenteMimo,
    onSuccess: () => {
      atualizar();
      toast.success("Material desativado para novos envios.");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h2 className="font-medium">Materiais privados aprovados</h2>
      <p className="text-sm text-muted-foreground">
        PDF, PNG ou JPEG, até 5 MB. Sem análise do conteúdo. Um material é enviado somente quando
        solicitado; a seleção é autorizada na publicação.
      </p>
      {materiais.map((m) => (
        <div key={m.id} className="flex flex-wrap items-center gap-2">
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!m.ativo}
              checked={selecionados.includes(m.id)}
              onChange={(e) =>
                selecionar(
                  e.target.checked
                    ? [...selecionados, m.id]
                    : selecionados.filter((id) => id !== m.id),
                )
              }
            />
            {m.nome} · {m.tipo} · {m.ativo ? "disponível" : "desativado"}
          </label>
          {m.ativo && (
            <Button
              variant="ghost"
              disabled={desativar.isPending}
              onClick={() => desativar.mutate({ data: { id: m.id } })}
            >
              Desativar
            </Button>
          )}
        </div>
      ))}
      <label className="grid gap-2 text-sm">
        Nome do material
        <Input value={nome} onChange={(e) => setNome(e.target.value)} />
      </label>
      <label className="grid gap-2 text-sm">
        Categoria
        <select
          className="rounded border bg-background p-2"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as typeof tipo)}
        >
          <option value="catalogo">Catálogo / mix</option>
          <option value="apresentacao">Apresentação</option>
        </select>
      </label>
      <Input
        aria-label="Arquivo aprovado"
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
      />
      <Button
        variant="outline"
        disabled={!arquivo || upload.isPending}
        onClick={() => upload.mutate()}
      >
        Guardar material privado
      </Button>
    </div>
  );
}
export function RespostaManualAgente({ conversa }: { conversa: string }) {
  const [texto, setTexto] = useState(""),
    [solicitacao, setSolicitacao] = useState(() => crypto.randomUUID());
  const qc = useQueryClient();
  const enviar = useMutation({
    mutationFn: responderAgenteMimo,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["mimo-agente"] });
      if (r.estado === "enviada") {
        toast.success("Resposta enviada. O agente permanece pausado nesta conversa.");
        setTexto("");
        setSolicitacao(crypto.randomUUID());
      } else
        toast.error(
          r.estado === "incerta"
            ? "Aceite incerto. Confira no WhatsApp; o sistema não repetirá o envio."
            : "Envio não confirmado: " + r.estado,
        );
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="space-y-2">
      <Textarea
        aria-label="Resposta manual"
        placeholder="Escreva uma resposta para o lead…"
        value={texto}
        maxLength={2000}
        onChange={(e) => {
          setTexto(e.target.value);
          if (enviar.isSuccess) setSolicitacao(crypto.randomUUID());
        }}
      />
      <Button
        disabled={!texto.trim() || enviar.isPending}
        onClick={() => enviar.mutate({ data: { conversa, texto, solicitacao } })}
      >
        Assumir e enviar resposta
      </Button>
    </div>
  );
}
