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
      analytics: {
        Row: {
          avg_view_duration_seconds: number
          click_through_rate: number | null
          comments: number
          created_at: string
          followers_gained: number
          id: string
          likes: number
          metric_date: string
          platform: Database["public"]["Enums"]["platform"] | null
          published_post_id: string | null
          retention_percent: number | null
          shares: number
          views: number
          watch_time_seconds: number
          workspace_id: string
        }
        Insert: {
          avg_view_duration_seconds?: number
          click_through_rate?: number | null
          comments?: number
          created_at?: string
          followers_gained?: number
          id?: string
          likes?: number
          metric_date?: string
          platform?: Database["public"]["Enums"]["platform"] | null
          published_post_id?: string | null
          retention_percent?: number | null
          shares?: number
          views?: number
          watch_time_seconds?: number
          workspace_id: string
        }
        Update: {
          avg_view_duration_seconds?: number
          click_through_rate?: number | null
          comments?: number
          created_at?: string
          followers_gained?: number
          id?: string
          likes?: number
          metric_date?: string
          platform?: Database["public"]["Enums"]["platform"] | null
          published_post_id?: string | null
          retention_percent?: number | null
          shares?: number
          views?: number
          watch_time_seconds?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_published_post_id_fkey"
            columns: ["published_post_id"]
            isOneToOne: false
            referencedRelation: "published_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string
          event: string
          id: number
          path: string | null
          props: Json
          session_id: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: number
          path?: string | null
          props?: Json
          session_id?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: number
          path?: string | null
          props?: Json
          session_id?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          metadata: Json
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      autopilot_configs: {
        Row: {
          audience: string | null
          channel_id: string | null
          content_categories: string[]
          created_at: string
          enabled: boolean
          id: string
          language: string
          mode: string
          niche: string | null
          platforms: Database["public"]["Enums"]["platform"][]
          posting_days: string[]
          posting_times: string[]
          timezone: string
          updated_at: string
          video_duration_seconds: number
          videos_per_week: number
          visual_style: string | null
          voice_id: string | null
          workspace_id: string
        }
        Insert: {
          audience?: string | null
          channel_id?: string | null
          content_categories?: string[]
          created_at?: string
          enabled?: boolean
          id?: string
          language?: string
          mode?: string
          niche?: string | null
          platforms?: Database["public"]["Enums"]["platform"][]
          posting_days?: string[]
          posting_times?: string[]
          timezone?: string
          updated_at?: string
          video_duration_seconds?: number
          videos_per_week?: number
          visual_style?: string | null
          voice_id?: string | null
          workspace_id: string
        }
        Update: {
          audience?: string | null
          channel_id?: string | null
          content_categories?: string[]
          created_at?: string
          enabled?: boolean
          id?: string
          language?: string
          mode?: string
          niche?: string | null
          platforms?: Database["public"]["Enums"]["platform"][]
          posting_days?: string[]
          posting_times?: string[]
          timezone?: string
          updated_at?: string
          video_duration_seconds?: number
          videos_per_week?: number
          visual_style?: string | null
          voice_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autopilot_configs_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autopilot_configs_voice_id_fkey"
            columns: ["voice_id"]
            isOneToOne: false
            referencedRelation: "voices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autopilot_configs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          audience: string | null
          content_style: string | null
          created_at: string
          id: string
          language: string
          name: string
          niche: string | null
          updated_at: string
          visual_style: string | null
          voice_id: string | null
          workspace_id: string
        }
        Insert: {
          audience?: string | null
          content_style?: string | null
          created_at?: string
          id?: string
          language?: string
          name: string
          niche?: string | null
          updated_at?: string
          visual_style?: string | null
          voice_id?: string | null
          workspace_id: string
        }
        Update: {
          audience?: string | null
          content_style?: string | null
          created_at?: string
          id?: string
          language?: string
          name?: string
          niche?: string | null
          updated_at?: string
          visual_style?: string | null
          voice_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          age: string | null
          appearance: string | null
          clothing: string | null
          consistency_prompt: string | null
          created_at: string
          gender: string | null
          hairstyle: string | null
          id: string
          name: string
          personality: string | null
          reference_image_urls: string[]
          updated_at: string
          voice_id: string | null
          workspace_id: string
        }
        Insert: {
          age?: string | null
          appearance?: string | null
          clothing?: string | null
          consistency_prompt?: string | null
          created_at?: string
          gender?: string | null
          hairstyle?: string | null
          id?: string
          name: string
          personality?: string | null
          reference_image_urls?: string[]
          updated_at?: string
          voice_id?: string | null
          workspace_id: string
        }
        Update: {
          age?: string | null
          appearance?: string | null
          clothing?: string | null
          consistency_prompt?: string | null
          created_at?: string
          gender?: string | null
          hairstyle?: string | null
          id?: string
          name?: string
          personality?: string | null
          reference_image_urls?: string[]
          updated_at?: string
          voice_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "characters_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_intents: {
        Row: {
          billing_cycle: string
          created_at: string
          id: string
          idempotency_key: string
          last_error: string | null
          plan: string
          provider: string
          provider_session_id: string | null
          redirect_url: string | null
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          billing_cycle: string
          created_at?: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          plan: string
          provider: string
          provider_session_id?: string | null
          redirect_url?: string | null
          status?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          billing_cycle?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          plan?: string
          provider?: string
          provider_session_id?: string | null
          redirect_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_intents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_feedback: {
        Row: {
          created_at: string
          duration_seconds: number | null
          engagement_rate: number | null
          hook_type: string | null
          id: string
          platform: Database["public"]["Enums"]["platform"] | null
          posting_time: string | null
          project_id: string | null
          retention_percent: number | null
          topic: string | null
          views: number
          visual_style: string | null
          voice_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          engagement_rate?: number | null
          hook_type?: string | null
          id?: string
          platform?: Database["public"]["Enums"]["platform"] | null
          posting_time?: string | null
          project_id?: string | null
          retention_percent?: number | null
          topic?: string | null
          views?: number
          visual_style?: string | null
          voice_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          engagement_rate?: number | null
          hook_type?: string | null
          id?: string
          platform?: Database["public"]["Enums"]["platform"] | null
          posting_time?: string | null
          project_id?: string | null
          retention_percent?: number | null
          topic?: string | null
          views?: number
          visual_style?: string | null
          voice_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_feedback_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_feedback_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_ideas: {
        Row: {
          channel_id: string | null
          created_at: string
          emotional_angle: string | null
          estimated_duration_seconds: number | null
          hook: string | null
          id: string
          language: string | null
          platform: Database["public"]["Enums"]["platform"] | null
          saved: boolean
          suggested_cta: string | null
          suggested_format: string | null
          target_audience: string | null
          title: string
          tone: string | null
          topic: string | null
          visual_concept: string | null
          workspace_id: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          emotional_angle?: string | null
          estimated_duration_seconds?: number | null
          hook?: string | null
          id?: string
          language?: string | null
          platform?: Database["public"]["Enums"]["platform"] | null
          saved?: boolean
          suggested_cta?: string | null
          suggested_format?: string | null
          target_audience?: string | null
          title: string
          tone?: string | null
          topic?: string | null
          visual_concept?: string | null
          workspace_id: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          emotional_angle?: string | null
          estimated_duration_seconds?: number | null
          hook?: string | null
          id?: string
          language?: string | null
          platform?: Database["public"]["Enums"]["platform"] | null
          saved?: boolean
          suggested_cta?: string | null
          suggested_format?: string | null
          target_audience?: string | null
          title?: string
          tone?: string | null
          topic?: string | null
          visual_concept?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_ideas_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_ideas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          job_id: string | null
          kind: Database["public"]["Enums"]["credit_kind"]
          reason: string | null
          workspace_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          job_id?: string | null
          kind: Database["public"]["Enums"]["credit_kind"]
          reason?: string | null
          workspace_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          job_id?: string | null
          kind?: Database["public"]["Enums"]["credit_kind"]
          reason?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      error_issues: {
        Row: {
          count: number
          fingerprint: string
          first_seen: string
          id: string
          kind: string
          last_seen: string
          level: string
          message: string
          metadata: Json
          path: string | null
          release: string | null
          stack: string | null
          status: string
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          count?: number
          fingerprint: string
          first_seen?: string
          id?: string
          kind?: string
          last_seen?: string
          level?: string
          message: string
          metadata?: Json
          path?: string | null
          release?: string | null
          stack?: string | null
          status?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          count?: number
          fingerprint?: string
          first_seen?: string
          id?: string
          kind?: string
          last_seen?: string
          level?: string
          message?: string
          metadata?: Json
          path?: string | null
          release?: string | null
          stack?: string | null
          status?: string
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          created_at: string
          duration_seconds: number | null
          external_url: string | null
          folder: string | null
          id: string
          kind: string
          mime_type: string | null
          name: string
          size_bytes: number | null
          source: string
          storage_path: string | null
          tags: string[]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          external_url?: string | null
          folder?: string | null
          id?: string
          kind: string
          mime_type?: string | null
          name: string
          size_bytes?: number | null
          source?: string
          storage_path?: string | null
          tags?: string[]
          workspace_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          external_url?: string | null
          folder?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          name?: string
          size_bytes?: number | null
          source?: string
          storage_path?: string | null
          tags?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          level: string
          read: boolean
          title: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          level?: string
          read?: boolean
          title: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          level?: string
          read?: boolean
          title?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          created_at: string
          event_id: string
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          provider: string
          status: string
          type: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          provider: string
          status?: string
          type: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string
          status?: string
          type?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_ledger: {
        Row: {
          amount_usd: number | null
          billing_cycle: string | null
          cancel_at_period_end: boolean | null
          canceled_at: string | null
          created_at: string
          currency: string
          entry_type: string
          id: string
          metadata: Json
          occurred_at: string
          period_end: string | null
          plan: string | null
          provider: string
          provider_customer_id: string | null
          provider_event_id: string | null
          provider_subscription_id: string | null
          status: string | null
          workspace_id: string | null
        }
        Insert: {
          amount_usd?: number | null
          billing_cycle?: string | null
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created_at?: string
          currency?: string
          entry_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          period_end?: string | null
          plan?: string | null
          provider: string
          provider_customer_id?: string | null
          provider_event_id?: string | null
          provider_subscription_id?: string | null
          status?: string | null
          workspace_id?: string | null
        }
        Update: {
          amount_usd?: number | null
          billing_cycle?: string | null
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created_at?: string
          currency?: string
          entry_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          period_end?: string | null
          plan?: string | null
          provider?: string
          provider_customer_id?: string | null
          provider_event_id?: string | null
          provider_subscription_id?: string | null
          status?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          onboarding_completed: boolean
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          onboarding_completed?: boolean
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          aspect_ratio: string
          caption_style: string
          channel_id: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          music_track: string | null
          script_id: string | null
          status: Database["public"]["Enums"]["project_status"]
          thumbnail_url: string | null
          title: string
          updated_at: string
          visual_style: string | null
          voice_id: string | null
          workspace_id: string
        }
        Insert: {
          aspect_ratio?: string
          caption_style?: string
          channel_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          music_track?: string | null
          script_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          visual_style?: string | null
          voice_id?: string | null
          workspace_id: string
        }
        Update: {
          aspect_ratio?: string
          caption_style?: string
          channel_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          music_track?: string | null
          script_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          visual_style?: string | null
          voice_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_voice_id_fkey"
            columns: ["voice_id"]
            isOneToOne: false
            referencedRelation: "voices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      published_posts: {
        Row: {
          created_at: string
          external_post_id: string | null
          external_url: string | null
          id: string
          platform: Database["public"]["Enums"]["platform"]
          project_id: string | null
          published_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          external_post_id?: string | null
          external_url?: string | null
          id?: string
          platform: Database["public"]["Enums"]["platform"]
          project_id?: string | null
          published_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          external_post_id?: string | null
          external_url?: string | null
          id?: string
          platform?: Database["public"]["Enums"]["platform"]
          project_id?: string | null
          published_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "published_posts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_posts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      render_jobs: {
        Row: {
          attempts: number
          created_at: string
          error_message: string | null
          id: string
          output_url: string | null
          platform: Database["public"]["Enums"]["platform"] | null
          progress: number
          project_id: string
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          output_url?: string | null
          platform?: Database["public"]["Enums"]["platform"] | null
          progress?: number
          project_id: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          output_url?: string | null
          platform?: Database["public"]["Enums"]["platform"] | null
          progress?: number
          project_id?: string
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      research_topics: {
        Row: {
          category: string | null
          created_at: string
          id: string
          momentum: string | null
          rationale: string | null
          topic: string
          used: boolean
          used_at: string | null
          workspace_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          momentum?: string | null
          rationale?: string | null
          topic: string
          used?: boolean
          used_at?: string | null
          workspace_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          momentum?: string | null
          rationale?: string | null
          topic?: string
          used?: boolean
          used_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_topics_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scenes: {
        Row: {
          camera_movement: string | null
          character_id: string | null
          created_at: string
          duration_seconds: number | null
          emotion: string | null
          environment: string | null
          id: string
          image_prompt: string | null
          lighting: string | null
          media_url: string | null
          narration: string | null
          project_id: string
          scene_number: number
          transition: string | null
          updated_at: string
          video_prompt: string | null
          visual_description: string | null
          workspace_id: string
        }
        Insert: {
          camera_movement?: string | null
          character_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          emotion?: string | null
          environment?: string | null
          id?: string
          image_prompt?: string | null
          lighting?: string | null
          media_url?: string | null
          narration?: string | null
          project_id: string
          scene_number: number
          transition?: string | null
          updated_at?: string
          video_prompt?: string | null
          visual_description?: string | null
          workspace_id: string
        }
        Update: {
          camera_movement?: string | null
          character_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          emotion?: string | null
          environment?: string | null
          id?: string
          image_prompt?: string | null
          lighting?: string | null
          media_url?: string | null
          narration?: string | null
          project_id?: string
          scene_number?: number
          transition?: string | null
          updated_at?: string
          video_prompt?: string | null
          visual_description?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenes_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_posts: {
        Row: {
          created_at: string
          cta: string | null
          description: string | null
          hashtags: string[]
          id: string
          platform: Database["public"]["Enums"]["platform"]
          project_id: string
          scheduled_for: string
          social_account_id: string | null
          status: string
          title: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          cta?: string | null
          description?: string | null
          hashtags?: string[]
          id?: string
          platform: Database["public"]["Enums"]["platform"]
          project_id: string
          scheduled_for: string
          social_account_id?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          cta?: string | null
          description?: string | null
          hashtags?: string[]
          id?: string
          platform?: Database["public"]["Enums"]["platform"]
          project_id?: string
          scheduled_for?: string
          social_account_id?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_posts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_posts_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_posts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts: {
        Row: {
          created_at: string
          cta: string | null
          estimated_duration_seconds: number
          hook: string | null
          id: string
          idea_id: string | null
          introduction: string | null
          language: string
          main_content: string | null
          payoff: string | null
          title: string
          tone: string | null
          turning_point: string | null
          updated_at: string
          word_count: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          cta?: string | null
          estimated_duration_seconds?: number
          hook?: string | null
          id?: string
          idea_id?: string | null
          introduction?: string | null
          language?: string
          main_content?: string | null
          payoff?: string | null
          title: string
          tone?: string | null
          turning_point?: string | null
          updated_at?: string
          word_count?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          cta?: string | null
          estimated_duration_seconds?: number
          hook?: string | null
          id?: string
          idea_id?: string | null
          introduction?: string | null
          language?: string
          main_content?: string | null
          payoff?: string | null
          title?: string
          tone?: string | null
          turning_point?: string | null
          updated_at?: string
          word_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scripts_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "content_ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scripts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          created_at: string
          id: string
          ip: string | null
          kind: string
          metadata: Json
          path: string | null
          user_agent: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip?: string | null
          kind: string
          metadata?: Json
          path?: string | null
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip?: string | null
          kind?: string
          metadata?: Json
          path?: string | null
          user_agent?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: []
      }
      social_accounts: {
        Row: {
          account_name: string | null
          connected_at: string | null
          created_at: string
          external_account_id: string | null
          id: string
          platform: Database["public"]["Enums"]["platform"]
          scopes: string[]
          status: string
          token_expires_at: string | null
          workspace_id: string
        }
        Insert: {
          account_name?: string | null
          connected_at?: string | null
          created_at?: string
          external_account_id?: string | null
          id?: string
          platform: Database["public"]["Enums"]["platform"]
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          workspace_id: string
        }
        Update: {
          account_name?: string | null
          connected_at?: string | null
          created_at?: string
          external_account_id?: string | null
          id?: string
          platform?: Database["public"]["Enums"]["platform"]
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_cycle: string
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          id: string
          plan: Database["public"]["Enums"]["plan_tier"]
          provider: string | null
          provider_customer_id: string | null
          provider_plan_id: string | null
          provider_subscription_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          billing_cycle?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          provider?: string | null
          provider_customer_id?: string | null
          provider_plan_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          billing_cycle?: string
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          provider?: string | null
          provider_customer_id?: string | null
          provider_plan_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          caption_style: string | null
          category: string
          created_at: string
          default_aspect_ratio: string
          default_duration_seconds: number | null
          description: string | null
          id: string
          is_system: boolean
          key: string
          name: string
          structure: Json
          visual_style: string | null
          workspace_id: string | null
        }
        Insert: {
          caption_style?: string | null
          category: string
          created_at?: string
          default_aspect_ratio?: string
          default_duration_seconds?: number | null
          description?: string | null
          id?: string
          is_system?: boolean
          key: string
          name: string
          structure?: Json
          visual_style?: string | null
          workspace_id?: string | null
        }
        Update: {
          caption_style?: string | null
          category?: string
          created_at?: string
          default_aspect_ratio?: string
          default_duration_seconds?: number | null
          description?: string | null
          id?: string
          is_system?: boolean
          key?: string
          name?: string
          structure?: Json
          visual_style?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_credits: {
        Row: {
          balance: number
          free_grant_at: string
          id: string
          lifetime_consumed: number
          lifetime_purchased: number
          reserved: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          balance?: number
          free_grant_at?: string
          id?: string
          lifetime_consumed?: number
          lifetime_purchased?: number
          reserved?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          balance?: number
          free_grant_at?: string
          id?: string
          lifetime_consumed?: number
          lifetime_purchased?: number
          reserved?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_credits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
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
      video_jobs: {
        Row: {
          attempts: number
          created_at: string
          credits_consumed: number
          credits_reserved: number
          error_message: string | null
          id: string
          kind: string
          payload: Json
          progress: number
          project_id: string | null
          provider: string | null
          result: Json | null
          scene_id: string | null
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          credits_consumed?: number
          credits_reserved?: number
          error_message?: string | null
          id?: string
          kind: string
          payload?: Json
          progress?: number
          project_id?: string | null
          provider?: string | null
          result?: Json | null
          scene_id?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          credits_consumed?: number
          credits_reserved?: number
          error_message?: string | null
          id?: string
          kind?: string
          payload?: Json
          progress?: number
          project_id?: string | null
          provider?: string | null
          result?: Json | null
          scene_id?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_jobs_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      voices: {
        Row: {
          accent: string | null
          consent_confirmed: boolean
          consent_confirmed_at: string | null
          created_at: string
          gender: string | null
          id: string
          is_clone: boolean
          language: string
          name: string
          preview_url: string | null
          provider: string
          provider_voice_id: string | null
          tone: string | null
          workspace_id: string
        }
        Insert: {
          accent?: string | null
          consent_confirmed?: boolean
          consent_confirmed_at?: string | null
          created_at?: string
          gender?: string | null
          id?: string
          is_clone?: boolean
          language?: string
          name: string
          preview_url?: string | null
          provider?: string
          provider_voice_id?: string | null
          tone?: string | null
          workspace_id: string
        }
        Update: {
          accent?: string | null
          consent_confirmed?: boolean
          consent_confirmed_at?: string | null
          created_at?: string
          gender?: string | null
          id?: string
          is_clone?: boolean
          language?: string
          name?: string
          preview_url?: string | null
          provider?: string
          provider_voice_id?: string | null
          tone?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          plan: Database["public"]["Enums"]["plan_tier"]
          slug: string | null
          suspended: boolean
          suspension_reason: string | null
          updated_at: string
          white_label: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          slug?: string | null
          suspended?: boolean
          suspension_reason?: string | null
          updated_at?: string
          white_label?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          plan?: Database["public"]["Enums"]["plan_tier"]
          slug?: string | null
          suspended?: boolean
          suspension_reason?: string | null
          updated_at?: string
          white_label?: boolean
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          is_secret: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          is_secret?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          is_secret?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_rate_limit: {
        Args: { _key: string; _limit: number; _window_seconds: number }
        Returns: boolean
      }
      claim_free_monthly_credits: {
        Args: { _credits: number; _workspace_id: string }
        Returns: number
      }
      claim_first_admin: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"] | null
      }
      consume_credits: {
        Args: { _amount: number; _reason: string; _workspace_id: string }
        Returns: number
      }
      ensure_workspace: {
        Args: { _default_name: string; _free_credits: number; _user_id: string }
        Returns: {
          id: string
          name: string
          owner_id: string
          plan: Database["public"]["Enums"]["plan_tier"]
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_workspace_member: { Args: { _workspace_id: string }; Returns: boolean }
      purge_rate_limits: { Args: { _older_than_seconds?: number }; Returns: number }
      purge_security_events: {
        Args: { _older_than_days?: number }
        Returns: number
      }
      clear_rate_limit: {
        Args: { _key: string }
        Returns: undefined
      }
      peek_rate_limit: {
        Args: { _key: string; _window_seconds: number }
        Returns: number
      }
      reorder_scenes: { Args: { _ids: string[] }; Returns: undefined }
      find_duplicate_users: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          email: string
          full_name: string
          normalized_email: string
          duplicate_count: number
          created_at: string
        }[]
      }
      record_error_issue: {
        Args: {
          _fingerprint: string
          _kind: string
          _level: string
          _message: string
          _stack?: string | null
          _path?: string | null
          _user_id?: string | null
          _workspace_id?: string | null
          _release?: string | null
          _metadata?: Json
        }
        Returns: undefined
      }
      purge_error_issues: { Args: { _older_than_days?: number }; Returns: number }
      purge_analytics_events: { Args: { _older_than_days?: number }; Returns: number }
      purge_audit_logs: { Args: { _older_than_days?: number }; Returns: number }
      erase_user_data: { Args: { _user_id: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "super_admin" | "user"
      credit_kind: "purchase" | "grant" | "reserve" | "consume" | "refund"
      job_status:
        | "queued"
        | "processing"
        | "generating"
        | "rendering"
        | "completed"
        | "failed"
        | "cancelled"
      plan_tier: "free" | "creator" | "pro" | "agency"
      platform:
        | "youtube"
        | "youtube_shorts"
        | "tiktok"
        | "instagram"
        | "facebook"
        | "x"
        | "threads"
      project_status:
        | "draft"
        | "scripting"
        | "storyboard"
        | "generating"
        | "rendering"
        | "awaiting_approval"
        | "scheduled"
        | "published"
        | "failed"
      workspace_role: "owner" | "admin" | "editor" | "viewer"
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
      app_role: ["admin", "super_admin", "user"],
      credit_kind: ["purchase", "grant", "reserve", "consume", "refund"],
      job_status: [
        "queued",
        "processing",
        "generating",
        "rendering",
        "completed",
        "failed",
        "cancelled",
      ],
      plan_tier: ["free", "creator", "pro", "agency"],
      platform: [
        "youtube",
        "youtube_shorts",
        "tiktok",
        "instagram",
        "facebook",
        "x",
        "threads",
      ],
      project_status: [
        "draft",
        "scripting",
        "storyboard",
        "generating",
        "rendering",
        "awaiting_approval",
        "scheduled",
        "published",
        "failed",
      ],
      workspace_role: ["owner", "admin", "editor", "viewer"],
    },
  },
} as const
