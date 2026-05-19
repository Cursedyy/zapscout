// TODO: Integrar Google Places API
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
};

export const MOCK_LEADS: MockLead[] = [
  { id: "m1", nome: "Clínica Odontológica Sorriso Pleno", nicho: "clínica odontológica", cidade: "São Paulo - SP", endereco: "R. Augusta, 1200 - Consolação", telefone: "(11) 98123-4501", site: null, avaliacao: 4.6, totalAvaliacoes: 312, lat: -23.55, lng: -46.66 },
  { id: "m2", nome: "OdontoVida Pinheiros", nicho: "clínica odontológica", cidade: "São Paulo - SP", endereco: "R. dos Pinheiros, 540", telefone: "(11) 99812-3344", site: "odontovida.com.br", avaliacao: 3.2, totalAvaliacoes: 89, lat: -23.56, lng: -46.69 },
  { id: "m3", nome: "Sorriso Lindo Odonto", nicho: "clínica odontológica", cidade: "São Paulo - SP", endereco: "Av. Paulista, 2300", telefone: "(11) 97123-7788", site: null, avaliacao: 2.9, totalAvaliacoes: 41, lat: -23.56, lng: -46.65 },
  { id: "m4", nome: "Restaurante Sabor da Vila", nicho: "restaurante", cidade: "São Paulo - SP", endereco: "R. Aspicuelta, 230 - Vila Madalena", telefone: "(11) 95566-2200", site: null, avaliacao: 4.3, totalAvaliacoes: 528, lat: -23.55, lng: -46.69 },
  { id: "m5", nome: "Cantina Bella Massa", nicho: "restaurante", cidade: "São Paulo - SP", endereco: "R. Wisard, 90", telefone: "(11) 94422-9988", site: "bellamassa.com.br", avaliacao: 4.7, totalAvaliacoes: 1024, lat: -23.55, lng: -46.69 },
  { id: "m6", nome: "Hamburgueria do Zé", nicho: "restaurante", cidade: "São Paulo - SP", endereco: "R. Harmonia, 412", telefone: "(11) 93311-4477", site: null, avaliacao: 3.1, totalAvaliacoes: 76, lat: -23.55, lng: -46.69 },
  { id: "m7", nome: "Pet Shop Amigo Fiel", nicho: "pet shop", cidade: "São Paulo - SP", endereco: "Av. Brigadeiro Faria Lima, 1500", telefone: "(11) 92211-3344", site: null, avaliacao: 4.1, totalAvaliacoes: 203, lat: -23.57, lng: -46.69 },
  { id: "m8", nome: "Clínica Veterinária Patinhas", nicho: "pet shop", cidade: "São Paulo - SP", endereco: "R. Teodoro Sampaio, 800", telefone: "(11) 91144-5566", site: null, avaliacao: 4.8, totalAvaliacoes: 412, lat: -23.56, lng: -46.68 },
  { id: "m9", nome: "Mundo Pet & Cia", nicho: "pet shop", cidade: "Campinas - SP", endereco: "Av. Norte-Sul, 220", telefone: "(19) 99887-1122", site: null, avaliacao: 3.4, totalAvaliacoes: 58, lat: -22.91, lng: -47.06 },
  { id: "m10", nome: "Salão Beauty Studio", nicho: "salão de beleza", cidade: "São Paulo - SP", endereco: "R. Oscar Freire, 900", telefone: "(11) 98899-2233", site: "beautystudio.com.br", avaliacao: 4.5, totalAvaliacoes: 287, lat: -23.56, lng: -46.67 },
  { id: "m11", nome: "Barbearia Vila Real", nicho: "barbearia", cidade: "São Paulo - SP", endereco: "R. Cardeal Arcoverde, 300", telefone: "(11) 97766-1133", site: null, avaliacao: 4.9, totalAvaliacoes: 612, lat: -23.56, lng: -46.69 },
  { id: "m12", nome: "Academia FitPower", nicho: "academia", cidade: "São Paulo - SP", endereco: "Av. Rebouças, 1100", telefone: "(11) 96655-9988", site: null, avaliacao: 3.8, totalAvaliacoes: 198, lat: -23.56, lng: -46.68 },
  { id: "m13", nome: "Studio Pilates Bem-Estar", nicho: "academia", cidade: "São Paulo - SP", endereco: "R. Joaquim Floriano, 500", telefone: "(11) 95544-2211", site: null, avaliacao: 4.6, totalAvaliacoes: 145, lat: -23.58, lng: -46.68 },
  { id: "m14", nome: "Advocacia Silva & Associados", nicho: "advocacia", cidade: "São Paulo - SP", endereco: "R. Bela Cintra, 1200", telefone: "(11) 94433-7766", site: "silvaassoc.adv.br", avaliacao: 4.4, totalAvaliacoes: 67, lat: -23.56, lng: -46.66 },
  { id: "m15", nome: "Contabilidade Moderna", nicho: "contabilidade", cidade: "São Paulo - SP", endereco: "R. da Consolação, 2500", telefone: "(11) 93322-6655", site: null, avaliacao: 3.6, totalAvaliacoes: 42, lat: -23.55, lng: -46.66 },
  { id: "m16", nome: "Escritório Contábil Vila Mariana", nicho: "contabilidade", cidade: "São Paulo - SP", endereco: "R. Vergueiro, 3000", telefone: "(11) 92211-5544", site: null, avaliacao: 4.2, totalAvaliacoes: 88, lat: -23.59, lng: -46.63 },
  { id: "m17", nome: "Imobiliária Casa Nova", nicho: "imobiliária", cidade: "São Paulo - SP", endereco: "Av. Ibirapuera, 2000", telefone: "(11) 91100-4433", site: "casanovaimoveis.com.br", avaliacao: 3.9, totalAvaliacoes: 156, lat: -23.61, lng: -46.66 },
  { id: "m18", nome: "Corretor Premium Imóveis", nicho: "imobiliária", cidade: "São Paulo - SP", endereco: "Av. Brigadeiro Luís Antônio, 1500", telefone: "(11) 99887-3322", site: null, avaliacao: 4.7, totalAvaliacoes: 213, lat: -23.57, lng: -46.65 },
  { id: "m19", nome: "Padaria Pão Quente", nicho: "padaria", cidade: "São Paulo - SP", endereco: "R. Heitor Penteado, 800", telefone: "(11) 98776-2211", site: null, avaliacao: 4.3, totalAvaliacoes: 421, lat: -23.55, lng: -46.7 },
  { id: "m20", nome: "Confeitaria Doce Lar", nicho: "padaria", cidade: "São Paulo - SP", endereco: "R. Cardeal Leme, 200", telefone: "(11) 97665-1100", site: null, avaliacao: 2.8, totalAvaliacoes: 34, lat: -23.55, lng: -46.7 },
  { id: "m21", nome: "Auto Elétrica do João", nicho: "oficina mecânica", cidade: "Guarulhos - SP", endereco: "R. Tapajós, 450", telefone: "(11) 96554-8877", site: null, avaliacao: 4.5, totalAvaliacoes: 92, lat: -23.46, lng: -46.53 },
  { id: "m22", nome: "Oficina Turbo Car", nicho: "oficina mecânica", cidade: "Guarulhos - SP", endereco: "Av. Tiradentes, 1200", telefone: "(11) 95443-7766", site: null, avaliacao: 3.3, totalAvaliacoes: 51, lat: -23.46, lng: -46.53 },
  { id: "m23", nome: "Energia Solar Brilho Mais", nicho: "energia solar", cidade: "Campinas - SP", endereco: "Av. José de Souza Campos, 800", telefone: "(19) 94332-6655", site: "brilhomais.com.br", avaliacao: 4.6, totalAvaliacoes: 78, lat: -22.89, lng: -47.05 },
  { id: "m24", nome: "Solar Power Instalações", nicho: "energia solar", cidade: "Campinas - SP", endereco: "R. Barão de Jaguara, 1500", telefone: "(19) 93221-5544", site: null, avaliacao: 3.5, totalAvaliacoes: 29, lat: -22.9, lng: -47.06 },
  { id: "m25", nome: "Pizzaria Forno a Lenha", nicho: "restaurante", cidade: "Rio de Janeiro - RJ", endereco: "R. Visconde de Pirajá, 500 - Ipanema", telefone: "(21) 98899-4433", site: null, avaliacao: 4.4, totalAvaliacoes: 678, lat: -22.98, lng: -43.2 },
  { id: "m26", nome: "Clínica Estética Renove", nicho: "estética", cidade: "Rio de Janeiro - RJ", endereco: "Av. Atlântica, 2000 - Copacabana", telefone: "(21) 97788-3322", site: null, avaliacao: 4.8, totalAvaliacoes: 234, lat: -22.97, lng: -43.18 },
  { id: "m27", nome: "Studio Estética Bella", nicho: "estética", cidade: "Belo Horizonte - MG", endereco: "R. Pernambuco, 1100 - Savassi", telefone: "(31) 98877-2211", site: null, avaliacao: 3.7, totalAvaliacoes: 89, lat: -19.93, lng: -43.93 },
  { id: "m28", nome: "Restaurante Mineiro Tradicional", nicho: "restaurante", cidade: "Belo Horizonte - MG", endereco: "Av. do Contorno, 5000", telefone: "(31) 97766-1100", site: null, avaliacao: 4.5, totalAvaliacoes: 521, lat: -19.93, lng: -43.93 },
  { id: "m29", nome: "Corretora Seguros Total", nicho: "seguros", cidade: "São Paulo - SP", endereco: "Av. Faria Lima, 3000", telefone: "(11) 96655-7788", site: null, avaliacao: 4.1, totalAvaliacoes: 47, lat: -23.58, lng: -46.69 },
  { id: "m30", nome: "Agência de Viagens Vai Voar", nicho: "agência de viagens", cidade: "São Paulo - SP", endereco: "R. da Consolação, 1800", telefone: "(11) 95544-6677", site: null, avaliacao: 2.7, totalAvaliacoes: 28, lat: -23.55, lng: -46.66 },
];
