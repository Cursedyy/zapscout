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

export type NichoCategoria = {
  categoria: string;
  emoji: string;
  itens: { emoji: string; nome: string }[];
};

export const NICHOS_CATEGORIAS: NichoCategoria[] = [
  {
    categoria: "Saúde",
    emoji: "🏥",
    itens: [
      { emoji: "🦷", nome: "Clínica odontológica" },
      { emoji: "🩺", nome: "Clínica médica" },
      { emoji: "💉", nome: "Clínica de vacinação" },
      { emoji: "🧬", nome: "Laboratório de análises clínicas" },
      { emoji: "🩺", nome: "Clínica de imagem / radiologia" },
      { emoji: "👁️", nome: "Oftalmologia" },
      { emoji: "👂", nome: "Otorrinolaringologia" },
      { emoji: "🧠", nome: "Neurologia" },
      { emoji: "❤️", nome: "Cardiologia" },
      { emoji: "🤰", nome: "Ginecologia e obstetrícia" },
      { emoji: "👶", nome: "Pediatria" },
      { emoji: "🦴", nome: "Ortopedia" },
      { emoji: "🧴", nome: "Dermatologia" },
      { emoji: "🧘", nome: "Acupuntura" },
      { emoji: "🌿", nome: "Quiropraxia" },
      { emoji: "🫁", nome: "Fisioterapia" },
      { emoji: "🗣️", nome: "Fonoaudiologia" },
      { emoji: "🧠", nome: "Psicologia" },
      { emoji: "🛋️", nome: "Psicanálise / terapia" },
      { emoji: "🥗", nome: "Nutricionista" },
      { emoji: "💊", nome: "Farmácia" },
      { emoji: "🌱", nome: "Farmácia de manipulação" },
      { emoji: "🐶", nome: "Clínica veterinária" },
    ],
  },
  {
    categoria: "Beleza & Estética",
    emoji: "💅",
    itens: [
      { emoji: "💇‍♀️", nome: "Salão de beleza" },
      { emoji: "💈", nome: "Barbearia" },
      { emoji: "💅", nome: "Studio de unhas" },
      { emoji: "💆", nome: "Clínica de estética" },
      { emoji: "✨", nome: "Estética facial" },
      { emoji: "🧖‍♀️", nome: "Spa / day spa" },
      { emoji: "💉", nome: "Harmonização facial" },
      { emoji: "👁️", nome: "Designer de sobrancelhas" },
      { emoji: "👀", nome: "Extensão de cílios" },
      { emoji: "🪒", nome: "Depilação a laser" },
      { emoji: "🌊", nome: "Bronzeamento" },
      { emoji: "💄", nome: "Maquiadora" },
      { emoji: "✂️", nome: "Cabeleireiro" },
      { emoji: "🚗", nome: "Estética automotiva" },
      { emoji: "💊", nome: "Loja de cosméticos" },
      { emoji: "🧴", nome: "Perfumaria" },
    ],
  },
  {
    categoria: "Fitness & Bem-estar",
    emoji: "🏋️",
    itens: [
      { emoji: "🏋️", nome: "Academia" },
      { emoji: "🧘‍♀️", nome: "Estúdio de pilates" },
      { emoji: "🧘", nome: "Estúdio de yoga" },
      { emoji: "🥊", nome: "Crossfit" },
      { emoji: "🥋", nome: "Artes marciais / jiu-jitsu" },
      { emoji: "🥊", nome: "Muay thai / boxe" },
      { emoji: "💃", nome: "Escola de dança" },
      { emoji: "🏊", nome: "Natação / hidroginástica" },
      { emoji: "🚴", nome: "Estúdio de spinning" },
      { emoji: "🏃", nome: "Assessoria de corrida" },
      { emoji: "👤", nome: "Personal trainer" },
      { emoji: "🧖", nome: "Massoterapia" },
    ],
  },
  {
    categoria: "Alimentação",
    emoji: "🍽️",
    itens: [
      { emoji: "🍽️", nome: "Restaurante" },
      { emoji: "🍕", nome: "Pizzaria" },
      { emoji: "🍔", nome: "Hamburgueria" },
      { emoji: "🍣", nome: "Restaurante japonês" },
      { emoji: "🥡", nome: "Comida chinesa" },
      { emoji: "🍝", nome: "Cantina italiana" },
      { emoji: "🥩", nome: "Churrascaria" },
      { emoji: "🌮", nome: "Comida mexicana" },
      { emoji: "🥗", nome: "Restaurante natural / vegano" },
      { emoji: "☕", nome: "Cafeteria" },
      { emoji: "🥐", nome: "Padaria" },
      { emoji: "🎂", nome: "Confeitaria / bolos" },
      { emoji: "🍫", nome: "Chocolataria" },
      { emoji: "🍦", nome: "Sorveteria" },
      { emoji: "🍧", nome: "Açaiteria" },
      { emoji: "🧃", nome: "Casa de sucos" },
      { emoji: "🍺", nome: "Bar / pub" },
      { emoji: "🍷", nome: "Adega / vinhos" },
      { emoji: "🥪", nome: "Lanchonete" },
      { emoji: "🚚", nome: "Food truck" },
      { emoji: "🍱", nome: "Marmitaria / fit food" },
      { emoji: "🛒", nome: "Mercado / mercearia" },
      { emoji: "🥬", nome: "Hortifruti" },
      { emoji: "🥩", nome: "Açougue" },
      { emoji: "🐟", nome: "Peixaria" },
    ],
  },
  {
    categoria: "Serviços profissionais",
    emoji: "💼",
    itens: [
      { emoji: "⚖️", nome: "Advogado" },
      { emoji: "🧾", nome: "Contador" },
      { emoji: "📐", nome: "Arquiteto" },
      { emoji: "🎨", nome: "Designer de interiores" },
      { emoji: "🏗️", nome: "Engenheiro civil" },
      { emoji: "📋", nome: "Despachante" },
      { emoji: "🔍", nome: "Investigador particular" },
      { emoji: "🗂️", nome: "Cartório" },
      { emoji: "🌐", nome: "Tradutor juramentado" },
      { emoji: "🛡️", nome: "Corretor de seguros" },
      { emoji: "💰", nome: "Consultor financeiro" },
      { emoji: "📊", nome: "Consultoria empresarial" },
      { emoji: "🧑‍💼", nome: "Recursos humanos / RH" },
      { emoji: "📣", nome: "Assessoria de imprensa" },
    ],
  },
  {
    categoria: "Casa & Reforma",
    emoji: "🏠",
    itens: [
      { emoji: "⚡", nome: "Eletricista" },
      { emoji: "🔧", nome: "Encanador" },
      { emoji: "🎨", nome: "Pintor" },
      { emoji: "🪵", nome: "Marceneiro" },
      { emoji: "🔩", nome: "Serralheria" },
      { emoji: "🪟", nome: "Vidraçaria" },
      { emoji: "🧱", nome: "Pedreiro / construção" },
      { emoji: "🧰", nome: "Marido de aluguel" },
      { emoji: "🛁", nome: "Reforma de banheiros" },
      { emoji: "🧹", nome: "Empresa de limpeza" },
      { emoji: "🐜", nome: "Dedetizadora" },
      { emoji: "🧺", nome: "Lavanderia" },
      { emoji: "🛋️", nome: "Móveis planejados" },
      { emoji: "🚪", nome: "Portas e janelas" },
      { emoji: "🌞", nome: "Energia solar" },
      { emoji: "❄️", nome: "Ar-condicionado" },
      { emoji: "📷", nome: "Câmeras de segurança" },
      { emoji: "🚨", nome: "Alarme / monitoramento" },
      { emoji: "🌳", nome: "Jardinagem / paisagismo" },
      { emoji: "🏊", nome: "Manutenção de piscinas" },
    ],
  },
  {
    categoria: "Automotivo",
    emoji: "🚗",
    itens: [
      { emoji: "🔧", nome: "Oficina mecânica" },
      { emoji: "🛠️", nome: "Funilaria e pintura" },
      { emoji: "⚡", nome: "Auto elétrica" },
      { emoji: "🛞", nome: "Borracharia" },
      { emoji: "🚿", nome: "Lava rápido" },
      { emoji: "✨", nome: "Polimento automotivo" },
      { emoji: "🪟", nome: "Película automotiva" },
      { emoji: "🚗", nome: "Locadora de veículos" },
      { emoji: "🏍️", nome: "Oficina de motos" },
      { emoji: "🚜", nome: "Mecânica de caminhões" },
      { emoji: "🔋", nome: "Loja de baterias" },
      { emoji: "🛻", nome: "Concessionária" },
      { emoji: "🅿️", nome: "Estacionamento" },
      { emoji: "🚛", nome: "Guincho 24h" },
    ],
  },
  {
    categoria: "Pets",
    emoji: "🐾",
    itens: [
      { emoji: "🐶", nome: "Pet shop" },
      { emoji: "✂️", nome: "Banho e tosa" },
      { emoji: "🏨", nome: "Hotel para cães" },
      { emoji: "🦮", nome: "Adestrador" },
      { emoji: "🚶", nome: "Dog walker" },
      { emoji: "💉", nome: "Vacinação de pets" },
      { emoji: "🐾", nome: "Creche para pets" },
    ],
  },
  {
    categoria: "Moda & Varejo",
    emoji: "🛍️",
    itens: [
      { emoji: "👗", nome: "Loja de roupas femininas" },
      { emoji: "👔", nome: "Loja de roupas masculinas" },
      { emoji: "👶", nome: "Loja infantil" },
      { emoji: "👟", nome: "Loja de calçados" },
      { emoji: "👜", nome: "Bolsas e acessórios" },
      { emoji: "💍", nome: "Joalheria" },
      { emoji: "⌚", nome: "Relojoaria" },
      { emoji: "👓", nome: "Ótica" },
      { emoji: "🧵", nome: "Costureira / ateliê" },
      { emoji: "👰", nome: "Loja de noivas" },
      { emoji: "🎽", nome: "Artigos esportivos" },
      { emoji: "🛏️", nome: "Cama, mesa e banho" },
      { emoji: "🎁", nome: "Loja de presentes" },
      { emoji: "📚", nome: "Livraria / papelaria" },
      { emoji: "🛒", nome: "Loja de departamentos" },
    ],
  },
  {
    categoria: "Imobiliário",
    emoji: "🏘️",
    itens: [
      { emoji: "🏢", nome: "Imobiliária" },
      { emoji: "🧑‍💼", nome: "Corretor de imóveis" },
      { emoji: "🏗️", nome: "Construtora" },
      { emoji: "🏠", nome: "Administradora de condomínios" },
      { emoji: "📐", nome: "Avaliação de imóveis" },
      { emoji: "📜", nome: "Despachante imobiliário" },
    ],
  },
  {
    categoria: "Educação",
    emoji: "🎓",
    itens: [
      { emoji: "🌍", nome: "Escola de idiomas" },
      { emoji: "🎓", nome: "Curso profissionalizante" },
      { emoji: "🧒", nome: "Escola infantil" },
      { emoji: "📚", nome: "Reforço escolar" },
      { emoji: "🎼", nome: "Escola de música" },
      { emoji: "🎨", nome: "Aulas de arte" },
      { emoji: "🥋", nome: "Escola de artes marciais" },
      { emoji: "💻", nome: "Curso de informática" },
      { emoji: "📈", nome: "Curso de marketing digital" },
      { emoji: "🚗", nome: "Autoescola" },
      { emoji: "🧠", nome: "Pré-vestibular" },
      { emoji: "🎓", nome: "Faculdade / universidade" },
    ],
  },
  {
    categoria: "Marketing & Criativo",
    emoji: "🎨",
    itens: [
      { emoji: "📈", nome: "Agência de marketing digital" },
      { emoji: "📣", nome: "Agência de publicidade" },
      { emoji: "🎨", nome: "Designer gráfico" },
      { emoji: "📷", nome: "Fotógrafo" },
      { emoji: "🎥", nome: "Videomaker / produtora" },
      { emoji: "🚁", nome: "Filmagem com drone" },
      { emoji: "💻", nome: "Desenvolvedor web" },
      { emoji: "📱", nome: "Desenvolvedor de apps" },
      { emoji: "📝", nome: "Copywriter / redator" },
      { emoji: "🔊", nome: "Estúdio de gravação" },
      { emoji: "🎙️", nome: "Produtor de podcast" },
    ],
  },
  {
    categoria: "Tecnologia",
    emoji: "💻",
    itens: [
      { emoji: "💻", nome: "Assistência técnica de computadores" },
      { emoji: "📱", nome: "Assistência técnica de celulares" },
      { emoji: "🖨️", nome: "Conserto de impressoras" },
      { emoji: "🌐", nome: "Provedor de internet" },
      { emoji: "☁️", nome: "Empresa de TI / cloud" },
      { emoji: "🔐", nome: "Segurança da informação" },
      { emoji: "🛒", nome: "Loja de eletrônicos" },
      { emoji: "🎮", nome: "Loja de games" },
    ],
  },
  {
    categoria: "Turismo & Eventos",
    emoji: "✈️",
    itens: [
      { emoji: "🏨", nome: "Hotel" },
      { emoji: "🛏️", nome: "Pousada" },
      { emoji: "🏕️", nome: "Camping / glamping" },
      { emoji: "✈️", nome: "Agência de viagens" },
      { emoji: "🚌", nome: "Locação de vans / fretamento" },
      { emoji: "🎉", nome: "Buffet de eventos" },
      { emoji: "👰", nome: "Cerimonialista / casamentos" },
      { emoji: "🎂", nome: "Festas infantis" },
      { emoji: "🎵", nome: "DJ / banda" },
      { emoji: "📸", nome: "Fotografia de eventos" },
      { emoji: "🏰", nome: "Espaço para eventos" },
      { emoji: "🎈", nome: "Decoração de festas" },
    ],
  },
  {
    categoria: "Indústria & Comércio",
    emoji: "🏭",
    itens: [
      { emoji: "🏭", nome: "Indústria / fábrica" },
      { emoji: "📦", nome: "Distribuidora" },
      { emoji: "🚚", nome: "Transportadora" },
      { emoji: "📬", nome: "Logística / fulfillment" },
      { emoji: "🛒", nome: "Atacadista" },
      { emoji: "🏗️", nome: "Material de construção" },
      { emoji: "🪑", nome: "Loja de móveis" },
      { emoji: "💡", nome: "Loja de iluminação" },
      { emoji: "🔧", nome: "Loja de ferragens" },
      { emoji: "🌾", nome: "Agropecuária" },
    ],
  },
  {
    categoria: "Religião & Comunidade",
    emoji: "⛪",
    itens: [
      { emoji: "⛪", nome: "Igreja" },
      { emoji: "🕍", nome: "Templo" },
      { emoji: "🤝", nome: "ONG / instituição" },
      { emoji: "🏛️", nome: "Associação / sindicato" },
    ],
  },
];

