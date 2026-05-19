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
          segmento: string | null
          sequence_state: Json | null
          site_url: string | null
          status: Database["public"]["Enums"]["lead_status"]
          telefone: string | null
          tem_site: boolean | null
          total_avaliacoes: number | null
          updated_at: string
          user_id: string
          whatsapp: string | null
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
          segmento?: string | null
          sequence_state?: Json | null
          site_url?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          telefone?: string | null
          tem_site?: boolean | null
          total_avaliacoes?: number | null
          updated_at?: string
          user_id: string
          whatsapp?: string | null
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
          segmento?: string | null
          sequence_state?: Json | null
          site_url?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          telefone?: string | null
          tem_site?: boolean | null
          total_avaliacoes?: number | null
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      mensagens_enviadas: {
        Row: {
          campanha_id: string | null
          enviado_em: string
          id: string
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
          enviado_em?: string
          id?: string
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
          enviado_em?: string
          id?: string
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
            foreignKeyName: "mensagens_enviadas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          default_intervalo_segundos: number
          email: string | null
          followup_dias: number[]
          foto_url: string | null
          id: string
          nome: string | null
          plano: string
          pular_preview_wa: boolean
          uazapi_instance_status: string
          uazapi_instance_token: string | null
          uazapi_numero: string | null
          uazapi_ultimo_ping: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_intervalo_segundos?: number
          email?: string | null
          followup_dias?: number[]
          foto_url?: string | null
          id: string
          nome?: string | null
          plano?: string
          pular_preview_wa?: boolean
          uazapi_instance_status?: string
          uazapi_instance_token?: string | null
          uazapi_numero?: string | null
          uazapi_ultimo_ping?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_intervalo_segundos?: number
          email?: string | null
          followup_dias?: number[]
          foto_url?: string | null
          id?: string
          nome?: string | null
          plano?: string
          pular_preview_wa?: boolean
          uazapi_instance_status?: string
          uazapi_instance_token?: string | null
          uazapi_numero?: string | null
          uazapi_ultimo_ping?: string | null
          updated_at?: string
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
      [_ in never]: never
    }
    Enums: {
      campanha_status:
        | "rascunho"
        | "agendada"
        | "em_andamento"
        | "pausada"
        | "concluida"
      lead_status:
        | "novo"
        | "mensagem_enviada"
        | "respondeu_positivo"
        | "respondeu_negativo"
        | "sem_resposta"
        | "convertido"
        | "descartado"
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
      lead_status: [
        "novo",
        "mensagem_enviada",
        "respondeu_positivo",
        "respondeu_negativo",
        "sem_resposta",
        "convertido",
        "descartado",
      ],
      regiao_cor: ["azul", "verde", "vermelho", "amarelo"],
    },
  },
} as const
