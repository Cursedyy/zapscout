export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agente_templates: {
        Row: {
          cargo: string
          created_at: string
          diferenciais: string
          horario_fim: string
          horario_inicio: string
          horario_modo: string
          id: string
          mensagem_boas_vindas: string
          mensagens_para_escalar: number
          nicho: string
          nome: string
          nome_agencia: string
          nome_agente: string
          objetivos: Json
          restricoes: string
          servicos: string
          tom: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cargo?: string
          created_at?: string
          diferenciais?: string
          horario_fim?: string
          horario_inicio?: string
          horario_modo?: string
          id?: string
          mensagem_boas_vindas?: string
          mensagens_para_escalar?: number
          nicho?: string
          nome: string
          nome_agencia?: string
          nome_agente?: string
          objetivos?: Json
          restricoes?: string
          servicos?: string
          tom?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cargo?: string
          created_at?: string
          diferenciais?: string
          horario_fim?: string
          horario_inicio?: string
          horario_modo?: string
          id?: string
          mensagem_boas_vindas?: string
          mensagens_para_escalar?: number
          nicho?: string
          nome?: string
          nome_agencia?: string
          nome_agente?: string
          objetivos?: Json
          restricoes?: string
          servicos?: string
          tom?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      aquecimento_chips: {
        Row: {
          ativo: boolean
          created_at: string
          dia_referencia: string | null
          dias_semana: number[]
          duracao_dias: number
          horario_fim: string
          horario_inicio: string
          id: string
          iniciado_em: string | null
          intensidade: string
          mensagens_hoje: number
          nome: string | null
          numero_destino: string | null
          proximo_envio_em: string | null
          status: string
          tipo_mensagem: string
          total_enviadas: number
          ultimo_envio_em: string | null
          ultimo_erro: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          dia_referencia?: string | null
          dias_semana?: number[]
          duracao_dias?: number
          horario_fim?: string
          horario_inicio?: string
          id?: string
          iniciado_em?: string | null
          intensidade?: string
          mensagens_hoje?: number
          nome?: string | null
          numero_destino?: string | null
          proximo_envio_em?: string | null
          status?: string
          tipo_mensagem?: string
          total_enviadas?: number
          ultimo_envio_em?: string | null
          ultimo_erro?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          dia_referencia?: string | null
          dias_semana?: number[]
          duracao_dias?: number
          horario_fim?: string
          horario_inicio?: string
          id?: string
          iniciado_em?: string | null
          intensidade?: string
          mensagens_hoje?: number
          nome?: string | null
          numero_destino?: string | null
          proximo_envio_em?: string | null
          status?: string
          tipo_mensagem?: string
          total_enviadas?: number
          ultimo_envio_em?: string | null
          ultimo_erro?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      campanha_cron_runs: {
        Row: {
          campanhas_consideradas: number
          campanhas_iniciadas: number
          concluidas: number
          created_at: string
          detalhes: Json
          duration_ms: number | null
          error_message: string | null
          erros: number
          finished_at: string | null
          id: string
          leads_selecionados: number
          mensagens_enviadas: number
          ok: boolean
          pulados: number
          started_at: string
        }
        Insert: {
          campanhas_consideradas?: number
          campanhas_iniciadas?: number
          concluidas?: number
          created_at?: string
          detalhes?: Json
          duration_ms?: number | null
          error_message?: string | null
          erros?: number
          finished_at?: string | null
          id?: string
          leads_selecionados?: number
          mensagens_enviadas?: number
          ok?: boolean
          pulados?: number
          started_at?: string
        }
        Update: {
          campanhas_consideradas?: number
          campanhas_iniciadas?: number
          concluidas?: number
          created_at?: string
          detalhes?: Json
          duration_ms?: number | null
          error_message?: string | null
          erros?: number
          finished_at?: string | null
          id?: string
          leads_selecionados?: number
          mensagens_enviadas?: number
          ok?: boolean
          pulados?: number
          started_at?: string
        }
        Relationships: []
      }
      campanha_dispatch_logs: {
        Row: {
          attempt: number | null
          campanha_id: string | null
          campanha_nome: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          http_status: number | null
          id: string
          lead_id: string | null
          lead_nome: string | null
          numero: string | null
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          attempt?: number | null
          campanha_id?: string | null
          campanha_nome?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          http_status?: number | null
          id?: string
          lead_id?: string | null
          lead_nome?: string | null
          numero?: string | null
          started_at?: string
          status: string
          user_id: string
        }
        Update: {
          attempt?: number | null
          campanha_id?: string | null
          campanha_nome?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          http_status?: number | null
          id?: string
          lead_id?: string | null
          lead_nome?: string | null
          numero?: string | null
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanha_dispatch_logs_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_dispatch_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      campanhas: {
        Row: {
          agendamento: string | null
          created_at: string
          filtros: Json
          id: string
          intervalo_segundos: number
          items: Json
          last_sent_at: string | null
          limite_por_hora: number
          mensagem: string
          mensagem_override: string | null
          nome: string
          segmento_alvo: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["campanha_status"]
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agendamento?: string | null
          created_at?: string
          filtros?: Json
          id?: string
          intervalo_segundos?: number
          items?: Json
          last_sent_at?: string | null
          limite_por_hora?: number
          mensagem: string
          mensagem_override?: string | null
          nome: string
          segmento_alvo?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["campanha_status"]
          template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agendamento?: string | null
          created_at?: string
          filtros?: Json
          id?: string
          intervalo_segundos?: number
          items?: Json
          last_sent_at?: string | null
          limite_por_hora?: number
          mensagem?: string
          mensagem_override?: string | null
          nome?: string
          segmento_alvo?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["campanha_status"]
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      empresa_membros: {
        Row: {
          adicionado_por: string | null
          ativo: boolean
          created_at: string
          empresa_id: string
          id: string
          papel: Database["public"]["Enums"]["empresa_papel"]
          updated_at: string
          user_id: string
        }
        Insert: {
          adicionado_por?: string | null
          ativo?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          papel?: Database["public"]["Enums"]["empresa_papel"]
          updated_at?: string
          user_id: string
        }
        Update: {
          adicionado_por?: string | null
          ativo?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          papel?: Database["public"]["Enums"]["empresa_papel"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresa_membros_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          ativa: boolean
          created_at: string
          id: string
          nome: string
          slug: string
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome: string
          slug: string
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      envios_manuais_fila: {
        Row: {
          agendado_para: string
          campanha_id: string | null
          created_at: string
          enviado_em: string | null
          id: string
          lead_id: string | null
          numero: string
          status: string
          step: number | null
          tentativas: number
          texto: string
          uazapi_message_id: string | null
          ultimo_erro: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agendado_para?: string
          campanha_id?: string | null
          created_at?: string
          enviado_em?: string | null
          id?: string
          lead_id?: string | null
          numero: string
          status?: string
          step?: number | null
          tentativas?: number
          texto: string
          uazapi_message_id?: string | null
          ultimo_erro?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agendado_para?: string
          campanha_id?: string | null
          created_at?: string
          enviado_em?: string | null
          id?: string
          lead_id?: string | null
          numero?: string
          status?: string
          step?: number | null
          tentativas?: number
          texto?: string
          uazapi_message_id?: string | null
          ultimo_erro?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      feedbacks: {
        Row: {
          categoria: string
          created_at: string
          id: string
          imagem_path: string | null
          mensagem: string
          resolvido: boolean
          resolvido_em: string | null
          respondido_em: string | null
          respondido_por: string | null
          resposta: string | null
          user_id: string
        }
        Insert: {
          categoria?: string
          created_at?: string
          id?: string
          imagem_path?: string | null
          mensagem: string
          resolvido?: boolean
          resolvido_em?: string | null
          respondido_em?: string | null
          respondido_por?: string | null
          resposta?: string | null
          user_id: string
        }
        Update: {
          categoria?: string
          created_at?: string
          id?: string
          imagem_path?: string | null
          mensagem?: string
          resolvido?: boolean
          resolvido_em?: string | null
          respondido_em?: string | null
          respondido_por?: string | null
          resposta?: string | null
          user_id?: string
        }
        Relationships: []
      }
      followups: {
        Row: {
          ativo: boolean
          campanha_id: string
          created_at: string
          dias_espera: number
          id: string
          mensagem: string
          numero: number
        }
        Insert: {
          ativo?: boolean
          campanha_id: string
          created_at?: string
          dias_espera?: number
          id?: string
          mensagem: string
          numero: number
        }
        Update: {
          ativo?: boolean
          campanha_id?: string
          created_at?: string
          dias_espera?: number
          id?: string
          mensagem?: string
          numero?: number
        }
        Relationships: [
          {
            foreignKeyName: "followups_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          plan_id: string | null
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          plan_id?: string | null
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          plan_id?: string | null
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      ia_anexos: {
        Row: {
          ativo: boolean
          categoria: string
          created_at: string
          id: string
          mime_type: string
          nome: string
          storage_path: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          categoria: string
          created_at?: string
          id?: string
          mime_type: string
          nome: string
          storage_path: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          id?: string
          mime_type?: string
          nome?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      ia_config: {
        Row: {
          ativa: boolean
          cargo: string
          created_at: string
          destinos_escalonamento: Json
          diferenciais: string
          horario_fim: string
          horario_inicio: string
          horario_modo: string
          mensagem_boas_vindas: string
          mensagens_mes_count: number
          mensagens_mes_reset: string
          mensagens_para_escalar: number
          nome_agencia: string
          nome_agente: string
          numeros_ignorados: string[]
          objetivos: Json
          restricoes: string
          servicos: string
          telefone_alerta: string | null
          tom: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativa?: boolean
          cargo?: string
          created_at?: string
          destinos_escalonamento?: Json
          diferenciais?: string
          horario_fim?: string
          horario_inicio?: string
          horario_modo?: string
          mensagem_boas_vindas?: string
          mensagens_mes_count?: number
          mensagens_mes_reset?: string
          mensagens_para_escalar?: number
          nome_agencia?: string
          nome_agente?: string
          numeros_ignorados?: string[]
          objetivos?: Json
          restricoes?: string
          servicos?: string
          telefone_alerta?: string | null
          tom?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ativa?: boolean
          cargo?: string
          created_at?: string
          destinos_escalonamento?: Json
          diferenciais?: string
          horario_fim?: string
          horario_inicio?: string
          horario_modo?: string
          mensagem_boas_vindas?: string
          mensagens_mes_count?: number
          mensagens_mes_reset?: string
          mensagens_para_escalar?: number
          nome_agencia?: string
          nome_agente?: string
          numeros_ignorados?: string[]
          objetivos?: Json
          restricoes?: string
          servicos?: string
          telefone_alerta?: string | null
          tom?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ia_conversas: {
        Row: {
          created_at: string
          debounce_buffer: Json
          debounce_primeira_em: string | null
          debounce_processando_desde: string | null
          debounce_ultima_atividade_em: string | null
          demo_enviada_em: string | null
          ia_ativa: boolean
          id: string
          lead_id: string
          mensagens: Json
          status: string
          uazapi_instancia_id: string | null
          ultima_em: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          debounce_buffer?: Json
          debounce_primeira_em?: string | null
          debounce_processando_desde?: string | null
          debounce_ultima_atividade_em?: string | null
          demo_enviada_em?: string | null
          ia_ativa?: boolean
          id?: string
          lead_id: string
          mensagens?: Json
          status?: string
          uazapi_instancia_id?: string | null
          ultima_em?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          debounce_buffer?: Json
          debounce_primeira_em?: string | null
          debounce_processando_desde?: string | null
          debounce_ultima_atividade_em?: string | null
          demo_enviada_em?: string | null
          ia_ativa?: boolean
          id?: string
          lead_id?: string
          mensagens?: Json
          status?: string
          uazapi_instancia_id?: string | null
          ultima_em?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_conversas_uazapi_instancia_id_fkey"
            columns: ["uazapi_instancia_id"]
            isOneToOne: false
            referencedRelation: "uazapi_instancias"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_escalonamentos: {
        Row: {
          alerta_erro: string | null
          alerta_status: string | null
          conversa_id: string
          created_at: string
          destino: string | null
          id: string
          lead_id: string
          lida: boolean
          motivo: string
          user_id: string
        }
        Insert: {
          alerta_erro?: string | null
          alerta_status?: string | null
          conversa_id: string
          created_at?: string
          destino?: string | null
          id?: string
          lead_id: string
          lida?: boolean
          motivo: string
          user_id: string
        }
        Update: {
          alerta_erro?: string | null
          alerta_status?: string | null
          conversa_id?: string
          created_at?: string
          destino?: string | null
          id?: string
          lead_id?: string
          lida?: boolean
          motivo?: string
          user_id?: string
        }
        Relationships: []
      }
      ia_qas: {
        Row: {
          created_at: string
          id: string
          pergunta: string
          resposta: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pergunta: string
          resposta: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pergunta?: string
          resposta?: string
          user_id?: string
        }
        Relationships: []
      }
      ia_webhook_eventos: {
        Row: {
          created_at: string
          event_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          avaliacao: number | null
          categoria: string | null
          cidade: string | null
          created_at: string
          endereco: string | null
          estado: string | null
          follow_up_at: string | null
          history: Json
          horario_funcionamento: string | null
          id: string
          lead_external_id: string | null
          link_maps: string | null
          nicho: string | null
          nome_empresa: string
          notes: string
          observacoes: string | null
          score: number
          segmento: string | null
          sequence_state: Json | null
          site_url: string | null
          status: string
          telefone: string | null
          tem_site: boolean | null
          tem_whatsapp: boolean | null
          tipo_site: string | null
          tipo_telefone: string | null
          total_avaliacoes: number | null
          updated_at: string
          user_id: string
          valor_fechado: number | null
          whatsapp: string | null
          whatsapp_verificado_em: string | null
        }
        Insert: {
          avaliacao?: number | null
          categoria?: string | null
          cidade?: string | null
          created_at?: string
          endereco?: string | null
          estado?: string | null
          follow_up_at?: string | null
          history?: Json
          horario_funcionamento?: string | null
          id?: string
          lead_external_id?: string | null
          link_maps?: string | null
          nicho?: string | null
          nome_empresa: string
          notes?: string
          observacoes?: string | null
          score?: number
          segmento?: string | null
          sequence_state?: Json | null
          site_url?: string | null
          status?: string
          telefone?: string | null
          tem_site?: boolean | null
          tem_whatsapp?: boolean | null
          tipo_site?: string | null
          tipo_telefone?: string | null
          total_avaliacoes?: number | null
          updated_at?: string
          user_id: string
          valor_fechado?: number | null
          whatsapp?: string | null
          whatsapp_verificado_em?: string | null
        }
        Update: {
          avaliacao?: number | null
          categoria?: string | null
          cidade?: string | null
          created_at?: string
          endereco?: string | null
          estado?: string | null
          follow_up_at?: string | null
          history?: Json
          horario_funcionamento?: string | null
          id?: string
          lead_external_id?: string | null
          link_maps?: string | null
          nicho?: string | null
          nome_empresa?: string
          notes?: string
          observacoes?: string | null
          score?: number
          segmento?: string | null
          sequence_state?: Json | null
          site_url?: string | null
          status?: string
          telefone?: string | null
          tem_site?: boolean | null
          tem_whatsapp?: boolean | null
          tipo_site?: string | null
          tipo_telefone?: string | null
          total_avaliacoes?: number | null
          updated_at?: string
          user_id?: string
          valor_fechado?: number | null
          whatsapp?: string | null
          whatsapp_verificado_em?: string | null
        }
        Relationships: []
      }
      leads_status_audit: {
        Row: {
          created_at: string
          detalhes: Json | null
          id: string
          lead_id: string
          origem: string
          status_anterior: string | null
          status_novo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          detalhes?: Json | null
          id?: string
          lead_id: string
          origem: string
          status_anterior?: string | null
          status_novo: string
          user_id: string
        }
        Update: {
          created_at?: string
          detalhes?: Json | null
          id?: string
          lead_id?: string
          origem?: string
          status_anterior?: string | null
          status_novo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_status_audit_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      login_lockouts: {
        Row: {
          created_at: string
          email_hash: string
          failed_count: number
          last_failed_at: string
          locked_until: string | null
        }
        Insert: {
          created_at?: string
          email_hash: string
          failed_count?: number
          last_failed_at?: string
          locked_until?: string | null
        }
        Update: {
          created_at?: string
          email_hash?: string
          failed_count?: number
          last_failed_at?: string
          locked_until?: string | null
        }
        Relationships: []
      }
      mensagens_enviadas: {
        Row: {
          campanha_id: string | null
          chip_id: string | null
          enviado_em: string
          id: string
          idempotency_key: string | null
          lead_id: string | null
          respondeu: boolean | null
          respondido_em: string | null
          resposta: string | null
          status: string
          step: number | null
          texto: string
          uazapi_message_id: string | null
          user_id: string
        }
        Insert: {
          campanha_id?: string | null
          chip_id?: string | null
          enviado_em?: string
          id?: string
          idempotency_key?: string | null
          lead_id?: string | null
          respondeu?: boolean | null
          respondido_em?: string | null
          resposta?: string | null
          status?: string
          step?: number | null
          texto: string
          uazapi_message_id?: string | null
          user_id: string
        }
        Update: {
          campanha_id?: string | null
          chip_id?: string | null
          enviado_em?: string
          id?: string
          idempotency_key?: string | null
          lead_id?: string | null
          respondeu?: boolean | null
          respondido_em?: string | null
          resposta?: string | null
          status?: string
          step?: number | null
          texto?: string
          uazapi_message_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_enviadas_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_enviadas_chip_id_fkey"
            columns: ["chip_id"]
            isOneToOne: false
            referencedRelation: "aquecimento_chips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_enviadas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      mimo_lead_historico: {
        Row: {
          acao: string
          alterado_por: string | null
          anterior: Json | null
          atual: Json
          created_at: string
          empresa_id: string
          id: string
          lead_id: string
        }
        Insert: {
          acao: string
          alterado_por?: string | null
          anterior?: Json | null
          atual: Json
          created_at?: string
          empresa_id: string
          id?: string
          lead_id: string
        }
        Update: {
          acao?: string
          alterado_por?: string | null
          anterior?: Json | null
          atual?: Json
          created_at?: string
          empresa_id?: string
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mimo_lead_historico_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mimo_lead_historico_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "mimo_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      mimo_leads: {
        Row: {
          anuncio_origem: string
          campanha_origem: string
          conversao_em: string | null
          created_at: string
          created_by: string
          empresa_id: string
          entrada_em: string
          etapa: string
          id: string
          motivo_perda: string
          nome_contato: string
          nome_empresa: string
          observacoes: string
          origem: string
          perfil: string
          primeiro_contato_whatsapp_em: string | null
          qualificacao: string
          responsavel_id: string | null
          telefone: string
          telefone_normalizado: string | null
          ultimo_contato_whatsapp_em: string | null
          updated_at: string
          valor_pedido: number | null
        }
        Insert: {
          anuncio_origem?: string
          campanha_origem?: string
          conversao_em?: string | null
          created_at?: string
          created_by?: string
          empresa_id: string
          entrada_em?: string
          etapa?: string
          id?: string
          motivo_perda?: string
          nome_contato?: string
          nome_empresa: string
          observacoes?: string
          origem?: string
          perfil?: string
          primeiro_contato_whatsapp_em?: string | null
          qualificacao?: string
          responsavel_id?: string | null
          telefone?: string
          telefone_normalizado?: string | null
          ultimo_contato_whatsapp_em?: string | null
          updated_at?: string
          valor_pedido?: number | null
        }
        Update: {
          anuncio_origem?: string
          campanha_origem?: string
          conversao_em?: string | null
          created_at?: string
          created_by?: string
          empresa_id?: string
          entrada_em?: string
          etapa?: string
          id?: string
          motivo_perda?: string
          nome_contato?: string
          nome_empresa?: string
          observacoes?: string
          origem?: string
          perfil?: string
          primeiro_contato_whatsapp_em?: string | null
          qualificacao?: string
          responsavel_id?: string | null
          telefone?: string
          telefone_normalizado?: string | null
          ultimo_contato_whatsapp_em?: string | null
          updated_at?: string
          valor_pedido?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mimo_leads_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      mimo_meta_ads_importacoes: {
        Row: {
          arquivo_nome: string
          arquivo_sha256: string
          created_at: string
          empresa_id: string
          erros: Json
          id: string
          importado_por: string
          linhas_atualizadas: number
          linhas_com_erro: number
          linhas_novas: number
          linhas_total: number
          periodo_fim: string | null
          periodo_inicio: string | null
        }
        Insert: {
          arquivo_nome: string
          arquivo_sha256: string
          created_at?: string
          empresa_id: string
          erros?: Json
          id?: string
          importado_por: string
          linhas_atualizadas?: number
          linhas_com_erro?: number
          linhas_novas?: number
          linhas_total?: number
          periodo_fim?: string | null
          periodo_inicio?: string | null
        }
        Update: {
          arquivo_nome?: string
          arquivo_sha256?: string
          created_at?: string
          empresa_id?: string
          erros?: Json
          id?: string
          importado_por?: string
          linhas_atualizadas?: number
          linhas_com_erro?: number
          linhas_novas?: number
          linhas_total?: number
          periodo_fim?: string | null
          periodo_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mimo_meta_ads_importacoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      mimo_meta_ads_metricas: {
        Row: {
          alcance: number | null
          anuncio: string
          campanha: string
          chave: string
          cliques: number | null
          conjunto: string
          created_at: string
          data_fim: string
          data_inicio: string
          empresa_id: string
          id: string
          importacao_id: string
          impressoes: number | null
          investimento: number | null
          leads_meta: number | null
          updated_at: string
        }
        Insert: {
          alcance?: number | null
          anuncio?: string
          campanha: string
          chave: string
          cliques?: number | null
          conjunto?: string
          created_at?: string
          data_fim: string
          data_inicio: string
          empresa_id: string
          id?: string
          importacao_id: string
          impressoes?: number | null
          investimento?: number | null
          leads_meta?: number | null
          updated_at?: string
        }
        Update: {
          alcance?: number | null
          anuncio?: string
          campanha?: string
          chave?: string
          cliques?: number | null
          conjunto?: string
          created_at?: string
          data_fim?: string
          data_inicio?: string
          empresa_id?: string
          id?: string
          importacao_id?: string
          impressoes?: number | null
          investimento?: number | null
          leads_meta?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mimo_meta_ads_metricas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mimo_meta_ads_metricas_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "mimo_meta_ads_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      mimo_whatsapp_diagnosticos: {
        Row: {
          codigo: string
          created_at: string
          empresa_id: string
          id: string
          message_id: string | null
          vinculo_id: string
        }
        Insert: {
          codigo: string
          created_at?: string
          empresa_id: string
          id?: string
          message_id?: string | null
          vinculo_id: string
        }
        Update: {
          codigo?: string
          created_at?: string
          empresa_id?: string
          id?: string
          message_id?: string | null
          vinculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mimo_whatsapp_diagnosticos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mimo_whatsapp_diagnosticos_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "mimo_whatsapp_vinculos"
            referencedColumns: ["id"]
          },
        ]
      }
      mimo_whatsapp_eventos: {
        Row: {
          contato_em: string
          created_at: string
          direcao: string
          empresa_id: string
          id: string
          lead_id: string | null
          message_id: string
          texto: string
          vinculo_id: string
        }
        Insert: {
          contato_em: string
          created_at?: string
          direcao: string
          empresa_id: string
          id?: string
          lead_id?: string | null
          message_id: string
          texto: string
          vinculo_id: string
        }
        Update: {
          contato_em?: string
          created_at?: string
          direcao?: string
          empresa_id?: string
          id?: string
          lead_id?: string | null
          message_id?: string
          texto?: string
          vinculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mimo_whatsapp_eventos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mimo_whatsapp_eventos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "mimo_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mimo_whatsapp_eventos_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "mimo_whatsapp_vinculos"
            referencedColumns: ["id"]
          },
        ]
      }
      mimo_whatsapp_vinculos: {
        Row: {
          ativo: boolean
          confirmado_em: string
          confirmado_por: string
          created_at: string
          empresa_id: string
          id: string
          instancia_id: string | null
          numero_comercial: string
          owner_id: string
          token_sha256: string
        }
        Insert: {
          ativo?: boolean
          confirmado_em?: string
          confirmado_por: string
          created_at?: string
          empresa_id: string
          id?: string
          instancia_id?: string | null
          numero_comercial: string
          owner_id: string
          token_sha256: string
        }
        Update: {
          ativo?: boolean
          confirmado_em?: string
          confirmado_por?: string
          created_at?: string
          empresa_id?: string
          id?: string
          instancia_id?: string | null
          numero_comercial?: string
          owner_id?: string
          token_sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "mimo_whatsapp_vinculos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          lida: boolean
          link: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          lida?: boolean
          link?: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          lida?: boolean
          link?: string | null
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          default_intervalo_segundos: number
          email: string | null
          envio_dias_semana: number[]
          envio_horario_fim: string
          envio_horario_inicio: string
          envios_hoje: number
          envios_hoje_data: string | null
          envios_pausados_ate: string | null
          erros_envio_consecutivos: number
          fila_envio_ativa: boolean
          fila_envios_ativa: boolean
          fila_pausada: boolean
          followup_dias: number[]
          foto_url: string | null
          id: string
          kiwify_order_id: string | null
          limite_diario_customizado: number | null
          nome: string | null
          plano: string
          pular_preview_wa: boolean
          senha_definida: boolean
          token_acesso: string | null
          uazapi_conectado_em: string | null
          uazapi_instance_status: string
          uazapi_instance_token: string | null
          uazapi_numero: string | null
          uazapi_ultimo_ping: string | null
          updated_at: string
          wa_api_key: string | null
          wa_display_name: string | null
          wa_instance_name: string | null
          wa_meta_business_id: string | null
          wa_meta_phone_id: string | null
          wa_meta_token: string | null
          wa_method: string | null
          wa_provider: string | null
          wa_server_url: string | null
        }
        Insert: {
          created_at?: string
          default_intervalo_segundos?: number
          email?: string | null
          envio_dias_semana?: number[]
          envio_horario_fim?: string
          envio_horario_inicio?: string
          envios_hoje?: number
          envios_hoje_data?: string | null
          envios_pausados_ate?: string | null
          erros_envio_consecutivos?: number
          fila_envio_ativa?: boolean
          fila_envios_ativa?: boolean
          fila_pausada?: boolean
          followup_dias?: number[]
          foto_url?: string | null
          id: string
          kiwify_order_id?: string | null
          limite_diario_customizado?: number | null
          nome?: string | null
          plano?: string
          pular_preview_wa?: boolean
          senha_definida?: boolean
          token_acesso?: string | null
          uazapi_conectado_em?: string | null
          uazapi_instance_status?: string
          uazapi_instance_token?: string | null
          uazapi_numero?: string | null
          uazapi_ultimo_ping?: string | null
          updated_at?: string
          wa_api_key?: string | null
          wa_display_name?: string | null
          wa_instance_name?: string | null
          wa_meta_business_id?: string | null
          wa_meta_phone_id?: string | null
          wa_meta_token?: string | null
          wa_method?: string | null
          wa_provider?: string | null
          wa_server_url?: string | null
        }
        Update: {
          created_at?: string
          default_intervalo_segundos?: number
          email?: string | null
          envio_dias_semana?: number[]
          envio_horario_fim?: string
          envio_horario_inicio?: string
          envios_hoje?: number
          envios_hoje_data?: string | null
          envios_pausados_ate?: string | null
          erros_envio_consecutivos?: number
          fila_envio_ativa?: boolean
          fila_envios_ativa?: boolean
          fila_pausada?: boolean
          followup_dias?: number[]
          foto_url?: string | null
          id?: string
          kiwify_order_id?: string | null
          limite_diario_customizado?: number | null
          nome?: string | null
          plano?: string
          pular_preview_wa?: boolean
          senha_definida?: boolean
          token_acesso?: string | null
          uazapi_conectado_em?: string | null
          uazapi_instance_status?: string
          uazapi_instance_token?: string | null
          uazapi_numero?: string | null
          uazapi_ultimo_ping?: string | null
          updated_at?: string
          wa_api_key?: string | null
          wa_display_name?: string | null
          wa_instance_name?: string | null
          wa_meta_business_id?: string | null
          wa_meta_phone_id?: string | null
          wa_meta_token?: string | null
          wa_method?: string | null
          wa_provider?: string | null
          wa_server_url?: string | null
        }
        Relationships: []
      }
      prospeccao_auto_config: {
        Row: {
          ativo: boolean
          cidade: string
          created_at: string
          enviados_hoje: number
          intervalo_segundos: number
          last_sent_at: string | null
          limite_diario: number
          nicho: string
          score_min: number
          template_id: string | null
          template_mensagem: string | null
          ultimo_run_data: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          cidade?: string
          created_at?: string
          enviados_hoje?: number
          intervalo_segundos?: number
          last_sent_at?: string | null
          limite_diario?: number
          nicho?: string
          score_min?: number
          template_id?: string | null
          template_mensagem?: string | null
          ultimo_run_data?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          cidade?: string
          created_at?: string
          enviados_hoje?: number
          intervalo_segundos?: number
          last_sent_at?: string | null
          limite_diario?: number
          nicho?: string
          score_min?: number
          template_id?: string | null
          template_mensagem?: string | null
          ultimo_run_data?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospeccao_auto_config_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start?: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      regioes_prospectadas: {
        Row: {
          cidade: string
          estado: string
          id: string
          status_cor: Database["public"]["Enums"]["regiao_cor"]
          total_leads: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cidade: string
          estado: string
          id?: string
          status_cor?: Database["public"]["Enums"]["regiao_cor"]
          total_leads?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cidade?: string
          estado?: string
          id?: string
          status_cor?: Database["public"]["Enums"]["regiao_cor"]
          total_leads?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      security_logs: {
        Row: {
          created_at: string
          details: Json | null
          event_type: string
          id: string
          identifier: string | null
          ip: string | null
          reason: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          identifier?: string | null
          ip?: string | null
          reason?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          identifier?: string | null
          ip?: string | null
          reason?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      sequencia_execucoes: {
        Row: {
          cancelada: boolean
          concluida: boolean
          created_at: string
          etapa_atual: number
          etapas: Json
          id: string
          lead_id: string
          parada_por_resposta: boolean
          pausada: boolean
          sequencia_id: string
          started_at: string
          status_inicial: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelada?: boolean
          concluida?: boolean
          created_at?: string
          etapa_atual?: number
          etapas?: Json
          id?: string
          lead_id: string
          parada_por_resposta?: boolean
          pausada?: boolean
          sequencia_id: string
          started_at?: string
          status_inicial?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelada?: boolean
          concluida?: boolean
          created_at?: string
          etapa_atual?: number
          etapas?: Json
          id?: string
          lead_id?: string
          parada_por_resposta?: boolean
          pausada?: boolean
          sequencia_id?: string
          started_at?: string
          status_inicial?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequencia_execucoes_sequencia_id_fkey"
            columns: ["sequencia_id"]
            isOneToOne: false
            referencedRelation: "sequencias"
            referencedColumns: ["id"]
          },
        ]
      }
      sequencias: {
        Row: {
          ativa: boolean
          created_at: string
          etapas: Json
          id: string
          nome: string
          objetivo: string
          parar_ao_fechar: boolean
          parar_ao_mover_crm: boolean
          parar_ao_responder: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          etapas?: Json
          id?: string
          nome: string
          objetivo?: string
          parar_ao_fechar?: boolean
          parar_ao_mover_crm?: boolean
          parar_ao_responder?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          etapas?: Json
          id?: string
          nome?: string
          objetivo?: string
          parar_ao_fechar?: boolean
          parar_ao_mover_crm?: boolean
          parar_ao_responder?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suporte_tickets: {
        Row: {
          assunto: string
          created_at: string
          descricao: string
          id: string
          status: string
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assunto: string
          created_at?: string
          descricao: string
          id?: string
          status?: string
          tipo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assunto?: string
          created_at?: string
          descricao?: string
          id?: string
          status?: string
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      templates: {
        Row: {
          created_at: string
          custom: boolean
          id: string
          mensagem: string
          nome: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custom?: boolean
          id?: string
          mensagem: string
          nome: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custom?: boolean
          id?: string
          mensagem?: string
          nome?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      uazapi_instancias: {
        Row: {
          conectado_em: string | null
          created_at: string
          id: string
          nome: string | null
          numero: string | null
          status: string
          status_disparo: string
          tipo: string
          token: string | null
          ultimo_ping: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          conectado_em?: string | null
          created_at?: string
          id?: string
          nome?: string | null
          numero?: string | null
          status?: string
          status_disparo?: string
          tipo: string
          token?: string | null
          ultimo_ping?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          conectado_em?: string | null
          created_at?: string
          id?: string
          nome?: string | null
          numero?: string | null
          status?: string
          status_disparo?: string
          tipo?: string
          token?: string | null
          ultimo_ping?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_configs: {
        Row: {
          ativo: boolean
          created_at: string
          eventos: string[]
          id: string
          secret: string | null
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          eventos?: string[]
          id?: string
          secret?: string | null
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          eventos?: string[]
          id?: string
          secret?: string | null
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_conexoes: {
        Row: {
          created_at: string
          id: string
          numero: string | null
          qr_code: string | null
          status: string
          ultimo_ping: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          numero?: string | null
          qr_code?: string | null
          status?: string
          ultimo_ping?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          numero?: string | null
          qr_code?: string | null
          status?: string
          ultimo_ping?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calcular_score_lead: {
        Args: {
          _avaliacao: number
          _site_url: string
          _tem_whatsapp: boolean
          _tipo_site: string
          _tipo_telefone: string
          _total_avaliacoes: number
        }
        Returns: number
      }
      check_login_lockout: { Args: { _email_hash: string }; Returns: string }
      check_rate_limit: {
        Args: { _key: string; _max: number; _window_secs: number }
        Returns: boolean
      }
      classificar_telefone: { Args: { _tel: string }; Returns: string }
      cleanup_rate_limits: { Args: never; Returns: undefined }
      clear_login_lockout: { Args: { _email_hash: string }; Returns: undefined }
      empresa_papel_de: {
        Args: { _empresa_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["empresa_papel"]
      }
      is_dono: { Args: { _user_id: string }; Returns: boolean }
      is_membro_empresa: {
        Args: { _empresa_id: string; _user_id: string }
        Returns: boolean
      }
      mimo_importar_meta_ads: {
        Args: {
          _empresa: string
          _erros: Json
          _linhas: Json
          _nome: string
          _sha256: string
          _total: number
        }
        Returns: Json
      }
      mimo_normalizar_telefone: { Args: { valor: string }; Returns: string }
      mimo_receber_whatsapp: {
        Args: {
          _contato_em: string
          _from_me: boolean
          _message_id: string
          _nome: string
          _owner: string
          _telefone: string
          _texto: string
          _token_sha256: string
          _vinculo: string
        }
        Returns: string
      }
      register_login_failure: { Args: { _email_hash: string }; Returns: string }
      reservar_lotes_ia_debounce: {
        Args: { _lock_ms?: number; _silencio_ms?: number; _teto_ms?: number }
        Returns: {
          debounce_buffer: Json
          id: string
          lead_id: string
          uazapi_instancia_id: string
          user_id: string
        }[]
      }
      tem_papel_empresa: {
        Args: {
          _empresa_id: string
          _papeis: Database["public"]["Enums"]["empresa_papel"][]
          _user_id: string
        }
        Returns: boolean
      }
      track_funnel_event: {
        Args: { _event_name: string; _plan_id?: string; _source?: string }
        Returns: undefined
      }
    }
    Enums: {
      campanha_status:
        | "rascunho"
        | "agendada"
        | "em_andamento"
        | "pausada"
        | "concluida"
      empresa_papel: "administrador" | "gestor" | "vendedor"
      regiao_cor: "azul" | "verde" | "vermelho" | "amarelo"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      campanha_status: [
        "rascunho",
        "agendada",
        "em_andamento",
        "pausada",
        "concluida",
      ],
      empresa_papel: ["administrador", "gestor", "vendedor"],
      regiao_cor: ["azul", "verde", "vermelho", "amarelo"],
    },
  },
} as const
