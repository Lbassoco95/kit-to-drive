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
        Relationships: [
          {
            foreignKeyName: "clientes_bitacora_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "clientes_comentarios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      comentarios_motocarros: {
        Row: {
          created_at: string
          foto_url: string | null
          id: string
          motocarro_id: string
          texto: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          foto_url?: string | null
          id?: string
          motocarro_id: string
          texto: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          foto_url?: string | null
          id?: string
          motocarro_id?: string
          texto?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comentarios_motocarros_motocarro_id_fkey"
            columns: ["motocarro_id"]
            isOneToOne: false
            referencedRelation: "motocarros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comentarios_motocarros_motocarro_id_fkey"
            columns: ["motocarro_id"]
            isOneToOne: false
            referencedRelation: "v_reporte_produccion"
            referencedColumns: ["id"]
          },
        ]
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
          estatus_carga: string
          fecha_arribo: string | null
          folio_contenedor: string
          id: string
          modelo_default: string | null
          notas: string | null
          total_chasis: number
          total_motores: number
          total_unidades: number
        }
        Insert: {
          created_at?: string
          estatus_carga?: string
          fecha_arribo?: string | null
          folio_contenedor: string
          id?: string
          modelo_default?: string | null
          notas?: string | null
          total_chasis?: number
          total_motores?: number
          total_unidades?: number
        }
        Update: {
          created_at?: string
          estatus_carga?: string
          fecha_arribo?: string | null
          folio_contenedor?: string
          id?: string
          modelo_default?: string | null
          notas?: string | null
          total_chasis?: number
          total_motores?: number
          total_unidades?: number
        }
        Relationships: []
      }
      crm_actividades: {
        Row: {
          acuerdos_alcanzados: string | null
          asuntos_tratados: string | null
          canal_contacto: string | null
          cliente_id: string | null
          codigo_cliente: string | null
          created_at: string
          created_by: string | null
          descripcion: string | null
          duracion_min: number | null
          escala_operacion: string | null
          estatus: string | null
          evidencia_url: string | null
          fecha_actividad: string
          fecha_proxima: string | null
          fecha_ultima_visita: string | null
          id: string
          limitante_descuento: boolean | null
          limitante_flete: boolean | null
          limitante_notas: string | null
          limitante_precio: boolean | null
          marcas_cliente: string | null
          marcas_comercializa: string | null
          municipio: string | null
          notas_visita: string | null
          objetivo_visita: string | null
          oportunidad_id: string | null
          persona_contacto: string | null
          proxima_accion: string | null
          region: string | null
          resultado: string | null
          retroalimentacion_mercado: string | null
          telefono_contacto: string | null
          tipo: string
          tipo_cliente_nuevo: boolean | null
          tipo_negocio: string | null
          titulo: string
          top3_marcas: string | null
          updated_at: string
          vendedor_id: string | null
          volumen_mensual_estimado: number | null
          volumen_mensual_ventas: number | null
        }
        Insert: {
          acuerdos_alcanzados?: string | null
          asuntos_tratados?: string | null
          canal_contacto?: string | null
          cliente_id?: string | null
          codigo_cliente?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          duracion_min?: number | null
          escala_operacion?: string | null
          estatus?: string | null
          evidencia_url?: string | null
          fecha_actividad?: string
          fecha_proxima?: string | null
          fecha_ultima_visita?: string | null
          id?: string
          limitante_descuento?: boolean | null
          limitante_flete?: boolean | null
          limitante_notas?: string | null
          limitante_precio?: boolean | null
          marcas_cliente?: string | null
          marcas_comercializa?: string | null
          municipio?: string | null
          notas_visita?: string | null
          objetivo_visita?: string | null
          oportunidad_id?: string | null
          persona_contacto?: string | null
          proxima_accion?: string | null
          region?: string | null
          resultado?: string | null
          retroalimentacion_mercado?: string | null
          telefono_contacto?: string | null
          tipo?: string
          tipo_cliente_nuevo?: boolean | null
          tipo_negocio?: string | null
          titulo: string
          top3_marcas?: string | null
          updated_at?: string
          vendedor_id?: string | null
          volumen_mensual_estimado?: number | null
          volumen_mensual_ventas?: number | null
        }
        Update: {
          acuerdos_alcanzados?: string | null
          asuntos_tratados?: string | null
          canal_contacto?: string | null
          cliente_id?: string | null
          codigo_cliente?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          duracion_min?: number | null
          escala_operacion?: string | null
          estatus?: string | null
          evidencia_url?: string | null
          fecha_actividad?: string
          fecha_proxima?: string | null
          fecha_ultima_visita?: string | null
          id?: string
          limitante_descuento?: boolean | null
          limitante_flete?: boolean | null
          limitante_notas?: string | null
          limitante_precio?: boolean | null
          marcas_cliente?: string | null
          marcas_comercializa?: string | null
          municipio?: string | null
          notas_visita?: string | null
          objetivo_visita?: string | null
          oportunidad_id?: string | null
          persona_contacto?: string | null
          proxima_accion?: string | null
          region?: string | null
          resultado?: string | null
          retroalimentacion_mercado?: string | null
          telefono_contacto?: string | null
          tipo?: string
          tipo_cliente_nuevo?: boolean | null
          tipo_negocio?: string | null
          titulo?: string
          top3_marcas?: string | null
          updated_at?: string
          vendedor_id?: string | null
          volumen_mensual_estimado?: number | null
          volumen_mensual_ventas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_actividades_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_actividades_oportunidad_id_fkey"
            columns: ["oportunidad_id"]
            isOneToOne: false
            referencedRelation: "crm_oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_actividades_oportunidad_id_fkey"
            columns: ["oportunidad_id"]
            isOneToOne: false
            referencedRelation: "v_reporte_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_actividades_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_oportunidades: {
        Row: {
          cantidad_estimada: number | null
          cliente_id: string | null
          created_at: string
          created_by: string | null
          etapa: string
          fecha_cierre_estimada: string | null
          fecha_cierre_real: string | null
          id: string
          limitante_descuento: boolean | null
          limitante_flete: boolean | null
          limitante_notas: string | null
          limitante_precio: boolean | null
          moneda: string
          motivo_perdida: string | null
          nombre_cliente: string | null
          notas: string | null
          probabilidad: number | null
          remision_id: string | null
          tipo_venta: string | null
          titulo: string
          updated_at: string
          valor_estimado: number | null
          vendedor_id: string | null
        }
        Insert: {
          cantidad_estimada?: number | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          etapa?: string
          fecha_cierre_estimada?: string | null
          fecha_cierre_real?: string | null
          id?: string
          limitante_descuento?: boolean | null
          limitante_flete?: boolean | null
          limitante_notas?: string | null
          limitante_precio?: boolean | null
          moneda?: string
          motivo_perdida?: string | null
          nombre_cliente?: string | null
          notas?: string | null
          probabilidad?: number | null
          remision_id?: string | null
          tipo_venta?: string | null
          titulo: string
          updated_at?: string
          valor_estimado?: number | null
          vendedor_id?: string | null
        }
        Update: {
          cantidad_estimada?: number | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          etapa?: string
          fecha_cierre_estimada?: string | null
          fecha_cierre_real?: string | null
          id?: string
          limitante_descuento?: boolean | null
          limitante_flete?: boolean | null
          limitante_notas?: string | null
          limitante_precio?: boolean | null
          moneda?: string
          motivo_perdida?: string | null
          nombre_cliente?: string | null
          notas?: string | null
          probabilidad?: number | null
          remision_id?: string | null
          tipo_venta?: string | null
          titulo?: string
          updated_at?: string
          valor_estimado?: number | null
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_oportunidades_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_oportunidades_remision_id_fkey"
            columns: ["remision_id"]
            isOneToOne: false
            referencedRelation: "remisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_oportunidades_remision_id_fkey"
            columns: ["remision_id"]
            isOneToOne: false
            referencedRelation: "v_reporte_remisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_oportunidades_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_ruta_paradas: {
        Row: {
          cliente_id: string | null
          completada: boolean
          created_at: string
          direccion: string | null
          hora_llegada: string | null
          hora_salida: string | null
          id: string
          nombre_cliente: string | null
          objetivo: string | null
          oportunidad_id: string | null
          orden: number
          resultado: string | null
          ruta_id: string
        }
        Insert: {
          cliente_id?: string | null
          completada?: boolean
          created_at?: string
          direccion?: string | null
          hora_llegada?: string | null
          hora_salida?: string | null
          id?: string
          nombre_cliente?: string | null
          objetivo?: string | null
          oportunidad_id?: string | null
          orden?: number
          resultado?: string | null
          ruta_id: string
        }
        Update: {
          cliente_id?: string | null
          completada?: boolean
          created_at?: string
          direccion?: string | null
          hora_llegada?: string | null
          hora_salida?: string | null
          id?: string
          nombre_cliente?: string | null
          objetivo?: string | null
          oportunidad_id?: string | null
          orden?: number
          resultado?: string | null
          ruta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_ruta_paradas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_ruta_paradas_oportunidad_id_fkey"
            columns: ["oportunidad_id"]
            isOneToOne: false
            referencedRelation: "crm_oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_ruta_paradas_oportunidad_id_fkey"
            columns: ["oportunidad_id"]
            isOneToOne: false
            referencedRelation: "v_reporte_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_ruta_paradas_ruta_id_fkey"
            columns: ["ruta_id"]
            isOneToOne: false
            referencedRelation: "crm_rutas"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_rutas: {
        Row: {
          completada: boolean
          created_at: string
          created_by: string | null
          fecha_ruta: string
          id: string
          km_recorridos: number | null
          notas: string | null
          updated_at: string
          vendedor_id: string | null
        }
        Insert: {
          completada?: boolean
          created_at?: string
          created_by?: string | null
          fecha_ruta?: string
          id?: string
          km_recorridos?: number | null
          notas?: string | null
          updated_at?: string
          vendedor_id?: string | null
        }
        Update: {
          completada?: boolean
          created_at?: string
          created_by?: string | null
          fecha_ruta?: string
          id?: string
          km_recorridos?: number | null
          notas?: string | null
          updated_at?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_rutas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_chasis: {
        Row: {
          color: string | null
          contenedor_id: string | null
          created_at: string | null
          estatus: string | null
          id: string
          modelo: string
          numero_chasis: string
        }
        Insert: {
          color?: string | null
          contenedor_id?: string | null
          created_at?: string | null
          estatus?: string | null
          id?: string
          modelo: string
          numero_chasis: string
        }
        Update: {
          color?: string | null
          contenedor_id?: string | null
          created_at?: string | null
          estatus?: string | null
          id?: string
          modelo?: string
          numero_chasis?: string
        }
        Relationships: []
      }
      inventario_colores: {
        Row: {
          cantidad_disponible: number | null
          color: string
          id: string
          modelo: string
          umbral_alerta: number | null
          updated_at: string | null
        }
        Insert: {
          cantidad_disponible?: number | null
          color: string
          id?: string
          modelo: string
          umbral_alerta?: number | null
          updated_at?: string | null
        }
        Update: {
          cantidad_disponible?: number | null
          color?: string
          id?: string
          modelo?: string
          umbral_alerta?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      inventario_motor: {
        Row: {
          contenedor_id: string | null
          created_at: string | null
          estatus: string | null
          id: string
          modelo: string
          numero_motor: string
        }
        Insert: {
          contenedor_id?: string | null
          created_at?: string | null
          estatus?: string | null
          id?: string
          modelo: string
          numero_motor: string
        }
        Update: {
          contenedor_id?: string | null
          created_at?: string | null
          estatus?: string | null
          id?: string
          modelo?: string
          numero_motor?: string
        }
        Relationships: []
      }
      inventario_partes: {
        Row: {
          cantidad_esperada: number | null
          cantidad_recibida: number | null
          contenedor_id: string
          created_at: string | null
          descripcion: string
          id: string
          modelo: string | null
        }
        Insert: {
          cantidad_esperada?: number | null
          cantidad_recibida?: number | null
          contenedor_id: string
          created_at?: string | null
          descripcion: string
          id?: string
          modelo?: string | null
        }
        Update: {
          cantidad_esperada?: number | null
          cantidad_recibida?: number | null
          contenedor_id?: string
          created_at?: string | null
          descripcion?: string
          id?: string
          modelo?: string | null
        }
        Relationships: []
      }
      motocarros: {
        Row: {
          chasis_asignado: string | null
          color: string
          con_caja: boolean
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
          con_caja?: boolean
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
          con_caja?: boolean
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
          {
            foreignKeyName: "motocarros_remision_id_fkey"
            columns: ["remision_id"]
            isOneToOne: false
            referencedRelation: "v_reporte_remisiones"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          aprobado_por: string | null
          beneficiario: string
          categoria: string
          created_at: string
          created_by: string | null
          descripcion: string | null
          estatus: string
          factura_url: string | null
          fecha_pago: string | null
          id: string
          moneda: string
          monto: number
          nombre_pago: string
          referencia_externa: string | null
          tiene_factura: boolean
          tipo_cambio: number | null
          updated_at: string
        }
        Insert: {
          aprobado_por?: string | null
          beneficiario: string
          categoria?: string
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          estatus?: string
          factura_url?: string | null
          fecha_pago?: string | null
          id?: string
          moneda?: string
          monto: number
          nombre_pago: string
          referencia_externa?: string | null
          tiene_factura?: boolean
          tipo_cambio?: number | null
          updated_at?: string
        }
        Update: {
          aprobado_por?: string | null
          beneficiario?: string
          categoria?: string
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          estatus?: string
          factura_url?: string | null
          fecha_pago?: string | null
          id?: string
          moneda?: string
          monto?: number
          nombre_pago?: string
          referencia_externa?: string | null
          tiene_factura?: boolean
          tipo_cambio?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activo: boolean
          codigo_vendedor: string | null
          created_at: string
          email: string | null
          id: string
          nombre_completo: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo_vendedor?: string | null
          created_at?: string
          email?: string | null
          id: string
          nombre_completo?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo_vendedor?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nombre_completo?: string
          updated_at?: string
        }
        Relationships: []
      }
      remision_items: {
        Row: {
          cantidad: number
          color: string | null
          con_caja: boolean
          created_at: string | null
          id: string
          modelo: string | null
          remision_id: string
          tipo_servicio: string
        }
        Insert: {
          cantidad?: number
          color?: string | null
          con_caja?: boolean
          created_at?: string | null
          id?: string
          modelo?: string | null
          remision_id: string
          tipo_servicio?: string
        }
        Update: {
          cantidad?: number
          color?: string | null
          con_caja?: boolean
          created_at?: string | null
          id?: string
          modelo?: string | null
          remision_id?: string
          tipo_servicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "remision_items_remision_id_fkey"
            columns: ["remision_id"]
            isOneToOne: false
            referencedRelation: "remisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remision_items_remision_id_fkey"
            columns: ["remision_id"]
            isOneToOne: false
            referencedRelation: "v_reporte_remisiones"
            referencedColumns: ["id"]
          },
        ]
      }
      remisiones: {
        Row: {
          cliente_id: string | null
          color_solicitado: string | null
          comprobante_pago_url: string | null
          created_at: string
          documento_url: string | null
          estatus: Database["public"]["Enums"]["estatus_remision"]
          fecha_remision: string | null
          folio_remision: string
          id: string
          modelo_solicitado: string | null
          nombre_vendedor: string | null
          notas: string | null
          pagado: boolean
          tipo_pago: string
          tipo_remision: string
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
          nombre_vendedor?: string | null
          notas?: string | null
          pagado?: boolean
          tipo_pago?: string
          tipo_remision?: string
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
          nombre_vendedor?: string | null
          notas?: string | null
          pagado?: boolean
          tipo_pago?: string
          tipo_remision?: string
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
      reportes_turno: {
        Row: {
          created_at: string
          fecha: string
          id: string
          observaciones: string | null
          paros: string | null
          turno: string
          unidades_armadas: number
          updated_at: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          fecha?: string
          id?: string
          observaciones?: string | null
          paros?: string | null
          turno: string
          unidades_armadas?: number
          updated_at?: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          fecha?: string
          id?: string
          observaciones?: string | null
          paros?: string | null
          turno?: string
          unidades_armadas?: number
          updated_at?: string
          usuario_id?: string
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
      v_reporte_pagos: {
        Row: {
          aprobado_por: string | null
          beneficiario: string | null
          capturado_por: string | null
          categoria: string | null
          created_at: string | null
          descripcion: string | null
          email_capturador: string | null
          estatus: string | null
          factura_url: string | null
          fecha_pago: string | null
          id: string | null
          moneda: string | null
          monto: number | null
          monto_mxn: number | null
          nombre_pago: string | null
          periodo: string | null
          periodo_label: string | null
          referencia_externa: string | null
          tiene_factura: boolean | null
          tipo_cambio: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      v_reporte_pipeline: {
        Row: {
          cliente: string | null
          created_at: string | null
          email_vendedor: string | null
          estado_pipeline: string | null
          etapa: string | null
          fecha_cierre_estimada: string | null
          fecha_cierre_real: string | null
          id: string | null
          moneda: string | null
          motivo_perdida: string | null
          probabilidad: number | null
          remision_id: string | null
          titulo: string | null
          total_actividades: number | null
          ultima_actividad: string | null
          updated_at: string | null
          valor_estimado: number | null
          valor_ponderado: number | null
          vendedor: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_oportunidades_remision_id_fkey"
            columns: ["remision_id"]
            isOneToOne: false
            referencedRelation: "remisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_oportunidades_remision_id_fkey"
            columns: ["remision_id"]
            isOneToOne: false
            referencedRelation: "v_reporte_remisiones"
            referencedColumns: ["id"]
          },
        ]
      }
      v_reporte_produccion: {
        Row: {
          chasis_asignado: string | null
          cliente: string | null
          color: string | null
          con_caja: boolean | null
          created_at: string | null
          dias_desvio_armado: number | null
          dias_desvio_entrega: number | null
          estatus_armado: Database["public"]["Enums"]["estatus_armado"] | null
          estatus_entrega: Database["public"]["Enums"]["estatus_entrega"] | null
          fecha_estimada_armado: string | null
          fecha_estimada_entrega: string | null
          fecha_real_armado: string | null
          fecha_real_entrega: string | null
          folio_remision: string | null
          id: string | null
          modelo: string | null
          ns_chasis: string | null
          ns_motor: string | null
          orden_armado: number | null
          vendedor: string | null
        }
        Relationships: []
      }
      v_reporte_remisiones: {
        Row: {
          cliente: string | null
          codigo_erp: string | null
          created_at: string | null
          email_vendedor: string | null
          estatus: Database["public"]["Enums"]["estatus_remision"] | null
          fecha_remision: string | null
          folio_remision: string | null
          id: string | null
          notas: string | null
          tipo_remision: string | null
          total_unidades_solicitadas: number | null
          unidades_asignadas: number | null
          unidades_entregadas: number | null
          updated_at: string | null
          vendedor: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      asignar_chasis_remision: {
        Args: {
          _cantidad: number
          _color?: string
          _modelo?: string
          _remision_id: string
        }
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
      importar_motores_inventario: {
        Args: { _contenedor_id: string; _modelo: string; _motores: Json }
        Returns: Json
      }
      parear_unidades_contenedor: {
        Args: { _contenedor_id: string }
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
      reintentar_asignar_remision: {
        Args: { _remision_id: string }
        Returns: number
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "fabrica"
        | "logistica"
        | "ventas"
        | "coordinador"
        | "finanzas"
        | "admin_financiero"
        | "director_ventas"
        | "coordinador_ventas"
        | "auxiliar_ventas"
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
      app_role: [
        "admin",
        "fabrica",
        "logistica",
        "ventas",
        "coordinador",
        "finanzas",
        "admin_financiero",
        "director_ventas",
        "coordinador_ventas",
        "auxiliar_ventas",
      ],
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
