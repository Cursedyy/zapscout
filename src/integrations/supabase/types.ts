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
      ia_config: {
        Row: {
          ativa: boolean
          cargo: string
          created_at: string
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
          objetivos: Json
          restricoes: string
          servicos: string
          tom: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativa?: boolean
          cargo?: string
          created_at?: string
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
          objetivos?: Json
          restricoes?: string
          servicos?: string
          tom?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ativa?: boolean
          cargo?: string
          created_at?: string
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
          objetivos?: Json
          restricoes?: string
          servicos?: string
          tom?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ia_conversas: {
        Row: {
          created_at: string
          ia_ativa: boolean
          id: string
          lead_id: string
          mensagens: Json
          status: string
          ultima_em: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ia_ativa?: boolean
          id?: string
          lead_id: string
          mensagens?: Json
          status?: string
          ultima_em?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ia_ativa?: boolean
          id?: string
          lead_id?: string
          mensagens?: Json
          status?: string
          ultima_em?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ia_escalonamentos: {
        Row: {
          conversa_id: string
          created_at: string
          id: string
          lead_id: string
          lida: boolean
          motivo: string
          user_id: string
        }
        Insert: {
          conversa_id: string
          created_at?: string
          id?: string
          lead_id: string
          lida?: boolean
          motivo: string
          user_id: string
        }
        Update: {
          conversa_id?: string
          created_at?: string
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
          fila_envios_ativa: boolean
          fila_pausada: boolean
          followup_dias: number[]
          foto_url: string | null
          id: string
          kiwify_order_id: string | null
          nome: string | null
          plano: string
          pular_preview_wa: boolean
          senha_definida: boolean
          token_acesso: string | null
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
          fila_envios_ativa?: boolean
          fila_pausada?: boolean
          followup_dias?: number[]
          foto_url?: string | null
          id: string
          kiwify_order_id?: string | null
          nome?: string | null
          plano?: string
          pular_preview_wa?: boolean
          senha_definida?: boolean
          token_acesso?: string | null
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
          fila_envios_ativa?: boolean
          fila_pausada?: boolean
          followup_dias?: number[]
          foto_url?: string | null
          id?: string
          kiwify_order_id?: string | null
          nome?: string | null
          plano?: string
          pular_preview_wa?: boolean
          senha_definida?: boolean
          token_acesso?: string | null
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
      check_rate_limit: {
        Args: { _key: string; _max: number; _window_secs: number }
        Returns: boolean
      }
      classificar_telefone: { Args: { _tel: string }; Returns: string }
      cleanup_rate_limits: { Args: never; Returns: undefined }
      is_dono: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      campanha_status:
        | "rascunho"
        | "agendada"
        | "em_andamento"
        | "pausada"
        | "concluida"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      regiao_cor: ["azul", "verde", "vermelho", "amarelo"],
    },
  },
} as const
