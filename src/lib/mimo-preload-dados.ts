import type { QueryClient } from '@tanstack/react-query';
import { periodoInicialMimo } from './mimo-periodo';

/** Leituras autenticadas com as mesmas chaves das telas; nunca inicia ações comerciais. */
export async function preloadDadosMimo(to: string, qc: QueryClient) {
  const staleTime = 60_000;
  switch (to) {
    case '/mimo': {
      const { dashboardMimo } = await import('./mimo-dashboard.functions');
      const filtro = periodoInicialMimo(30);
      return qc.prefetchQuery({ queryKey: ['mimo-dashboard', filtro], queryFn: () => dashboardMimo({ data: filtro }), staleTime });
    }
    case '/mimo/relatorios': {
      const { relatorioMimo } = await import('./mimo-relatorio.functions');
      const filtro = periodoInicialMimo(7);
      return qc.prefetchQuery({ queryKey: ['mimo-relatorio', filtro], queryFn: () => relatorioMimo({ data: filtro }), staleTime });
    }
    case '/mimo/leads': {
      const { contextoMimoOptions } = await import('./mimo-contexto');
      const { leadsMimoOptions, filtrosIniciais } = await import('@/components/mimo-leads-page');
      const c = await qc.fetchQuery({ ...contextoMimoOptions, staleTime });
      return qc.prefetchQuery({ ...leadsMimoOptions(c.usuarioId, filtrosIniciais), staleTime });
    }
    case '/mimo/carteira': {
      const { contextoMimoOptions } = await import('./mimo-contexto');
      const { filtrosCarteiraSchema } = await import('./mimo-carteira');
      const { listarCarteiraMimo } = await import('./mimo-carteira.functions');
      const c = await qc.fetchQuery({ ...contextoMimoOptions, staleTime });
      const filtro = filtrosCarteiraSchema.parse({});
      return qc.prefetchQuery({ queryKey: ['mimo-carteira', c.empresaId, c.usuarioId, filtro], queryFn: () => listarCarteiraMimo({ data: filtro }), staleTime });
    }
    case '/mimo/tira-pedido': {
      const { tiraOptions } = await import('@/components/mimo-tira-page');
      const { listarPedidosMimo } = await import('./mimo-pedido.functions');
      const { filtroPedidosSchema } = await import('./mimo-tira-regras');
      const c = await qc.fetchQuery({ ...tiraOptions, staleTime });
      if (!c.disponivel) return;
      const filtro = filtroPedidosSchema.parse({});
      return qc.prefetchQuery({ queryKey: ['mimo-tira-lista', filtro], queryFn: () => listarPedidosMimo({ data: filtro }), staleTime });
    }
    case '/mimo/meta-ads': {
      const { importacoesMetaOptions } = await import('@/components/mimo-meta-ads-page');
      return qc.prefetchQuery({ ...importacoesMetaOptions, staleTime });
    }
    case '/mimo/equipe': {
      const { listarEquipeMimo } = await import('./mimo-equipe.functions');
      return qc.prefetchQuery({ queryKey: ['mimo-equipe'], queryFn: () => listarEquipeMimo(), staleTime });
    }
    case '/mimo/perdas': {
      const { perdasMimo } = await import('./mimo-leads.functions');
      const filtro = { inicio: null, fim: null };
      return qc.prefetchQuery({ queryKey: ['mimo-perdas', filtro], queryFn: () => perdasMimo({ data: filtro }), staleTime });
    }
    case '/mimo/whatsapp': {
      const { estadoWhatsAppMimo } = await import('./mimo-whatsapp.functions');
      return qc.prefetchQuery({ queryKey: ['mimo-whatsapp-conexao'], queryFn: () => estadoWhatsAppMimo(), staleTime: 10_000 });
    }
  }
}