interface NichoComboboxProps {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
}

export function NichoCombobox({ value, onChange, onEnter }: NichoComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const todosNichos = useMemo(
    () => NICHOS_CATEGORIAS.flatMap((c) => c.itens.map((i) => i.nome)),
    [],
  );

  const emojiSelecionado = useMemo(() => {
    for (const cat of NICHOS_CATEGORIAS) {
      const m = cat.itens.find((i) => i.nome.toLowerCase() === value.toLowerCase());
      if (m) return m.emoji;
    }
    return "";
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
                {emojiSelecionado && <span className="mr-2">{emojiSelecionado}</span>}
                {value}
              </>
            ) : (
              "Selecione ou digite um nicho"
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
            placeholder="Buscar nicho..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-80 overflow-y-auto scroll-smooth">
            <CommandEmpty>
              <div className="py-4 text-center text-sm">
                <p className="text-muted-foreground mb-2">Nenhum nicho encontrado</p>
                {search.trim() && (
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => {
                      onChange(search.trim());
                      setOpen(false);
                    }}
                  >
                    Usar "{search.trim()}"
                  </button>
                )}
              </div>
            </CommandEmpty>
            {NICHOS_CATEGORIAS.map((cat, idx) => (
              <div key={cat.categoria}>
                {idx > 0 && <CommandSeparator className="bg-border" />}
                <CommandGroup
                  heading={
                    <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <span>{cat.emoji}</span>
                      <span>{cat.categoria}</span>
                    </span>
                  }
                >
                  {cat.itens.map((item) => (
                    <CommandItem
                      key={`${cat.categoria}-${item.nome}`}
                      value={`${item.nome} ${cat.categoria}`}
                      onSelect={() => {
                        onChange(item.nome);
                        setOpen(false);
                        setSearch("");
                      }}
                      className="cursor-pointer aria-selected:bg-primary/15 aria-selected:text-foreground data-[selected=true]:bg-primary/15 transition-colors duration-200"
                    >
                      <span className="mr-2 text-base">{item.emoji}</span>
                      <span className="flex-1">{item.nome}</span>
                      {value.toLowerCase() === item.nome.toLowerCase() && (
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

export const NICHOS_LISTA_PLANA = NICHOS_CATEGORIAS.flatMap((c) =>
  c.itens.map((i) => i.nome),
);
