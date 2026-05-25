// Tipo compartilhado do shape de lead vindo do Firecrawl / CRM.
// Mantido aqui pelo nome histórico — não há mais dados fictícios neste arquivo.
export type MockLead = {
  id: string;
  nome: string;
  nicho: string;
  cidade: string;
  endereco: string;
  telefone: string; // formato (11) 99999-9999
  site: string | null;
  avaliacao: number;
  totalAvaliacoes: number;
  lat: number;
  lng: number;
  source?: "apify" | "serpapi" | "n8n";
};
