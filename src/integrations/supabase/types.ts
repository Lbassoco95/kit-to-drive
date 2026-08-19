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
      bitacora_eliminaciones: {
        Row: {
          created_at: string
          datos_eliminados: Json | null
          eliminado_por: string
          id: string
          motivo: string
          nombre_usuario: string
          registro_id: string
          tabla: string
        }
        Insert: {
          created_at?: string
          datos_eliminados?: Json
          eliminado_por?: string
          id?: string
          motivo: string
          nombre_usuario?: string
          registro_id: string
          tabla: string
        }
        Update: {
          created_at?: string
          datos_eliminados?: Json
          eliminado_por?: string
          id?: string
          motivo?: string
          nombre_usuario?: string
          registro_id?: string
          tabla?: string
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
      clientes_bitacora: {
        Row: {
          cliente_id: string
          created_at: string
          datos_anteriores: Json | null
          datos_nuevos: Json | null
          id: string
          motivo: string
          tipo_cambio: string
          usuario_id: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          id?: string
          motivo: string
          tipo_cambio: string
          usuario_id: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          id?: string
          motivo?: string
          tipo_cambio?: string
          usuario_id?: string
        }
        Relationships: []
      }
      clientes_comentarios: {
        Row: {
          cliente_id: string
          comentario: string
          created_at: string
          id: string
          usuario_id: string
        }
        Insert: {
          cliente_id: string
          comentario: string
          created_at?: string
          id?: string
          usuario_id: string
        }
        Update: {
          cliente_id?: string
          comentario?: string
          created_at?: string
          id?: string
          usuario_id?: string
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
      contenedor_partes: {
        Row: {
          contenedor_id: string
          cantidad_esperada: number
          cantidad_recibida: number
          created_at: string
          descripcion: string
          id: string
          modelo: string | null
          updated_at: string
        }
        Insert: {
          contenedor_id: string
          cantidad_esperada?: number
          cantidad_recibida?: number
          created_at?: string
          descripcion: string
          id?: string
          modelo?: string | null
          updated_at?: string
        }
        Update: {
          contenedor_id?: string
          cantidad_esperada?: number
          cantidad_recibida?: number
          created_at?: string
          descripcion?: string
          id?: string
          modelo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contenedor_partes_contenedor_id_fkey"
            columns: ["contenedor_id"]
            isOneToOne: false
            referencedRelation: "contenedores"
            referencedColumns: ["id"]
          }
        ]
      }
      inventario_chasis: {
        Row: {
          color: string
          contenedor_id: string | null
          created_at: string
          estatus: string
          fecha_configuracion: string | null
          fecha_importacion: string
          id: string
          modelo: string
          motocarro_id: string | null
          notas: string | null
          numero_chasis: string
          updated_at: string
        }
        Insert: {
          color?: string
          contenedor_id?: string | null
          created_at?: string
          estatus?: string
          fecha_configuracion?: string | null
          fecha_importacion?: string
          id?: string
          modelo?: string
          motocarro_id?: string | null
          notas?: string | null
          numero_chasis: string
          updated_at?: string
        }
        Update: {
          color?: string
          contenedor_id?: string | null
          created_at?: string
          estatus?: string
          fecha_configuracion?: string | null
          fecha_importacion?: string
          id?: string
          modelo?: string
          motocarro_id?: string | null
          notas?: string | null
          numero_chasis?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventario_chasis_contenedor_id_fkey"
            columns: ["contenedor_id"]
            isOneToOne: false
            referencedRelation: "contenedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_chasis_motocarro_id_fkey"
            columns: ["motocarro_id"]
            isOneToOne: false
            referencedRelation: "motocarros"
            referencedColumns: ["id"]
          }
        ]
      }
      inventario_motor: {
        Row: {
          contenedor_id: string | null
          created_at: string
          estatus: string
          fecha_configuracion: string | null
          fecha_importacion: string
          id: string
          modelo: string
          motocarro_id: string | null
          notas: string | null
          numero_motor: string
          updated_at: string
        }
        Insert: {
          contenedor_id?: string | null
          created_at?: string
          estatus?: string
          fecha_configuracion?: string | null
          fecha_importacion?: string
          id?: string
          modelo?: string
          motocarro_id?: string | null
          notas?: string | null
          numero_motor: string
          updated_at?: string
        }
        Update: {
          contenedor_id?: string | null
          created_at?: string
          estatus?: string
          fecha_configuracion?: string | null
          fecha_importacion?: string
          id?: string
          modelo?: string
          motocarro_id?: string | null
          notas?: string | null
          numero_motor?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventario_motor_contenedor_id_fkey"
            columns: ["contenedor_id"]
            isOneToOne: false
            referencedRelation: "contenedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_motor_motocarro_id_fkey"
            columns: ["motocarro_id"]
            isOneToOne: false
            referencedRelation: "motocarros"
            referencedColumns: ["id"]
          }
        ]
      }
      inventario_partes: {
        Row: {
          contenedor_id: string
          cantidad_esperada: number
          cantidad_recibida: number
          created_at: string
          descripcion: string
          fecha_importacion: string
          id: string
          modelo: string | null
          notas: string | null
          updated_at: string
        }
        Insert: {
          contenedor_id: string
          cantidad_esperada?: number
          cantidad_recibida?: number
          created_at?: string
          descripcion: string
          fecha_importacion?: string
          id?: string
          modelo?: string | null
          notas?: string | null
          updated_at?: string
        }
        Update: {
          contenedor_id?: string
          cantidad_esperada?: number
          cantidad_recibida?: number
          created_at?: string
          descripcion?: string
          fecha_importacion?: string
          id?: string
          modelo?: string | null
          notas?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventario_partes_contenedor_id_fkey"
            columns: ["contenedor_id"]
            isOneToOne: false
            referencedRelation: "contenedores"
            referencedColumns: ["id"]
          }
        ]
      }
      inventario_colores: {
        Row: {
          color: string
          cantidad_disponible: number
          created_at: string
          id: string
          modelo: string
          ultima_actualizacion: string
          umbral_alerta: number
          updated_at: string
        }
        Insert: {
          color?: string
          cantidad_disponible?: number
          created_at?: string
          id?: string
          modelo?: string
          ultima_actualizacion?: string
          umbral_alerta?: number
          updated_at?: string
        }
        Update: {
          color?: string
          cantidad_disponible?: number
          created_at?: string
          id?: string
          modelo?: string
          ultima_actualizacion?: string
          umbral_alerta?: number
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
          confirmada_fabrica_at: string | null
          confirmada_fabrica_por: string | null
          confirmada_logistica_at: string | null
          confirmada_logistica_por: string | null
          contenedor_id: string | null
          created_at: string
          estatus_armado: Database["public"]["Enums"]["estatus_armado"]
          estatus_entrega: Database["public"]["Enums"]["estatus_entrega"]
          evidencia_entrega_url: string | null
          fecha_estimada_armado: string | null
          fecha_estimada_entrega: string | null
          fecha_propuesta_entrega: string | null
          fecha_real_armado: string | null
          fecha_real_entrega: string | null
          id: string
          modelo: string
          ns_chasis: string | null
          ns_motor: string | null
          observaciones_paro: string | null
          orden_armado: number
          propuesta_entrega_at: string | null
          propuesta_entrega_notas: string | null
          propuesta_entrega_por: string | null
          remision_id: string | null
          updated_at: string
        }
        Insert: {
          chasis_asignado?: string | null
          color?: string
          confirmada_fabrica_at?: string | null
          confirmada_fabrica_por?: string | null
          confirmada_logistica_at?: string | null
          confirmada_logistica_por?: string | null
          contenedor_id?: string | null
          created_at?: string
          estatus_armado?: Database["public"]["Enums"]["estatus_armado"]
          estatus_entrega?: Database["public"]["Enums"]["estatus_entrega"]
          evidencia_entrega_url?: string | null
          fecha_estimada_armado?: string | null
          fecha_estimada_entrega?: string | null
          fecha_propuesta_entrega?: string | null
          fecha_real_armado?: string | null
          fecha_real_entrega?: string | null
          id?: string
          modelo?: string
          ns_chasis?: string | null
          ns_motor?: string | null
          observaciones_paro?: string | null
          orden_armado: number
          propuesta_entrega_at?: string | null
          propuesta_entrega_notas?: string | null
          propuesta_entrega_por?: string | null
          remision_id?: string | null
          updated_at?: string
        }
        Update: {
          chasis_asignado?: string | null
          color?: string
          confirmada_fabrica_at?: string | null
          confirmada_fabrica_por?: string | null
          confirmada_logistica_at?: string | null
          confirmada_logistica_por?: string | null
          contenedor_id?: string | null
          created_at?: string
          estatus_armado?: Database["public"]["Enums"]["estatus_armado"]
          estatus_entrega?: Database["public"]["Enums"]["estatus_entrega"]
          evidencia_entrega_url?: string | null
          fecha_estimada_armado?: string | null
          fecha_estimada_entrega?: string | null
          fecha_propuesta_entrega?: string | null
          fecha_real_armado?: string | null
          fecha_real_entrega?: string | null
          id?: string
          modelo?: string
          ns_chasis?: string | null
          ns_motor?: string | null
          observaciones_paro?: string | null
          orden_armado?: number
          propuesta_entrega_at?: string | null
          propuesta_entrega_notas?: string | null
          propuesta_entrega_por?: string | null
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
          comprobante_pago_url: string | null
          pagado: boolean
          tipo_pago: string
          total_unidades_solicitadas: number
          updated_at: string
          vendedor_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          color_solicitado?: string | null
          comprobante_pago_url?: string | null
          created_at?: string
          documento_url?: string | null
          estatus?: Database["public"]["Enums"]["estatus_remision"]
          fecha_remision?: string | null
          folio_remision: string
          id?: string
          modelo_solicitado?: string | null
          notas?: string | null
          pagado?: boolean
          tipo_pago?: string
          total_unidades_solicitadas?: number
          updated_at?: string
          vendedor_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          color_solicitado?: string | null
          comprobante_pago_url?: string | null
          created_at?: string
          documento_url?: string | null
          estatus?: Database["public"]["Enums"]["estatus_remision"]
          fecha_remision?: string | null
          folio_remision?: string
          id?: string
          modelo_solicitado?: string | null
          notas?: string | null
          pagado?: boolean
          tipo_pago?: string
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
      confirmar_fecha_entrega: {
        Args: { _area: string; _motocarro_id: string }
        Returns: undefined
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
      proponer_fecha_entrega: {
        Args: { _fecha: string; _motocarro_id: string; _notas?: string }
        Returns: undefined
      }
      recibir_contenedor: {
        Args: {
          _color: string
          _fecha_arribo: string
          _folio_contenedor: string
          _modelo: string
          _unidades: Json
        }
        Returns: Json
      }
      importar_contenedores_excel: {
        Args: {
          _contenedores: Json
        }
        Returns: Json
      }
      importar_partes_excel: {
        Args: {
          _contenedor_id: string
          _partes: Json
        }
        Returns: Json
      }
      importar_vins_inventario: {
        Args: {
          _contenedor_id: string
          _folio_contenedor: string
          _modelo: string
          _vins: Json
        }
        Returns: Json
      }
      importar_motores_inventario: {
        Args: {
          _folio_contenedor: string
          _motores: Json
        }
        Returns: Json
      }
      importar_packing_list: {
        Args: {
          _contenedor_id: string
          _partes: Json
        }
        Returns: Json
      }
      incrementar_inventario_color: {
        Args: {
          _modelo: string
          _color: string
          _cantidad: number
        }
        Returns: void
      }
      decrementar_inventario_color: {
        Args: {
          _modelo: string
          _color: string
          _cantidad: number
        }
        Returns: void
      }
      reintentar_asignar_remision: {
        Args: { _remision_id: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "fabrica" | "logistica" | "ventas" | "coordinador" | "director_ventas" | "coordinador_ventas" | "auxiliar_ventas"
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
      app_role: ["admin", "fabrica", "logistica", "ventas", "coordinador", "director_ventas", "coordinador_ventas", "auxiliar_ventas"],
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
