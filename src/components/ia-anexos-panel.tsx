import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Image, Trash2, Upload, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listarIaAnexos, subirIaAnexo, alterarIaAnexo, removerIaAnexo } from "@/lib/ia-anexos.functions";
import { ANEXOS_BUCKET, type IaAnexo } from "@/lib/ia-anexos";
import { supabase } from "@/integrations/supabase/client";

export function IaAnexosPanel() {
  const listar = useServerFn(listarIaAnexos), subir = useServerFn(subirIaAnexo);
  const alterar = useServerFn(alterarIaAnexo), remover = useServerFn(removerIaAnexo);
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [categoria, setCategoria] = useState("imagem");
  const query = useQuery({ queryKey: ["ia_anexos"], queryFn: () => listar() });
  const m = useMutation({ mutationFn: async (files: File[]) => {
    for (const file of files) {
      const data = new FormData(); data.set("arquivo", file); data.set("categoria", file.type === "application/pdf" ? "catalogo" : categoria);
      await subir({ data });
    }
  }, onSuccess: () => toast.success("Anexos salvos"), onError: (e: Error) => toast.error(e.message),
    onSettled: () => { qc.invalidateQueries({ queryKey: ["ia_anexos"] }); if (input.current) input.current.value = ""; } });
  const change = useMutation({ mutationFn: async ({ row, apagar }: { row: IaAnexo; apagar?: boolean }) => {
    if (apagar) await remover({ data: row.id }); else await alterar({ data: { id: row.id, ativo: !row.ativo } });
  }, onSuccess: () => qc.invalidateQueries({ queryKey: ["ia_anexos"] }), onError: (e: Error) => toast.error(e.message) });
  async function abrir(row: IaAnexo) {
    const { data, error } = await supabase.storage.from(ANEXOS_BUCKET).createSignedUrl(row.storage_path, 60);
    if (error || !data) { toast.error("Não foi possível abrir o arquivo."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }
  return <section className="mt-5 space-y-4">
    <h3 className="font-semibold">Imagens e catálogo</h3>
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-48"><Label>Enviar quando pedirem</Label><Select value={categoria} onValueChange={setCategoria}>
        <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="imagem">Imagens dos produtos</SelectItem><SelectItem value="catalogo">Catálogo</SelectItem></SelectContent>
      </Select></div>
      <input ref={input} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,application/pdf" multiple
        onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) m.mutate(files); }} />
      <Button disabled={m.isPending} onClick={() => input.current?.click()}><Upload className="size-4" />{m.isPending ? "Enviando…" : "Subir arquivos"}</Button>
      <span className="text-xs text-muted-foreground">JPG, PNG, WebP ou PDF · até 20 MB</span>
    </div>
    {query.isLoading && <p className="text-sm text-muted-foreground">Carregando anexos…</p>}
    {query.isError && <p role="alert" className="text-sm text-destructive">Não foi possível carregar os anexos.</p>}
    {query.data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum anexo cadastrado.</p>}
    <ul className="divide-y divide-border">{query.data?.map((row) => <li key={row.id} className="flex items-center gap-3 py-3">
      {row.mime_type === "application/pdf" ? <FileText className="size-5 shrink-0 text-primary" /> : <Image className="size-5 shrink-0 text-primary" />}
      <div className="flex-1 min-w-0"><p className="text-sm break-all">{row.nome}</p><span className="text-xs text-muted-foreground">{row.categoria === "catalogo" ? "Catálogo" : "Imagens dos produtos"}</span></div>
      <Switch aria-label={`Ativar ${row.nome}`} checked={row.ativo} disabled={change.isPending} onCheckedChange={() => change.mutate({ row })} />
      <Button size="icon" variant="ghost" aria-label={`Abrir ${row.nome}`} title="Abrir arquivo" onClick={() => abrir(row)}><Eye className="size-4" /></Button>
      <Button size="icon" variant="ghost" aria-label={`Excluir ${row.nome}`} title="Excluir arquivo" disabled={change.isPending} onClick={() => { if (window.confirm(`Excluir ${row.nome}?`)) change.mutate({ row, apagar: true }); }}><Trash2 className="size-4" /></Button>
    </li>)}</ul>
  </section>;
}