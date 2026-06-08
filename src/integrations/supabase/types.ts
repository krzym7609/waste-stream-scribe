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
      duty_sessions: {
        Row: {
          created_at: string
          end_note: string | null
          ended_at: string | null
          id: string
          outside_window: boolean
          shift_type: Database["public"]["Enums"]["shift_type"]
          start_note: string | null
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_note?: string | null
          ended_at?: string | null
          id?: string
          outside_window?: boolean
          shift_type: Database["public"]["Enums"]["shift_type"]
          start_note?: string | null
          started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_note?: string | null
          ended_at?: string | null
          id?: string
          outside_window?: boolean
          shift_type?: Database["public"]["Enums"]["shift_type"]
          start_note?: string | null
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      equipment: {
        Row: {
          active: boolean
          category_id: string | null
          code: string | null
          created_at: string
          id: string
          installed_at: string | null
          location: string | null
          manufacturer: string | null
          model: string | null
          name: string
          notes: string | null
          serial_number: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
          installed_at?: string | null
          location?: string | null
          manufacturer?: string | null
          model?: string | null
          name: string
          notes?: string | null
          serial_number?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_id?: string | null
          code?: string | null
          created_at?: string
          id?: string
          installed_at?: string | null
          location?: string | null
          manufacturer?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          serial_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "equipment_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_attachments: {
        Row: {
          equipment_id: string
          file_path: string
          id: string
          kind: Database["public"]["Enums"]["equipment_attachment_kind"]
          mime_type: string | null
          original_name: string
          size_bytes: number | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          equipment_id: string
          file_path: string
          id?: string
          kind: Database["public"]["Enums"]["equipment_attachment_kind"]
          mime_type?: string | null
          original_name: string
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          equipment_id?: string
          file_path?: string
          id?: string
          kind?: Database["public"]["Enums"]["equipment_attachment_kind"]
          mime_type?: string | null
          original_name?: string
          size_bytes?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_attachments_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      handover_objects: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      handover_report_items: {
        Row: {
          created_at: string
          handover_id: string
          id: string
          object_id: string
          updated_at: string
          uwagi_przekazujacego: string | null
          uwagi_przyjmujacego: string | null
        }
        Insert: {
          created_at?: string
          handover_id: string
          id?: string
          object_id: string
          updated_at?: string
          uwagi_przekazujacego?: string | null
          uwagi_przyjmujacego?: string | null
        }
        Update: {
          created_at?: string
          handover_id?: string
          id?: string
          object_id?: string
          updated_at?: string
          uwagi_przekazujacego?: string | null
          uwagi_przyjmujacego?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "handover_report_items_handover_id_fkey"
            columns: ["handover_id"]
            isOneToOne: false
            referencedRelation: "handover_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_report_items_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "handover_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      handover_report_snapshots: {
        Row: {
          edited_at: string
          edited_by: string
          handover_id: string
          id: string
          items_snapshot: Json
          reason: string | null
          snapshot: Json
        }
        Insert: {
          edited_at?: string
          edited_by: string
          handover_id: string
          id?: string
          items_snapshot: Json
          reason?: string | null
          snapshot: Json
        }
        Update: {
          edited_at?: string
          edited_by?: string
          handover_id?: string
          id?: string
          items_snapshot?: Json
          reason?: string | null
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "handover_report_snapshots_handover_id_fkey"
            columns: ["handover_id"]
            isOneToOne: false
            referencedRelation: "handover_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      handover_reports: {
        Row: {
          accepted_at: string | null
          created_at: string
          duty_session_from_id: string
          duty_session_to_id: string | null
          from_user_id: string
          id: string
          locked_at: string | null
          submitted_at: string
          to_user_id: string | null
          updated_at: string
          uwagi_ogolne: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          duty_session_from_id: string
          duty_session_to_id?: string | null
          from_user_id: string
          id?: string
          locked_at?: string | null
          submitted_at?: string
          to_user_id?: string | null
          updated_at?: string
          uwagi_ogolne?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          duty_session_from_id?: string
          duty_session_to_id?: string | null
          from_user_id?: string
          id?: string
          locked_at?: string | null
          submitted_at?: string
          to_user_id?: string | null
          updated_at?: string
          uwagi_ogolne?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "handover_reports_duty_session_from_id_fkey"
            columns: ["duty_session_from_id"]
            isOneToOne: false
            referencedRelation: "duty_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_reports_duty_session_to_id_fkey"
            columns: ["duty_session_to_id"]
            isOneToOne: false
            referencedRelation: "duty_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          employee_number: string | null
          first_name: string | null
          id: string
          last_name: string | null
          must_change_password: boolean
          phone: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          employee_number?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          must_change_password?: boolean
          phone?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          employee_number?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          must_change_password?: boolean
          phone?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      report_objects: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      schedule_executions: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          deferred_from_session_id: string | null
          duty_session_id: string | null
          id: string
          note: string | null
          scheduled_date: string
          scheduled_shift: Database["public"]["Enums"]["shift_type"]
          status: string
          task_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          deferred_from_session_id?: string | null
          duty_session_id?: string | null
          id?: string
          note?: string | null
          scheduled_date: string
          scheduled_shift: Database["public"]["Enums"]["shift_type"]
          status?: string
          task_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          deferred_from_session_id?: string | null
          duty_session_id?: string | null
          id?: string
          note?: string | null
          scheduled_date?: string
          scheduled_shift?: Database["public"]["Enums"]["shift_type"]
          status?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_executions_deferred_from_session_id_fkey"
            columns: ["deferred_from_session_id"]
            isOneToOne: false
            referencedRelation: "duty_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_executions_duty_session_id_fkey"
            columns: ["duty_session_id"]
            isOneToOne: false
            referencedRelation: "duty_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_executions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "schedule_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_month_overrides: {
        Row: {
          created_at: string
          day_of_month: number
          id: string
          month: number
          shifts: Database["public"]["Enums"]["shift_type"][]
          task_id: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          day_of_month: number
          id?: string
          month: number
          shifts?: Database["public"]["Enums"]["shift_type"][]
          task_id: string
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          day_of_month?: number
          id?: string
          month?: number
          shifts?: Database["public"]["Enums"]["shift_type"][]
          task_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "schedule_month_overrides_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "schedule_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_overrides: {
        Row: {
          created_at: string
          id: string
          note: string | null
          override_date: string
          shifts: Database["public"]["Enums"]["shift_type"][]
          skip: boolean
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          override_date: string
          shifts?: Database["public"]["Enums"]["shift_type"][]
          skip?: boolean
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          override_date?: string
          shifts?: Database["public"]["Enums"]["shift_type"][]
          skip?: boolean
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_overrides_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "schedule_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_tasks: {
        Row: {
          active: boolean
          created_at: string
          frequency_note: string | null
          id: string
          name: string
          requires_service_report: boolean
          task_number: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          frequency_note?: string | null
          id?: string
          name: string
          requires_service_report?: boolean
          task_number: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          frequency_note?: string | null
          id?: string
          name?: string
          requires_service_report?: boolean
          task_number?: number
          updated_at?: string
        }
        Relationships: []
      }
      schedule_template_entries: {
        Row: {
          created_at: string
          day_of_month: number
          id: string
          note: string | null
          shifts: Database["public"]["Enums"]["shift_type"][]
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_month: number
          id?: string
          note?: string | null
          shifts?: Database["public"]["Enums"]["shift_type"][]
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_month?: number
          id?: string
          note?: string | null
          shifts?: Database["public"]["Enums"]["shift_type"][]
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_template_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "schedule_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          read_at: string | null
          recipient_role: Database["public"]["Enums"]["app_role"] | null
          recipient_user_id: string | null
          related_session_id: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          read_at?: string | null
          recipient_role?: Database["public"]["Enums"]["app_role"] | null
          recipient_user_id?: string | null
          related_session_id?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          recipient_role?: Database["public"]["Enums"]["app_role"] | null
          recipient_user_id?: string | null
          related_session_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_notifications_related_session_id_fkey"
            columns: ["related_session_id"]
            isOneToOne: false
            referencedRelation: "duty_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_report_items: {
        Row: {
          created_at: string
          harmonogram_opis: string | null
          harmonogram_status: string
          id: string
          inne_czynnosci: string | null
          object_id: string
          ocena_opis: string | null
          ocena_status: string
          proponowany_termin: string | null
          report_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          harmonogram_opis?: string | null
          harmonogram_status?: string
          id?: string
          inne_czynnosci?: string | null
          object_id: string
          ocena_opis?: string | null
          ocena_status?: string
          proponowany_termin?: string | null
          report_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          harmonogram_opis?: string | null
          harmonogram_status?: string
          id?: string
          inne_czynnosci?: string | null
          object_id?: string
          ocena_opis?: string | null
          ocena_status?: string
          proponowany_termin?: string | null
          report_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_report_items_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "report_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_report_items_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "shift_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_report_snapshots: {
        Row: {
          edited_at: string
          edited_by: string
          id: string
          items_snapshot: Json
          reason: string | null
          report_id: string
          snapshot: Json
        }
        Insert: {
          edited_at?: string
          edited_by: string
          id?: string
          items_snapshot: Json
          reason?: string | null
          report_id: string
          snapshot: Json
        }
        Update: {
          edited_at?: string
          edited_by?: string
          id?: string
          items_snapshot?: Json
          reason?: string | null
          report_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "shift_report_snapshots_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "shift_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_reports: {
        Row: {
          chlorek_zelaza_l: number | null
          created_at: string
          duty_session_id: string
          energia_end: number | null
          energia_start: number | null
          flokulant_emulsyjny_l: number | null
          flokulant_proszkowy_kg: number | null
          id: string
          locked_at: string | null
          opady: boolean
          operatorzy: string | null
          sm_osadu_odwwapn: number | null
          sm_osadu_zageszcz: number | null
          submitted_at: string
          submitted_by: string
          updated_at: string
          uwagi: string | null
          wapno_kg: number | null
        }
        Insert: {
          chlorek_zelaza_l?: number | null
          created_at?: string
          duty_session_id: string
          energia_end?: number | null
          energia_start?: number | null
          flokulant_emulsyjny_l?: number | null
          flokulant_proszkowy_kg?: number | null
          id?: string
          locked_at?: string | null
          opady?: boolean
          operatorzy?: string | null
          sm_osadu_odwwapn?: number | null
          sm_osadu_zageszcz?: number | null
          submitted_at?: string
          submitted_by: string
          updated_at?: string
          uwagi?: string | null
          wapno_kg?: number | null
        }
        Update: {
          chlorek_zelaza_l?: number | null
          created_at?: string
          duty_session_id?: string
          energia_end?: number | null
          energia_start?: number | null
          flokulant_emulsyjny_l?: number | null
          flokulant_proszkowy_kg?: number | null
          id?: string
          locked_at?: string | null
          opady?: boolean
          operatorzy?: string | null
          sm_osadu_odwwapn?: number | null
          sm_osadu_zageszcz?: number | null
          submitted_at?: string
          submitted_by?: string
          updated_at?: string
          uwagi?: string | null
          wapno_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_reports_duty_session_id_fkey"
            columns: ["duty_session_id"]
            isOneToOne: true
            referencedRelation: "duty_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          created_at: string
          created_by: string | null
          ended_at: string | null
          id: string
          notes: string | null
          operator_id: string | null
          shift_date: string
          shift_type: Database["public"]["Enums"]["shift_type"]
          started_at: string | null
          status: Database["public"]["Enums"]["shift_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          operator_id?: string | null
          shift_date: string
          shift_type: Database["public"]["Enums"]["shift_type"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["shift_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          notes?: string | null
          operator_id?: string | null
          shift_date?: string
          shift_type?: Database["public"]["Enums"]["shift_type"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["shift_status"]
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      username_to_email: { Args: { _username: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "kierownik" | "operator"
      equipment_attachment_kind:
        | "documentation"
        | "photo"
        | "schema"
        | "service"
      shift_status: "zaplanowana" | "w_trakcie" | "zakonczona"
      shift_type: "rano" | "popoludnie" | "noc"
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
      app_role: ["admin", "kierownik", "operator"],
      equipment_attachment_kind: [
        "documentation",
        "photo",
        "schema",
        "service",
      ],
      shift_status: ["zaplanowana", "w_trakcie", "zakonczona"],
      shift_type: ["rano", "popoludnie", "noc"],
    },
  },
} as const
