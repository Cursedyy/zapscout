import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { prepararChaveRascunhoMimo } from "./mimo-rascunho.functions";
import {
  chaveLocalRascunho,
  cifrarRascunho,
  decifrarRascunho,
  envelopeRascunhoSchema,
  importarChaveRascunho,
  type EscopoRascunho,
  type RascunhoPedido,
} from "./mimo-rascunho";
import {
  memoriaRascunhos as memoria,
  gravacoesRascunhos as gravacoes,
} from "./mimo-rascunho-memoria";

export function useMimoRascunho({
  escopo,
  valor,
  base,
  versaoBase,
  editavel,
  leadInicial,
  restaurar,
}: {
  escopo: EscopoRascunho;
  valor: RascunhoPedido;
  base: string;
  versaoBase: number;
  editavel: boolean;
  leadInicial?: string;
  restaurar: (r: RascunhoPedido) => void;
}) {
  const preparar = useServerFn(prepararChaveRascunhoMimo);
  const storageKey = chaveLocalRascunho(escopo);
  const [status, setStatus] = useState("restaurando"),
    [mensagem, setMensagem] = useState("");
  const [pronto, setPronto] = useState(false),
    [pendente, setPendente] = useState<RascunhoPedido | null>(null);
  const seq = useRef(0),
    parado = useRef(false),
    vivo = useRef(true);
  const aplicar = useRef(restaurar);
  aplicar.current = restaurar;
  const chaves = useRef(new Map<string, Promise<CryptoKey>>());
  async function chave(leadId: string | null) {
    const k = leadId ?? "sem-lead";
    if (!chaves.current.has(k)) {
      const promise = preparar({ data: { leadId, pedidoRef: escopo.pedidoRef } })
        .then((r) => {
          if (
            !r ||
            r.usuarioId !== escopo.usuarioId ||
            r.empresaId !== escopo.empresaId ||
            r.papel !== escopo.papel
          )
            throw Error("Sua sessão mudou. Reabra o Tira-pedido.");
          return importarChaveRascunho(r.chave);
        })
        .catch((e) => {
          chaves.current.delete(k);
          throw e;
        });
      chaves.current.set(k, promise);
    }
    return chaves.current.get(k)!;
  }
  useEffect(() => {
    vivo.current = true;
    parado.current = false;
    let cancelado = false;
    async function abrir() {
      if (!editavel) {
        setStatus("leitura");
        return;
      }
      try {
        const mem = memoria.get(storageKey);
        const raw = localStorage.getItem(storageKey);
        if (raw || mem) {
          const envelope = raw ? envelopeRascunhoSchema.parse(JSON.parse(raw)) : null;
          const lead = mem ? mem.valor.documento.leadId : envelope!.leadId;
          const autorizada = await chave(lead);
          const r = mem
            ? structuredClone(mem.valor)
            : await decifrarRascunho(envelope!, escopo, autorizada);
          if (cancelado) return;
          if (
            (mem?.versao ?? envelope!.versaoBase) !== versaoBase ||
            (leadInicial && r.documento.leadId !== leadInicial)
          ) {
            setPendente(r);
            setStatus("revisar");
            setMensagem(
              "Há um rascunho anterior. Confira antes de substituir os dados deste pedido.",
            );
            return;
          }
          aplicar.current(r);
          setMensagem("Rascunho recuperado neste navegador.");
        }
        if (!cancelado) {
          setPronto(true);
          setStatus(raw ? "salvo" : "pronto");
        }
      } catch (e) {
        if (!cancelado) {
          setStatus("falha");
          setMensagem(e instanceof Error ? e.message : "Não foi possível recuperar o rascunho.");
        }
      }
    }
    void abrir();
    return () => {
      cancelado = true;
      vivo.current = false;
    };
  }, [storageKey]);
  const serializado = JSON.stringify(valor);
  useEffect(() => {
    if (!pronto || !editavel || parado.current) return;
    if (serializado === base) {
      seq.current++;
      gravacoes.set(storageKey, Symbol());
      memoria.delete(storageKey);
      try {
        localStorage.removeItem(storageKey);
        setStatus("pronto");
        setMensagem("");
      } catch {
        setStatus("falha");
        setMensagem("Não foi possível remover o rascunho anterior deste navegador.");
      }
      return;
    }
    const versao = ++seq.current;
    const gravacao = Symbol();
    gravacoes.set(storageKey, gravacao);
    memoria.set(storageKey, { valor: structuredClone(valor), versao: versaoBase });
    setStatus("salvando");
    void (async () => {
      try {
        const envelope = await cifrarRascunho(
          valor,
          escopo,
          await chave(valor.documento.leadId),
          versaoBase,
        );
        if (parado.current || seq.current !== versao || gravacoes.get(storageKey) !== gravacao)
          return;
        localStorage.setItem(storageKey, JSON.stringify(envelope));
        if (vivo.current) {
          setStatus("salvo");
          setMensagem("Rascunho salvo automaticamente neste navegador.");
        }
      } catch (e) {
        if (vivo.current && seq.current === versao) {
          setStatus("falha");
          setMensagem(
            e instanceof Error ? e.message : "Não foi possível salvar o rascunho neste navegador.",
          );
        }
      }
    })();
  }, [serializado, pronto, storageKey, editavel]);
  useEffect(() => {
    if (status !== "salvando" && !(status === "falha" && serializado !== base)) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [status, serializado, base]);
  function limpar() {
    parado.current = true;
    seq.current++;
    gravacoes.set(storageKey, Symbol());
    memoria.delete(storageKey);
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    setPendente(null);
  }
  function recuperar() {
    if (pendente) {
      aplicar.current(pendente);
      setPendente(null);
      setPronto(true);
      setStatus("salvo");
    }
  }
  return {
    status,
    mensagem,
    limpar,
    recuperar,
    bloqueado: status === "restaurando" || status === "revisar",
  };
}
