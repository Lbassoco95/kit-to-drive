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
      bitacora_eventos: {
        Row: {
          accion: string | null
          created_at: string
          datos_antes: Json | null
          datos_despues: Json | null
          entidad_id: string | null
          entidad_tipo: string | null
          id: string
          modulo: string | null
          usuario_id: string | null
        }
        Insert: {
          accion?: string | null
          created_at?: string
          datos_antes?: Json | null
          datos_despues?: Json | null
          entidad_id?: string | null
          entidad_tipo?: string | null
          id?: string
          modulo?: string | null
          usuario_id?: string | null
        }
        Update: {
          accion?: string | null
          created_at?: string
          datos_antes?: Json | null
          datos_despues?: Json | null
          entidad_id?: string | null
          entidad_tipo?: string | null
          id?: string
          modulo?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          activo: boolean
          codigo_erp: string
          created_at: string
          direccion: string | null
          id: string
          nombre_comercial: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo_erp: string
          created_at?: string
          direccion?: string | null
          id?: string
          nombre_comercial?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo_erp?: string
          created_at?: string
          direccion?: string | null
          id?: string
          nombre_comercial?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      config_general: {
        Row: {
          capacidad_diaria: number
          empresa_logo_url: string | null
          empresa_nombre: string
          id: number
          plazo_max_credito_dias: number
          updated_at: string
        }
        Insert: {
          capacidad_diaria?: number
          empresa_logo_url?: string | null
          empresa_nombre?: string
          id?: number
          plazo_max_credito_dias?: number
          updated_at?: string
        }
        Update: {
          capacidad_diaria?: number
          empresa_logo_url?: string | null
          empresa_nombre?: string
          id?: number
          plazo_max_credito_dias?: number
          updated_at?: string
        }
        Relationships: []
      }
      contenedores: {
        Row: {
          created_at: string
          fecha_arribo: string | null
          folio_contenedor: string
          id: string
          modelo_default: string | null
          notas: string | null
          total_unidades: number
        }
        Insert: {
          created_at?: string
          fecha_arribo?: string | null
          folio_contenedor: string
          id?: string
          modelo_default?: string | null
          notas?: string | null
          total_unidades?: number
        }
        Update: {
          created_at?: string
          fecha_arribo?: string | null
          folio_contenedor?: string
          id?: string
          modelo_default?: string | null
          notas?: string | null
          total_unidades?: number
        }
        Relationships: []
      }
      motocarros: {
        Row: {
          chasis_asignado: string | null
          color: string
          contenedor_id: string | null
          created_at: string
          estatus_armado: Database["public"]["Enums"]["estatus_armado"]
          estatus_entrega: Database["public"]["Enums"]["estatus_entrega"]
          evidencia_entrega_url: string | null
          fecha_estimada_armado: string | null
          fecha_estimada_entrega: string | null
          fecha_real_armado: string | null
          fecha_real_entrega: string | null
          id: string
          modelo: string
          ns_chasis: string | null
          ns_motor: string | null
          observaciones_paro: string | null
          orden_armado: number
          remision_id: string | null
          updated_at: string
        }
        Insert: {
          chasis_asignado?: string | null
          color?: string
          contenedor_id?: string | null
          created_at?: string
          estatus_armado?: Database["public"]["Enums"]["estatus_armado"]
          estatus_entrega?: Database["public"]["Enums"]["estatus_entrega"]
          evidencia_entrega_url?: string | null
          fecha_estimada_armado?: string | null
          fecha_estimada_entrega?: string | null
          fecha_real_armado?: string | null
          fecha_real_entrega?: string | null
          id?: string
          modelo?: string
          ns_chasis?: string | null
          ns_motor?: string | null
          observaciones_paro?: string | null
          orden_armado: number
          remision_id?: string | null
          updated_at?: string
        }
        Update: {
          chasis_asignado?: string | null
          color?: string
          contenedor_id?: string | null
          created_at?: string
          estatus_armado?: Database["public"]["Enums"]["estatus_armado"]
          estatus_entrega?: Database["public"]["Enums"]["estatus_entrega"]
          evidencia_entrega_url?: string | null
          fecha_estimada_armado?: string | null
          fecha_estimada_entrega?: string | null
          fecha_real_armado?: string | null
          fecha_real_entrega?: string | null
          id?: string
          modelo?: string
          ns_chasis?: string | null
          ns_motor?: string | null
          observaciones_paro?: string | null
          orden_armado?: number
          remision_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "motocarros_contenedor_id_fkey"
            columns: ["contenedor_id"]
            isOneToOne: false
            referencedRelation: "contenedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motocarros_remision_id_fkey"
            columns: ["remision_id"]
            isOneToOne: false
            referencedRelation: "remisiones"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          activo: boolean
          codigo_vendedor: string | null
          created_at: string
          id: string
          nombre_completo: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo_vendedor?: string | null
          created_at?: string
          id: string
          nombre_completo?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo_vendedor?: string | null
          created_at?: string
          id?: string
          nombre_completo?: string
          updated_at?: string
        }
        Relationships: []
      }
      remisiones: {
        Row: {
          cliente_id: string | null
          color_solicitado: string | null
          created_at: string
          documento_url: string | null
          estatus: Database["public"]["Enums"]["estatus_remision"]
          fecha_remision: string | null
          folio_remision: string
          id: string
          modelo_solicitado: string | null
          notas: string | null
          total_unidades_solicitadas: number
          updated_at: string
          vendedor_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          color_solicitado?: string | null
          created_at?: string
          documento_url?: string | null
          estatus?: Database["public"]["Enums"]["estatus_remision"]
          fecha_remision?: string | null
          folio_remision: string
          id?: string
          modelo_solicitado?: string | null
          notas?: string | null
          total_unidades_solicitadas?: number
          updated_at?: string
          vendedor_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          color_solicitado?: string | null
          created_at?: string
          documento_url?: string | null
          estatus?: Database["public"]["Enums"]["estatus_remision"]
          fecha_remision?: string | null
          folio_remision?: string
          id?: string
          modelo_solicitado?: string | null
          notas?: string | null
          total_unidades_solicitadas?: number
          updated_at?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "remisiones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remisiones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      asignar_chasis_remision: {
        Args: { _cantidad: number; _color?: string; _remision_id: string }
        Returns: number
      }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      reintentar_asignar_remision: {
        Args: { _remision_id: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "fabrica" | "logistica" | "ventas"
      estatus_armado:
        | "PENDIENTE"
        | "EN_PROCESO"
        | "ARMADO"
        | "LISTO"
        | "ATRASADO"
      estatus_entrega: "NO_APLICA" | "PROGRAMADA" | "EN_RUTA" | "ENTREGADA"
      estatus_remision: "NUEVA" | "PARCIAL" | "COMPLETA" | "CANCELADA"
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
      app_role: ["admin", "fabrica", "logistica", "ventas"],
      estatus_armado: [
        "PENDIENTE",
        "EN_PROCESO",
        "ARMADO",
        "LISTO",
        "ATRASADO",
      ],
      estatus_entrega: ["NO_APLICA", "PROGRAMADA", "EN_RUTA", "ENTREGADA"],
      estatus_remision: ["NUEVA", "PARCIAL", "COMPLETA", "CANCELADA"],
    },
  },
} as const
