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
      absences: {
        Row: {
          created_at: string
          created_by: string | null
          data_fim: string
          data_inicio: string
          employee_id: string
          estado: string
          id: string
          motivo: string | null
          notas: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_fim: string
          data_inicio: string
          employee_id: string
          estado?: string
          id?: string
          motivo?: string | null
          notas?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_fim?: string
          data_inicio?: string
          employee_id?: string
          estado?: string
          id?: string
          motivo?: string | null
          notas?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "absences_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          accao: string
          created_at: string
          detalhe: Json | null
          id: string
          registo_id: string | null
          tabela: string
          user_id: string | null
        }
        Insert: {
          accao: string
          created_at?: string
          detalhe?: Json | null
          id?: string
          registo_id?: string | null
          tabela: string
          user_id?: string | null
        }
        Update: {
          accao?: string
          created_at?: string
          detalhe?: Json | null
          id?: string
          registo_id?: string | null
          tabela?: string
          user_id?: string | null
        }
        Relationships: []
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          ativo: boolean
          corpo: string | null
          created_at: string
          created_by: string | null
          employee_id: string | null
          expira_em: string | null
          id: string
          prioridade: string
          titulo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          corpo?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          expira_em?: string | null
          id?: string
          prioridade?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          corpo?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string | null
          expira_em?: string | null
          id?: string
          prioridade?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      badges: {
        Row: {
          ativo: boolean
          codigo: string
          cor: string
          created_at: string
          descricao: string | null
          icone: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          codigo: string
          cor?: string
          created_at?: string
          descricao?: string | null
          icone?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          codigo?: string
          cor?: string
          created_at?: string
          descricao?: string | null
          icone?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      challenge_popup_seen: {
        Row: {
          created_at: string
          digest: string
          employee_id: string
          seen_date: string
        }
        Insert: {
          created_at?: string
          digest: string
          employee_id: string
          seen_date: string
        }
        Update: {
          created_at?: string
          digest?: string
          employee_id?: string
          seen_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_popup_seen_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          end_date: string
          id: string
          metric: string
          premio: string | null
          scope: string
          start_date: string
          target: number
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          end_date: string
          id?: string
          metric?: string
          premio?: string | null
          scope?: string
          start_date: string
          target?: number
          tipo: string
          titulo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          end_date?: string
          id?: string
          metric?: string
          premio?: string | null
          scope?: string
          start_date?: string
          target?: number
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      checklist_items: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          ordem: number
          texto: string
          tipo: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          ordem?: number
          texto: string
          tipo?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          ordem?: number
          texto?: string
          tipo?: string
        }
        Relationships: []
      }
      checklist_marks: {
        Row: {
          created_at: string
          data: string
          feito: boolean
          id: string
          item_id: string
          marcado_por: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          data: string
          feito?: boolean
          id?: string
          item_id: string
          marcado_por?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          data?: string
          feito?: boolean
          id?: string
          item_id?: string
          marcado_por?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_marks_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
        ]
      }
      day_notes: {
        Row: {
          autor: string | null
          created_at: string
          data: string
          id: string
          texto: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          autor?: string | null
          created_at?: string
          data: string
          id?: string
          texto: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          autor?: string | null
          created_at?: string
          data?: string
          id?: string
          texto?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      employee_badges: {
        Row: {
          badge_id: string
          created_at: string
          created_by: string | null
          data: string
          employee_id: string
          id: string
          motivo: string | null
        }
        Insert: {
          badge_id: string
          created_at?: string
          created_by?: string | null
          data?: string
          employee_id: string
          id?: string
          motivo?: string | null
        }
        Update: {
          badge_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          employee_id?: string
          id?: string
          motivo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_badges_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          ativo: boolean
          categoria: string | null
          created_at: string
          id: string
          nif: number | null
          nome: string
          nome_sgf: string | null
          notas: string | null
          objetivo_mes: string | null
          objetivo_pontos: number | null
          ordem: number
          slug: string
          updated_at: string
          username_sgf: string | null
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          created_at?: string
          id?: string
          nif?: number | null
          nome: string
          nome_sgf?: string | null
          notas?: string | null
          objetivo_mes?: string | null
          objetivo_pontos?: number | null
          ordem?: number
          slug: string
          updated_at?: string
          username_sgf?: string | null
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          created_at?: string
          id?: string
          nif?: number | null
          nome?: string
          nome_sgf?: string | null
          notas?: string | null
          objetivo_mes?: string | null
          objetivo_pontos?: number | null
          ordem?: number
          slug?: string
          updated_at?: string
          username_sgf?: string | null
        }
        Relationships: []
      }
      nps_scores: {
        Row: {
          code: string | null
          created_at: string
          det_pct: number
          employee_id: string | null
          id: string
          inqueritos: number
          netscore: number
          raw_name: string
          snapshot_id: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          det_pct?: number
          employee_id?: string | null
          id?: string
          inqueritos?: number
          netscore?: number
          raw_name: string
          snapshot_id: string
        }
        Update: {
          code?: string | null
          created_at?: string
          det_pct?: number
          employee_id?: string | null
          id?: string
          inqueritos?: number
          netscore?: number
          raw_name?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nps_scores_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_scores_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "nps_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      nps_snapshots: {
        Row: {
          created_at: string
          id: string
          label: string
          notas: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          notas?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          notas?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      nps_surveys: {
        Row: {
          area_n1: string | null
          cav: string | null
          classe: string | null
          code: string | null
          confirmacao: string | null
          created_at: string
          data: string | null
          employee_id: string | null
          ext_id: string | null
          id: string
          motivo_macro: string | null
          nota_global: number | null
          nota_pessoa: number | null
          raw_name: string | null
          segmento: string | null
          semana: string | null
          snapshot_id: string
          tip_n1: string | null
          tip_n2: string | null
          tip_n3: string | null
          tip_n4: string | null
          tip_n5: string | null
          tip_n6: string | null
          tipo: string | null
        }
        Insert: {
          area_n1?: string | null
          cav?: string | null
          classe?: string | null
          code?: string | null
          confirmacao?: string | null
          created_at?: string
          data?: string | null
          employee_id?: string | null
          ext_id?: string | null
          id?: string
          motivo_macro?: string | null
          nota_global?: number | null
          nota_pessoa?: number | null
          raw_name?: string | null
          segmento?: string | null
          semana?: string | null
          snapshot_id: string
          tip_n1?: string | null
          tip_n2?: string | null
          tip_n3?: string | null
          tip_n4?: string | null
          tip_n5?: string | null
          tip_n6?: string | null
          tipo?: string | null
        }
        Update: {
          area_n1?: string | null
          cav?: string | null
          classe?: string | null
          code?: string | null
          confirmacao?: string | null
          created_at?: string
          data?: string | null
          employee_id?: string | null
          ext_id?: string | null
          id?: string
          motivo_macro?: string | null
          nota_global?: number | null
          nota_pessoa?: number | null
          raw_name?: string | null
          segmento?: string | null
          semana?: string | null
          snapshot_id?: string
          tip_n1?: string | null
          tip_n2?: string | null
          tip_n3?: string | null
          tip_n4?: string | null
          tip_n5?: string | null
          tip_n6?: string | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nps_surveys_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_surveys_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "nps_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      one_on_ones: {
        Row: {
          assunto: string | null
          created_at: string
          created_by: string | null
          data: string
          employee_id: string
          estado: string
          follow_up: string | null
          hora: string | null
          id: string
          notas: string | null
          updated_at: string
        }
        Insert: {
          assunto?: string | null
          created_at?: string
          created_by?: string | null
          data: string
          employee_id: string
          estado?: string
          follow_up?: string | null
          hora?: string | null
          id?: string
          notas?: string | null
          updated_at?: string
        }
        Update: {
          assunto?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          employee_id?: string
          estado?: string
          follow_up?: string | null
          hora?: string | null
          id?: string
          notas?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "one_on_ones_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          ativo: boolean
          categoria: string | null
          codigo: string
          created_at: string
          id: string
          nome: string
          ordem: number
          peso: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          codigo: string
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          peso?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          codigo?: string
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          peso?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      sales_entries: {
        Row: {
          data: string
          employee_id: string
          id: string
          product_id: string
          quantidade: number
          updated_at: string
        }
        Insert: {
          data: string
          employee_id: string
          id?: string
          product_id: string
          quantidade?: number
          updated_at?: string
        }
        Update: {
          data?: string
          employee_id?: string
          id?: string
          product_id?: string
          quantidade?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      sgf_tickets: {
        Row: {
          atendimento_s: number | null
          balcao: string | null
          eh_marcacao: boolean | null
          emitida_em: string
          employee_id: string | null
          espera_s: number | null
          estado: string | null
          fim_em: string | null
          id: string
          inicio_em: string | null
          nome_staff: string | null
          paperless: boolean | null
          senha: string
          servico: string | null
          staff_username: string | null
        }
        Insert: {
          atendimento_s?: number | null
          balcao?: string | null
          eh_marcacao?: boolean | null
          emitida_em: string
          employee_id?: string | null
          espera_s?: number | null
          estado?: string | null
          fim_em?: string | null
          id?: string
          inicio_em?: string | null
          nome_staff?: string | null
          paperless?: boolean | null
          senha: string
          servico?: string | null
          staff_username?: string | null
        }
        Update: {
          atendimento_s?: number | null
          balcao?: string | null
          eh_marcacao?: boolean | null
          emitida_em?: string
          employee_id?: string | null
          espera_s?: number | null
          estado?: string | null
          fim_em?: string | null
          id?: string
          inicio_em?: string | null
          nome_staff?: string | null
          paperless?: boolean | null
          senha?: string
          servico?: string | null
          staff_username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sgf_tickets_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_days: {
        Row: {
          data: string
          descricao: string | null
          employee_id: string
          estado: string | null
          horas: number | null
          id: string
        }
        Insert: {
          data: string
          descricao?: string | null
          employee_id: string
          estado?: string | null
          horas?: number | null
          id?: string
        }
        Update: {
          data?: string
          descricao?: string | null
          employee_id?: string
          estado?: string | null
          horas?: number | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_days_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      telemarketing_slots: {
        Row: {
          created_at: string
          data: string
          employee_id: string
          feito: boolean
          hora: number
          id: string
          updated_at: string
          vendas: number
        }
        Insert: {
          created_at?: string
          data: string
          employee_id: string
          feito?: boolean
          hora: number
          id?: string
          updated_at?: string
          vendas?: number
        }
        Update: {
          created_at?: string
          data?: string
          employee_id?: string
          feito?: boolean
          hora?: number
          id?: string
          updated_at?: string
          vendas?: number
        }
        Relationships: [
          {
            foreignKeyName: "telemarketing_slots_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          appearance: Json
          prefs: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          appearance?: Json
          prefs?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          appearance?: Json
          prefs?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weight_overrides: {
        Row: {
          employee_id: string
          id: string
          peso: number
          product_id: string
        }
        Insert: {
          employee_id: string
          id?: string
          peso: number
          product_id: string
        }
        Update: {
          employee_id?: string
          id?: string
          peso?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weight_overrides_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weight_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_get_employee_nifs: {
        Args: never
        Returns: {
          id: string
          nif: number
        }[]
      }
      admin_set_employee_nif: {
        Args: { _id: string; _nif: number }
        Returns: undefined
      }
      current_employee_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      match_employees_by_nifs: {
        Args: { p_nifs: number[] }
        Returns: {
          id: string
          nif: number
          nome: string
        }[]
      }
      set_employee_categorias_by_nif: {
        Args: { p_pairs: Json }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "member"
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
      app_role: ["admin", "member"],
    },
  },
} as const
