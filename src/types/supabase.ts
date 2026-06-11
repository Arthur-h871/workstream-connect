/**
 * Tipos TypeScript derivados do schema do banco de dados.
 *
 * IMPORTANTE: Este arquivo foi criado manualmente com base em docs/DATABASE_SCHEMA.md.
 * Quando o projeto Supabase estiver criado e migrado, substitua este arquivo
 * pelo output do comando:
 *
 *   npx supabase gen types typescript --project-id <PROJECT_ID> > src/types/supabase.ts
 *
 * Ou use o script:
 *
 *   npm run db:types
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          code: string;
          password: string;
          retention_days: number;
          removed_member_retention_days: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code: string;
          password: string;
          retention_days?: number;
          removed_member_retention_days?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          code?: string;
          password?: string;
          retention_days?: number;
          removed_member_retention_days?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      member_requests: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string;
          full_name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id: string;
          full_name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          organization_id?: string;
          full_name?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "member_requests_organization_id_fkey";
            columns: ["organization_id"];
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          organization_id: string;
          role: Database["public"]["Enums"]["user_role"];
          full_name: string;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          organization_id: string;
          role?: Database["public"]["Enums"]["user_role"];
          full_name: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          role?: Database["public"]["Enums"]["user_role"];
          full_name?: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey";
            columns: ["organization_id"];
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      user_settings: {
        Row: {
          user_id: string;
          capture_interval_sec: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          capture_interval_sec?: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          capture_interval_sec?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      capture_sessions: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string;
          status: Database["public"]["Enums"]["session_status"];
          started_at: string;
          paused_at: string | null;
          stopped_at: string | null;
          screenshot_count: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id: string;
          status?: Database["public"]["Enums"]["session_status"];
          started_at?: string;
          paused_at?: string | null;
          stopped_at?: string | null;
          screenshot_count?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          organization_id?: string;
          status?: Database["public"]["Enums"]["session_status"];
          started_at?: string;
          paused_at?: string | null;
          stopped_at?: string | null;
          screenshot_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "capture_sessions_organization_id_fkey";
            columns: ["organization_id"];
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "capture_sessions_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      screenshots: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          organization_id: string;
          captured_at: string;
          storage_path: string;
          file_size_bytes: number;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          session_id: string;
          user_id: string;
          organization_id: string;
          captured_at: string;
          storage_path: string;
          file_size_bytes: number;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          session_id?: string;
          user_id?: string;
          organization_id?: string;
          captured_at?: string;
          storage_path?: string;
          file_size_bytes?: number;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "screenshots_session_id_fkey";
            columns: ["session_id"];
            referencedRelation: "capture_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "screenshots_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      apontamentos: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string;
          session_id: string | null;
          date: string;
          content: string;
          hours_worked: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id: string;
          session_id?: string | null;
          date?: string;
          content?: string;
          hours_worked?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          organization_id?: string;
          session_id?: string | null;
          date?: string;
          content?: string;
          hours_worked?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "apontamentos_session_id_fkey";
            columns: ["session_id"];
            referencedRelation: "capture_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "apontamentos_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      personal_tasks: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          status: Database["public"]["Enums"]["task_status"];
          priority: number;
          due_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          priority?: number;
          due_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          priority?: number;
          due_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "personal_tasks_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      personal_task_dependencies: {
        Row: {
          task_id: string;
          depends_on_id: string;
        };
        Insert: {
          task_id: string;
          depends_on_id: string;
        };
        Update: {
          task_id?: string;
          depends_on_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "personal_task_dependencies_task_id_fkey";
            columns: ["task_id"];
            referencedRelation: "personal_tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "personal_task_dependencies_depends_on_id_fkey";
            columns: ["depends_on_id"];
            referencedRelation: "personal_tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          id: string;
          organization_id: string;
          created_by: string;
          name: string;
          description: string | null;
          color: string;
          status: Database["public"]["Enums"]["project_status"];
          due_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          created_by: string;
          name: string;
          description?: string | null;
          color?: string;
          status?: Database["public"]["Enums"]["project_status"];
          due_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          created_by?: string;
          name?: string;
          description?: string | null;
          color?: string;
          status?: Database["public"]["Enums"]["project_status"];
          due_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey";
            columns: ["organization_id"];
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      org_tasks: {
        Row: {
          id: string;
          organization_id: string;
          project_id: string | null;
          created_by: string;
          assigned_to: string | null;
          title: string;
          description: string | null;
          status: Database["public"]["Enums"]["task_status"];
          priority: number;
          due_date: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          project_id?: string | null;
          created_by: string;
          assigned_to?: string | null;
          title: string;
          description?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          priority?: number;
          due_date?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          project_id?: string | null;
          created_by?: string;
          assigned_to?: string | null;
          title?: string;
          description?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          priority?: number;
          due_date?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_tasks_organization_id_fkey";
            columns: ["organization_id"];
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_tasks_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_tasks_assigned_to_fkey";
            columns: ["assigned_to"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      org_task_dependencies: {
        Row: {
          task_id: string;
          depends_on_id: string;
        };
        Insert: {
          task_id: string;
          depends_on_id: string;
        };
        Update: {
          task_id?: string;
          depends_on_id?: string;
        };
        Relationships: [];
      };
      apontamento_personal_tasks: {
        Row: {
          id: string;
          apontamento_id: string;
          personal_task_id: string;
          status: Database["public"]["Enums"]["linked_task_status"];
        };
        Insert: {
          id?: string;
          apontamento_id: string;
          personal_task_id: string;
          status?: Database["public"]["Enums"]["linked_task_status"];
        };
        Update: {
          id?: string;
          apontamento_id?: string;
          personal_task_id?: string;
          status?: Database["public"]["Enums"]["linked_task_status"];
        };
        Relationships: [
          {
            foreignKeyName: "apontamento_personal_tasks_apontamento_id_fkey";
            columns: ["apontamento_id"];
            referencedRelation: "apontamentos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "apontamento_personal_tasks_personal_task_id_fkey";
            columns: ["personal_task_id"];
            referencedRelation: "personal_tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      apontamento_org_tasks: {
        Row: {
          id: string;
          apontamento_id: string;
          org_task_id: string;
          status: Database["public"]["Enums"]["linked_task_status"];
        };
        Insert: {
          id?: string;
          apontamento_id: string;
          org_task_id: string;
          status?: Database["public"]["Enums"]["linked_task_status"];
        };
        Update: {
          id?: string;
          apontamento_id?: string;
          org_task_id?: string;
          status?: Database["public"]["Enums"]["linked_task_status"];
        };
        Relationships: [
          {
            foreignKeyName: "apontamento_org_tasks_apontamento_id_fkey";
            columns: ["apontamento_id"];
            referencedRelation: "apontamentos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "apontamento_org_tasks_org_task_id_fkey";
            columns: ["org_task_id"];
            referencedRelation: "org_tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: Database["public"]["Enums"]["notification_type"];
          title: string;
          body: string;
          reference_id: string | null;
          reference_type: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: Database["public"]["Enums"]["notification_type"];
          title: string;
          body: string;
          reference_id?: string | null;
          reference_type?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: Database["public"]["Enums"]["notification_type"];
          title?: string;
          body?: string;
          reference_id?: string | null;
          reference_type?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      get_my_org_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      get_my_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["user_role"];
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      get_org_name_by_code: {
        Args: { p_code: string };
        Returns: string | null;
      };
      has_pending_signup: {
        Args: { p_email: string };
        Returns: boolean;
      };
      get_user_id_by_email: {
        Args: { p_email: string };
        Returns: string | null;
      };
    };
    Enums: {
      user_role: "master" | "tenant_admin" | "tenant_user";
      session_status: "active" | "paused" | "stopped";
      task_status: "queued" | "in_progress" | "completed";
      project_status: "active" | "closed";
      linked_task_status: "started" | "concluded";
      notification_type:
        | "new_org_task"
        | "task_assigned"
        | "member_request"
        | "member_accepted";
    };
    CompositeTypes: Record<never, never>;
  };
};

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
