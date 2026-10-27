import { z } from "zod";
import { onlyDigits, variacoesTelefoneBR } from "./telefone";

export function normalizarNumeroIgnorado(valor: string): string {
  const digits = onlyDigits(valor);
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

export const numerosIgnoradosInput = z.array(
  z.string().trim().max(40)
    .refine((v) => /^[+\d\s().-]+$/.test(v), "Número inválido")
    .transform(normalizarNumeroIgnorado)
    .refine((v) => /^\d{10,15}$/.test(v), "Informe um número com DDD")
).transform((values) => [...new Set(values)]);

export function numeroIgnoradoIA(lista: readonly string[] | null | undefined, numero: string | null | undefined): boolean {
  if (!numero) return false;
  const variantes = new Set(variacoesTelefoneBR(numero.split("@")[0]));
  return (lista ?? []).some((item) => variacoesTelefoneBR(item).some((v) => variantes.has(v)));
}