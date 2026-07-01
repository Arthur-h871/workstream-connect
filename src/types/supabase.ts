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
      apontamento_org_tasks: {
        Row: {
          apontamento_id: string
          id: string
          org_task_id: string
          status: Database["public"]["Enums"]["linked_task_status"]
        }
        Insert: {
          apontamento_id: string
          id?: string
          org_task_id: string
          status?: Database["public"]["Enums"]["linked_task_status"]
        }
        Update: {
          apontamento_id?: string
          id?: string
          org_task_id?: string
          status?: Database["public"]["Enums"]["linked_task_status"]
        }
        Relationships: [
          {
            foreignKeyName: "apontamento_org_tasks_apontamento_id_fkey"
            columns: ["apontamento_id"]
            isOneToOne: false
            referencedRelation: "apontamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apontamento_org_tasks_org_task_id_fkey"
            columns: ["org_task_id"]
            isOneToOne: false
            referencedRelation: "org_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      apontamento_personal_tasks: {
        Row: {
          apontamento_id: string
          id: string
          personal_task_id: string
          status: Database["public"]["Enums"]["linked_task_status"]
        }
        Insert: {
          apontamento_id: string
          id?: string
          personal_task_id: string
          status?: Database["public"]["Enums"]["linked_task_status"]
        }
        Update: {
          apontamento_id?: string
          id?: string
          personal_task_id?: string
          status?: Database["public"]["Enums"]["linked_task_status"]
        }
        Relationships: [
          {
            foreignKeyName: "apontamento_personal_tasks_apontamento_id_fkey"
            columns: ["apontamento_id"]
            isOneToOne: false
            referencedRelation: "apontamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apontamento_personal_tasks_personal_task_id_fkey"
            columns: ["personal_task_id"]
            isOneToOne: false
            referencedRelation: "personal_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      apontamentos: {
        Row: {
          content: string
          created_at: string
          date: string
          hours_worked: number
          id: string
          organization_id: string
          session_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          date?: string
          hours_worked?: number
          id?: string
          organization_id: string
          session_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          date?: string
          hours_worked?: number
          id?: string
          organization_id?: string
          session_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "apontamentos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apontamentos_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "capture_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apontamentos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      capture_sessions: {
        Row: {
          id: string
          organization_id: string
          paused_at: string | null
          pending_task_links: Json
          screenshot_count: number
          started_at: string
          status: Database["public"]["Enums"]["session_status"]
          stopped_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          organization_id: string
          paused_at?: string | null
          pending_task_links?: Json
          screenshot_count?: number
          started_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          stopped_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          organization_id?: string
          paused_at?: string | null
          pending_task_links?: Json
          screenshot_count?: number
          started_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          stopped_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capture_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_requests: {
        Row: {
          created_at: string
          full_name: string
          id: string
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      note_blocks: {
        Row: {
          canvas_id: string
          child_canvas_id: string | null
          content: Json
          created_at: string | null
          height: number
          id: string
          position_x: number
          position_y: number
          type: string
          updated_at: string | null
          user_id: string
          width: number
        }
        Insert: {
          canvas_id: string
          child_canvas_id?: string | null
          content?: Json
          created_at?: string | null
          height?: number
          id?: string
          position_x?: number
          position_y?: number
          type?: string
          updated_at?: string | null
          user_id: string
          width?: number
        }
        Update: {
          canvas_id?: string
          child_canvas_id?: string | null
          content?: Json
          created_at?: string | null
          height?: number
          id?: string
          position_x?: number
          position_y?: number
          type?: string
          updated_at?: string | null
          user_id?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "note_blocks_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "note_canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_blocks_child_canvas_id_fkey"
            columns: ["child_canvas_id"]
            isOneToOne: false
            referencedRelation: "note_canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_blocks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      note_canvases: {
        Row: {
          created_at: string | null
          icon_asset_url: string | null
          icon_type: string
          icon_value: string | null
          id: string
          is_root: boolean
          last_opened_at: string | null
          parent_canvas_id: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          icon_asset_url?: string | null
          icon_type?: string
          icon_value?: string | null
          id?: string
          is_root?: boolean
          last_opened_at?: string | null
          parent_canvas_id?: string | null
          title?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          icon_asset_url?: string | null
          icon_type?: string
          icon_value?: string | null
          id?: string
          is_root?: boolean
          last_opened_at?: string | null
          parent_canvas_id?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_canvases_parent_canvas_id_fkey"
            columns: ["parent_canvas_id"]
            isOneToOne: false
            referencedRelation: "note_canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_canvases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      note_connections: {
        Row: {
          canvas_id: string
          created_at: string | null
          id: string
          source_block_id: string
          source_position_ratio: number
          source_side: string
          source_target_id: string | null
          source_target_type: string
          target_block_id: string
          target_position_ratio: number
          target_side: string
          target_target_id: string | null
          target_target_type: string
        }
        Insert: {
          canvas_id: string
          created_at?: string | null
          id?: string
          source_block_id: string
          source_position_ratio?: number
          source_side?: string
          source_target_id?: string | null
          source_target_type?: string
          target_block_id: string
          target_position_ratio?: number
          target_side?: string
          target_target_id?: string | null
          target_target_type?: string
        }
        Update: {
          canvas_id?: string
          created_at?: string | null
          id?: string
          source_block_id?: string
          source_position_ratio?: number
          source_side?: string
          source_target_id?: string | null
          source_target_type?: string
          target_block_id?: string
          target_position_ratio?: number
          target_side?: string
          target_target_id?: string | null
          target_target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_connections_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "note_canvases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_connections_source_block_id_fkey"
            columns: ["source_block_id"]
            isOneToOne: false
            referencedRelation: "note_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_connections_target_block_id_fkey"
            columns: ["target_block_id"]
            isOneToOne: false
            referencedRelation: "note_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      note_drawings: {
        Row: {
          canvas_id: string
          color: string
          created_at: string | null
          id: string
          path_data: string
          stroke_width: number
        }
        Insert: {
          canvas_id: string
          color?: string
          created_at?: string | null
          id?: string
          path_data: string
          stroke_width?: number
        }
        Update: {
          canvas_id?: string
          color?: string
          created_at?: string | null
          id?: string
          path_data?: string
          stroke_width?: number
        }
        Relationships: [
          {
            foreignKeyName: "note_drawings_canvas_id_fkey"
            columns: ["canvas_id"]
            isOneToOne: false
            referencedRelation: "note_canvases"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          reference_id: string | null
          reference_type: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_task_dependencies: {
        Row: {
          depends_on_id: string
          task_id: string
        }
        Insert: {
          depends_on_id: string
          task_id: string
        }
        Update: {
          depends_on_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_task_dependencies_depends_on_id_fkey"
            columns: ["depends_on_id"]
            isOneToOne: false
            referencedRelation: "org_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "org_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      org_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          note: string | null
          organization_id: string
          priority: number
          project_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          note?: string | null
          organization_id: string
          priority?: number
          project_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          note?: string | null
          organization_id?: string
          priority?: number
          project_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          password: string
          removed_member_retention_days: number
          retention_days: number
        }
        Insert: {
          code?: string
          created_at?: string
          id?: string
          name: string
          password?: string
          removed_member_retention_days?: number
          retention_days?: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          password?: string
          removed_member_retention_days?: number
          retention_days?: number
        }
        Relationships: []
      }
      personal_task_dependencies: {
        Row: {
          depends_on_id: string
          task_id: string
        }
        Insert: {
          depends_on_id: string
          task_id: string
        }
        Update: {
          depends_on_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_task_dependencies_depends_on_id_fkey"
            columns: ["depends_on_id"]
            isOneToOne: false
            referencedRelation: "personal_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_task_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "personal_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_tasks: {
        Row: {
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          priority: number
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: number
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: number
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name: string
          id: string
          organization_id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          color: string
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          name: string
          organization_id: string
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          name: string
          organization_id: string
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      screenshots: {
        Row: {
          captured_at: string
          deleted_at: string | null
          file_size_bytes: number
          id: string
          monitor_index: number
          organization_id: string
          session_id: string
          storage_path: string
          user_id: string
        }
        Insert: {
          captured_at: string
          deleted_at?: string | null
          file_size_bytes: number
          id?: string
          monitor_index?: number
          organization_id: string
          session_id: string
          storage_path: string
          user_id: string
        }
        Update: {
          captured_at?: string
          deleted_at?: string | null
          file_size_bytes?: number
          id?: string
          monitor_index?: number
          organization_id?: string
          session_id?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "screenshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshots_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "capture_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          session_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "capture_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          capture_interval_sec: number
          updated_at: string
          user_id: string
        }
        Insert: {
          capture_interval_sec?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          capture_interval_sec?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_to_org: { Args: { p_org_code: string }; Returns: undefined }
      cancel_my_member_request: { Args: never; Returns: undefined }
      get_my_org_id: { Args: never; Returns: string }
      get_my_pending_request: {
        Args: never
        Returns: {
          org_id: string
          org_name: string
        }[]
      }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_org_name_by_code: { Args: { p_code: string }; Returns: string }
      get_user_id_by_email: { Args: { p_email: string }; Returns: string }
      has_pending_signup: { Args: { p_email: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      linked_task_status: "started" | "concluded"
      notification_type:
        | "new_org_task"
        | "task_assigned"
        | "member_request"
        | "member_accepted"
      project_status: "active" | "closed"
      session_status: "active" | "paused" | "stopped"
      task_status: "queued" | "in_progress" | "completed"
      user_role: "master" | "tenant_admin" | "tenant_user"
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
      linked_task_status: ["started", "concluded"],
      notification_type: [
        "new_org_task",
        "task_assigned",
        "member_request",
        "member_accepted",
      ],
      project_status: ["active", "closed"],
      session_status: ["active", "paused", "stopped"],
      task_status: ["queued", "in_progress", "completed"],
      user_role: ["master", "tenant_admin", "tenant_user"],
    },
  },
} as const
