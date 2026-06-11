import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type CidadeRegiao = {
  regiao: string;
  emoji: string;
  cidades: string[];
};

export const CIDADES_POR_REGIAO: CidadeRegiao[] = [
  {
    regiao: "Sudeste",
    emoji: "🌆",
    cidades: [
      "São Paulo - SP",
      "Rio de Janeiro - RJ",
      "Belo Horizonte - MG",
      "Vitória - ES",
      "Campinas - SP",
      "Santos - SP",
      "São Bernardo do Campo - SP",
      "Santo André - SP",
      "Guarulhos - SP",
      "Osasco - SP",
      "São José dos Campos - SP",
      "Ribeirão Preto - SP",
      "Sorocaba - SP",
      "Piracicaba - SP",
      "Bauru - SP",
      "Jundiaí - SP",
      "São José do Rio Preto - SP",
      "Niterói - RJ",
      "Nova Iguaçu - RJ",
      "Duque de Caxias - RJ",
      "Petrópolis - RJ",
      "Campos dos Goytacazes - RJ",
      "Volta Redonda - RJ",
      "Uberlândia - MG",
      "Contagem - MG",
      "Juiz de Fora - MG",
      "Betim - MG",
      "Montes Claros - MG",
      "Uberaba - MG",
      "Governador Valadares - MG",
      "Ipatinga - MG",
      "Vila Velha - ES",
      "Serra - ES",
      "Cariacica - ES",
    ],
  },
  {
    regiao: "Sul",
    emoji: "❄️",
    cidades: [
      "Curitiba - PR",
      "Porto Alegre - RS",
      "Florianópolis - SC",
      "Londrina - PR",
      "Maringá - PR",
      "Ponta Grossa - PR",
      "Cascavel - PR",
      "Foz do Iguaçu - PR",
      "São José dos Pinhais - PR",
      "Joinville - SC",
      "Blumenau - SC",
      "Itajaí - SC",
      "Chapecó - SC",
      "Criciúma - SC",
      "Balneário Camboriú - SC",
      "Caxias do Sul - RS",
      "Pelotas - RS",
      "Canoas - RS",
      "Santa Maria - RS",
      "Gravataí - RS",
      "Novo Hamburgo - RS",
      "São Leopoldo - RS",
      "Passo Fundo - RS",
    ],
  },
  {
    regiao: "Nordeste",
    emoji: "🌴",
    cidades: [
      "Salvador - BA",
      "Recife - PE",
      "Fortaleza - CE",
      "São Luís - MA",
      "Natal - RN",
      "João Pessoa - PB",
      "Maceió - AL",
      "Aracaju - SE",
      "Teresina - PI",
      "Feira de Santana - BA",
      "Vitória da Conquista - BA",
      "Camaçari - BA",
      "Ilhéus - BA",
      "Itabuna - BA",
      "Juazeiro - BA",
      "Jequié - BA",
      "Olinda - PE",
      "Jaboatão dos Guararapes - PE",
      "Caruaru - PE",
      "Petrolina - PE",
      "Paulista - PE",
      "Caucaia - CE",
      "Juazeiro do Norte - CE",
      "Sobral - CE",
      "Maracanaú - CE",
      "Mossoró - RN",
      "Parnamirim - RN",
      "Campina Grande - PB",
      "Arapiraca - AL",
      "Imperatriz - MA",
    ],
  },
  {
    regiao: "Centro-Oeste",
    emoji: "🌾",
    cidades: [
      "Brasília - DF",
      "Goiânia - GO",
      "Campo Grande - MS",
      "Cuiabá - MT",
      "Aparecida de Goiânia - GO",
      "Anápolis - GO",
      "Rio Verde - GO",
      "Luziânia - GO",
      "Várzea Grande - MT",
      "Rondonópolis - MT",
      "Sinop - MT",
      "Dourados - MS",
      "Três Lagoas - MS",
      "Corumbá - MS",
      "Taguatinga - DF",
      "Ceilândia - DF",
    ],
  },
  {
    regiao: "Norte",
    emoji: "🌳",
    cidades: [
      "Manaus - AM",
      "Belém - PA",
      "Porto Velho - RO",
      "Rio Branco - AC",
      "Boa Vista - RR",
      "Macapá - AP",
      "Palmas - TO",
      "Ananindeua - PA",
      "Santarém - PA",
      "Marabá - PA",
      "Castanhal - PA",
      "Parauapebas - PA",
      "Ji-Paraná - RO",
      "Ariquemes - RO",
      "Araguaína - TO",
    ],
  },
];

interface CidadeComboboxProps {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
}

export function CidadeCombobox({ value, onChange, onEnter }: CidadeComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const emojiSelecionado = useMemo(() => {
    for (const r of CIDADES_POR_REGIAO) {
      if (r.cidades.some((c) => c.toLowerCase() === value.toLowerCase())) return r.emoji;
    }
    return "📍";
  }, [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between bg-background font-normal h-10"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !open && value && onEnter) {
              e.preventDefault();
              onEnter();
            }
          }}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value ? (
              <>
                <span className="mr-2">{emojiSelecionado}</span>
                {value}
              </>
            ) : (
              "Selecione ou digite uma cidade"
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0 border-border bg-card"
        align="start"
      >
        <Command shouldFilter={true}>
          <CommandInput
            placeholder="Buscar cidade..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-80 overflow-y-auto scroll-smooth">
            <CommandEmpty>
              <div className="py-4 text-center text-sm">
                <p className="text-muted-foreground mb-2">Nenhuma cidade encontrada</p>
                {search.trim() && (
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => {
                      onChange(search.trim());
                      setSearch("");
                    }}
                  >
                    Usar "{search.trim()}"
                  </button>
                )}
              </div>
            </CommandEmpty>
            {CIDADES_POR_REGIAO.map((r, idx) => (
              <div key={r.regiao}>
                {idx > 0 && <CommandSeparator className="bg-border" />}
                <CommandGroup
                  heading={
                    <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <span>{r.emoji}</span>
                      <span>{r.regiao}</span>
                    </span>
                  }
                >
                  {r.cidades.map((cidade) => (
                    <CommandItem
                      key={`${r.regiao}-${cidade}`}
                      value={`${cidade} ${r.regiao}`}
                      onSelect={() => {
                        onChange(cidade);
                        // mantém o dropdown aberto pra facilitar troca rápida
                        setSearch("");
                      }}
                      className="cursor-pointer aria-selected:bg-primary/15 aria-selected:text-foreground data-[selected=true]:bg-primary/15 transition-colors duration-200"
                    >
                      <span className="mr-2 text-base">{r.emoji}</span>
                      <span className="flex-1">{cidade}</span>
                      {value.toLowerCase() === cidade.toLowerCase() && (
                        <Check className="ml-2 h-4 w-4 text-primary" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
