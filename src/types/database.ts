export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      attachments: {
        Row: {
          company_id: string
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["attachment_entity_type"]
          file_name: string
          id: string
          mime_type: string
          notes: string | null
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["attachment_entity_type"]
          file_name: string
          id?: string
          mime_type: string
          notes?: string | null
          size_bytes: number
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["attachment_entity_type"]
          file_name?: string
          id?: string
          mime_type?: string
          notes?: string | null
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          changed_fields: string[] | null
          id: number
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          changed_fields?: string[] | null
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          changed_fields?: string[] | null
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      balance_report_models: {
        Row: {
          company_group_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          lines: Json
          metadata: Json
          organization_id: string
          updated_at: string
        }
        Insert: {
          company_group_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lines?: Json
          metadata?: Json
          organization_id: string
          updated_at?: string
        }
        Update: {
          company_group_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lines?: Json
          metadata?: Json
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "balance_report_models_company_group_id_fkey"
            columns: ["company_group_id"]
            isOneToOne: false
            referencedRelation: "company_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_report_models_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balance_report_models_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          account_type: Database["public"]["Enums"]["bank_account_type"]
          agency: string | null
          bank_name: string
          company_id: string
          created_at: string
          id: string
          initial_balance: number
          initial_balance_date: string | null
          is_active: boolean
          nickname: string
          notes: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          account_type: Database["public"]["Enums"]["bank_account_type"]
          agency?: string | null
          bank_name: string
          company_id: string
          created_at?: string
          id?: string
          initial_balance?: number
          initial_balance_date?: string | null
          is_active?: boolean
          nickname: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          account_type?: Database["public"]["Enums"]["bank_account_type"]
          agency?: string | null
          bank_name?: string
          company_id?: string
          created_at?: string
          id?: string
          initial_balance?: number
          initial_balance_date?: string | null
          is_active?: boolean
          nickname?: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_lines: {
        Row: {
          amount: number
          balance_after: number | null
          bank_account_id: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string
          document_ref: string | null
          fit_id: string | null
          id: string
          import_batch_id: string | null
          import_source: string
          matched_at: string | null
          matched_by: string | null
          matched_transaction_id: string | null
          notes: string | null
          posted_at: string
          raw: Json
          status: Database["public"]["Enums"]["statement_line_status"]
        }
        Insert: {
          amount: number
          balance_after?: number | null
          bank_account_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          description: string
          document_ref?: string | null
          fit_id?: string | null
          id?: string
          import_batch_id?: string | null
          import_source?: string
          matched_at?: string | null
          matched_by?: string | null
          matched_transaction_id?: string | null
          notes?: string | null
          posted_at: string
          raw?: Json
          status?: Database["public"]["Enums"]["statement_line_status"]
        }
        Update: {
          amount?: number
          balance_after?: number | null
          bank_account_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          document_ref?: string | null
          fit_id?: string | null
          id?: string
          import_batch_id?: string | null
          import_source?: string
          matched_at?: string | null
          matched_by?: string | null
          matched_transaction_id?: string | null
          notes?: string | null
          posted_at?: string
          raw?: Json
          status?: Database["public"]["Enums"]["statement_line_status"]
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_lines_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_matched_transaction_id_fkey"
            columns: ["matched_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_matched_transaction_id_fkey"
            columns: ["matched_transaction_id"]
            isOneToOne: false
            referencedRelation: "v_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_matched_transaction_id_fkey"
            columns: ["matched_transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statement_lines_matched_transaction_id_fkey"
            columns: ["matched_transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions_signed"
            referencedColumns: ["id"]
          },
        ]
      }
      card_statement_lines: {
        Row: {
          ai_confidence: number | null
          amount: number
          amount_original: number | null
          beneficiary_company_id: string | null
          card_id: string
          classification_source:
            | Database["public"]["Enums"]["card_classification_source"]
            | null
          classification_status: Database["public"]["Enums"]["card_line_classification"]
          company_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          cost_center_id: string | null
          counterparty_id: string | null
          created_at: string
          currency: string
          description: string
          fx_rate: number | null
          id: string
          installment_n: number | null
          installment_total: number | null
          iof_amount: number
          line_kind: Database["public"]["Enums"]["card_line_kind"]
          management_account_id: string | null
          nature_override: Database["public"]["Enums"]["expense_nature"] | null
          purchase_date: string
          rule_id: string | null
          sort_order: number
          statement_id: string
          suggestion_reason: string | null
          updated_at: string
        }
        Insert: {
          ai_confidence?: number | null
          amount: number
          amount_original?: number | null
          beneficiary_company_id?: string | null
          card_id: string
          classification_source?:
            | Database["public"]["Enums"]["card_classification_source"]
            | null
          classification_status?: Database["public"]["Enums"]["card_line_classification"]
          company_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          currency?: string
          description: string
          fx_rate?: number | null
          id?: string
          installment_n?: number | null
          installment_total?: number | null
          iof_amount?: number
          line_kind: Database["public"]["Enums"]["card_line_kind"]
          management_account_id?: string | null
          nature_override?: Database["public"]["Enums"]["expense_nature"] | null
          purchase_date: string
          rule_id?: string | null
          sort_order: number
          statement_id: string
          suggestion_reason?: string | null
          updated_at?: string
        }
        Update: {
          ai_confidence?: number | null
          amount?: number
          amount_original?: number | null
          beneficiary_company_id?: string | null
          card_id?: string
          classification_source?:
            | Database["public"]["Enums"]["card_classification_source"]
            | null
          classification_status?: Database["public"]["Enums"]["card_line_classification"]
          company_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          currency?: string
          description?: string
          fx_rate?: number | null
          id?: string
          installment_n?: number | null
          installment_total?: number | null
          iof_amount?: number
          line_kind?: Database["public"]["Enums"]["card_line_kind"]
          management_account_id?: string | null
          nature_override?: Database["public"]["Enums"]["expense_nature"] | null
          purchase_date?: string
          rule_id?: string | null
          sort_order?: number
          statement_id?: string
          suggestion_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_statement_lines_beneficiary_company_id_fkey"
            columns: ["beneficiary_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_statement_lines_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "payment_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_statement_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_statement_lines_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_statement_lines_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_statement_lines_management_account_id_fkey"
            columns: ["management_account_id"]
            isOneToOne: false
            referencedRelation: "management_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_statement_lines_management_account_id_fkey"
            columns: ["management_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["management_account_id"]
          },
          {
            foreignKeyName: "card_statement_lines_management_account_id_fkey"
            columns: ["management_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["management_group_id"]
          },
          {
            foreignKeyName: "card_statement_lines_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "classification_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_statement_lines_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "card_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      card_statements: {
        Row: {
          attachment_id: string | null
          closing_date: string
          company_id: string
          created_at: string
          created_by: string | null
          due_date: string
          file_sha256: string | null
          id: string
          issuer: string
          metadata: Json
          parser: string
          parser_version: string
          status: Database["public"]["Enums"]["card_statement_status"]
          summary: Json
          total_amount: number
          transaction_id: string
          updated_at: string
          validation: Json
          warnings: Json
        }
        Insert: {
          attachment_id?: string | null
          closing_date: string
          company_id: string
          created_at?: string
          created_by?: string | null
          due_date: string
          file_sha256?: string | null
          id?: string
          issuer: string
          metadata?: Json
          parser: string
          parser_version: string
          status: Database["public"]["Enums"]["card_statement_status"]
          summary?: Json
          total_amount: number
          transaction_id: string
          updated_at?: string
          validation?: Json
          warnings?: Json
        }
        Update: {
          attachment_id?: string | null
          closing_date?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          due_date?: string
          file_sha256?: string | null
          id?: string
          issuer?: string
          metadata?: Json
          parser?: string
          parser_version?: string
          status?: Database["public"]["Enums"]["card_statement_status"]
          summary?: Json
          total_amount?: number
          transaction_id?: string
          updated_at?: string
          validation?: Json
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "card_statements_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_statements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_statements_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_statements_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "v_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_statements_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_statements_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "v_transactions_signed"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_balance_snapshots: {
        Row: {
          bank_account_id: string
          closing_balance: number
          created_at: string
          id: string
          is_reconciled: boolean
          notes: string | null
          opening_balance: number
          reference_month: string
          total_inflow: number
          total_outflow: number
          updated_at: string
        }
        Insert: {
          bank_account_id: string
          closing_balance: number
          created_at?: string
          id?: string
          is_reconciled?: boolean
          notes?: string | null
          opening_balance: number
          reference_month: string
          total_inflow?: number
          total_outflow?: number
          updated_at?: string
        }
        Update: {
          bank_account_id?: string
          closing_balance?: number
          created_at?: string
          id?: string
          is_reconciled?: boolean
          notes?: string | null
          opening_balance?: number
          reference_month?: string
          total_inflow?: number
          total_outflow?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_balance_snapshots_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          below_the_line: boolean
          code: string
          company_id: string
          created_at: string
          dre_section: Database["public"]["Enums"]["dre_section"] | null
          id: string
          is_active: boolean
          is_summary: boolean
          kind: Database["public"]["Enums"]["account_kind"]
          management_account_id: string | null
          master_account_id: string | null
          name: string
          notes: string | null
          parent_id: string | null
          presumption_class:
            | Database["public"]["Enums"]["tax_presumption_class"]
            | null
          sign_hint: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          below_the_line?: boolean
          code: string
          company_id: string
          created_at?: string
          dre_section?: Database["public"]["Enums"]["dre_section"] | null
          id?: string
          is_active?: boolean
          is_summary?: boolean
          kind: Database["public"]["Enums"]["account_kind"]
          management_account_id?: string | null
          master_account_id?: string | null
          name: string
          notes?: string | null
          parent_id?: string | null
          presumption_class?:
            | Database["public"]["Enums"]["tax_presumption_class"]
            | null
          sign_hint?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          below_the_line?: boolean
          code?: string
          company_id?: string
          created_at?: string
          dre_section?: Database["public"]["Enums"]["dre_section"] | null
          id?: string
          is_active?: boolean
          is_summary?: boolean
          kind?: Database["public"]["Enums"]["account_kind"]
          management_account_id?: string | null
          master_account_id?: string | null
          name?: string
          notes?: string | null
          parent_id?: string | null
          presumption_class?:
            | Database["public"]["Enums"]["tax_presumption_class"]
            | null
          sign_hint?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_management_account_id_fkey"
            columns: ["management_account_id"]
            isOneToOne: false
            referencedRelation: "management_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_management_account_id_fkey"
            columns: ["management_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["management_account_id"]
          },
          {
            foreignKeyName: "chart_of_accounts_management_account_id_fkey"
            columns: ["management_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["management_group_id"]
          },
          {
            foreignKeyName: "chart_of_accounts_master_account_id_fkey"
            columns: ["master_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["account_id"]
          },
        ]
      }
      chart_of_accounts_master: {
        Row: {
          below_the_line: boolean
          code: string
          created_at: string
          dre_section: Database["public"]["Enums"]["dre_section"] | null
          id: string
          is_active: boolean
          is_summary: boolean
          kind: Database["public"]["Enums"]["account_kind"]
          management_account_id: string | null
          name: string
          notes: string | null
          organization_id: string
          parent_id: string | null
          presumption_class:
            | Database["public"]["Enums"]["tax_presumption_class"]
            | null
          sign_hint: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          below_the_line?: boolean
          code: string
          created_at?: string
          dre_section?: Database["public"]["Enums"]["dre_section"] | null
          id?: string
          is_active?: boolean
          is_summary?: boolean
          kind: Database["public"]["Enums"]["account_kind"]
          management_account_id?: string | null
          name: string
          notes?: string | null
          organization_id: string
          parent_id?: string | null
          presumption_class?:
            | Database["public"]["Enums"]["tax_presumption_class"]
            | null
          sign_hint?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          below_the_line?: boolean
          code?: string
          created_at?: string
          dre_section?: Database["public"]["Enums"]["dre_section"] | null
          id?: string
          is_active?: boolean
          is_summary?: boolean
          kind?: Database["public"]["Enums"]["account_kind"]
          management_account_id?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          parent_id?: string | null
          presumption_class?:
            | Database["public"]["Enums"]["tax_presumption_class"]
            | null
          sign_hint?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_master_management_account_id_fkey"
            columns: ["management_account_id"]
            isOneToOne: false
            referencedRelation: "management_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_master_management_account_id_fkey"
            columns: ["management_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["management_account_id"]
          },
          {
            foreignKeyName: "chart_of_accounts_master_management_account_id_fkey"
            columns: ["management_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["management_group_id"]
          },
          {
            foreignKeyName: "chart_of_accounts_master_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_master_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts_master"
            referencedColumns: ["id"]
          },
        ]
      }
      classification_rules: {
        Row: {
          beneficiary_company_id: string | null
          company_id: string | null
          cost_center_id: string | null
          counterparty_id: string | null
          created_at: string
          created_by: string | null
          created_from_line_id: string | null
          id: string
          is_active: boolean
          management_account_id: string
          match_kind: string
          name: string
          organization_id: string
          pattern: string
          priority: number
          updated_at: string
        }
        Insert: {
          beneficiary_company_id?: string | null
          company_id?: string | null
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by?: string | null
          created_from_line_id?: string | null
          id?: string
          is_active?: boolean
          management_account_id: string
          match_kind: string
          name: string
          organization_id: string
          pattern: string
          priority?: number
          updated_at?: string
        }
        Update: {
          beneficiary_company_id?: string | null
          company_id?: string | null
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by?: string | null
          created_from_line_id?: string | null
          id?: string
          is_active?: boolean
          management_account_id?: string
          match_kind?: string
          name?: string
          organization_id?: string
          pattern?: string
          priority?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classification_rules_beneficiary_company_id_fkey"
            columns: ["beneficiary_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classification_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classification_rules_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classification_rules_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classification_rules_management_account_id_fkey"
            columns: ["management_account_id"]
            isOneToOne: false
            referencedRelation: "management_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classification_rules_management_account_id_fkey"
            columns: ["management_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["management_account_id"]
          },
          {
            foreignKeyName: "classification_rules_management_account_id_fkey"
            columns: ["management_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["management_group_id"]
          },
          {
            foreignKeyName: "classification_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          brand_color: string | null
          cnpj: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_holding: boolean
          legal_name: string
          organization_id: string
          sort_order: number
          tax_regime: Database["public"]["Enums"]["company_tax_regime"]
          trade_name: string | null
          updated_at: string
        }
        Insert: {
          brand_color?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_holding?: boolean
          legal_name: string
          organization_id: string
          sort_order?: number
          tax_regime?: Database["public"]["Enums"]["company_tax_regime"]
          trade_name?: string | null
          updated_at?: string
        }
        Update: {
          brand_color?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_holding?: boolean
          legal_name?: string
          organization_id?: string
          sort_order?: number
          tax_regime?: Database["public"]["Enums"]["company_tax_regime"]
          trade_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_access: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_access_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_group_members: {
        Row: {
          company_id: string
          created_at: string
          group_id: string
          id: string
          organization_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          group_id: string
          id?: string
          organization_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          group_id?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_group_members_company_fk"
            columns: ["company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "company_group_members_group_fk"
            columns: ["group_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "company_groups"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      company_groups: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          metadata: Json
          name: string
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          name: string
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          name?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_center_migration_log: {
        Row: {
          entity: string
          entity_id: string
          id: string
          migrated_at: string
          nature_override: Database["public"]["Enums"]["expense_nature"] | null
          new_cost_center_id: string | null
          old_cost_center_id: string | null
        }
        Insert: {
          entity: string
          entity_id: string
          id?: string
          migrated_at?: string
          nature_override?: Database["public"]["Enums"]["expense_nature"] | null
          new_cost_center_id?: string | null
          old_cost_center_id?: string | null
        }
        Update: {
          entity?: string
          entity_id?: string
          id?: string
          migrated_at?: string
          nature_override?: Database["public"]["Enums"]["expense_nature"] | null
          new_cost_center_id?: string | null
          old_cost_center_id?: string | null
        }
        Relationships: []
      }
      cost_centers: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      counterparties: {
        Row: {
          created_at: string
          document: string | null
          email: string | null
          id: string
          is_active: boolean
          kind: string | null
          metadata: Json
          name: string
          organization_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          kind?: string | null
          metadata?: Json
          name: string
          organization_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          kind?: string | null
          metadata?: Json
          name?: string
          organization_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "counterparties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          base_salary: number
          company_id: string
          cost_center_id: string | null
          cpf: string | null
          created_at: string
          deleted_at: string | null
          department: string | null
          email: string | null
          employee_kind: Database["public"]["Enums"]["employee_kind"]
          full_name: string
          hire_date: string
          id: string
          is_partner: boolean
          metadata: Json
          notes: string | null
          role: string | null
          status: Database["public"]["Enums"]["employee_status"]
          termination_date: string | null
          updated_at: string
        }
        Insert: {
          base_salary: number
          company_id: string
          cost_center_id?: string | null
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          email?: string | null
          employee_kind?: Database["public"]["Enums"]["employee_kind"]
          full_name: string
          hire_date: string
          id?: string
          is_partner?: boolean
          metadata?: Json
          notes?: string | null
          role?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          termination_date?: string | null
          updated_at?: string
        }
        Update: {
          base_salary?: number
          company_id?: string
          cost_center_id?: string | null
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          department?: string | null
          email?: string | null
          employee_kind?: Database["public"]["Enums"]["employee_kind"]
          full_name?: string
          hire_date?: string
          id?: string
          is_partner?: boolean
          metadata?: Json
          notes?: string | null
          role?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          termination_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_company_settings: {
        Row: {
          aliquota_iss: number | null
          ambiente: Database["public"]["Enums"]["nfse_ambiente"]
          codigo_opcao_simples_nacional: number | null
          codigo_tributario_municipio: string | null
          company_id: string
          created_at: string
          created_by: string | null
          discriminacao: string | null
          document_type: Database["public"]["Enums"]["fiscal_document_type"]
          emission_mode: Database["public"]["Enums"]["nfse_emission_mode"]
          emitente_endereco: Json | null
          enabled: boolean
          focus_token_ref: string | null
          id: string
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          iss_retido: boolean
          item_lista_servico: string | null
          metadata: Json
          municipio_ibge: string
          nfse_padrao: Database["public"]["Enums"]["nfse_padrao"]
          optante_simples: boolean | null
          parametros: Json
          regime_tributario: number | null
          regime_tributario_simples_nacional: number | null
          serie: string | null
          updated_at: string
        }
        Insert: {
          aliquota_iss?: number | null
          ambiente?: Database["public"]["Enums"]["nfse_ambiente"]
          codigo_opcao_simples_nacional?: number | null
          codigo_tributario_municipio?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          discriminacao?: string | null
          document_type?: Database["public"]["Enums"]["fiscal_document_type"]
          emission_mode?: Database["public"]["Enums"]["nfse_emission_mode"]
          emitente_endereco?: Json | null
          enabled?: boolean
          focus_token_ref?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          iss_retido?: boolean
          item_lista_servico?: string | null
          metadata?: Json
          municipio_ibge?: string
          nfse_padrao?: Database["public"]["Enums"]["nfse_padrao"]
          optante_simples?: boolean | null
          parametros?: Json
          regime_tributario?: number | null
          regime_tributario_simples_nacional?: number | null
          serie?: string | null
          updated_at?: string
        }
        Update: {
          aliquota_iss?: number | null
          ambiente?: Database["public"]["Enums"]["nfse_ambiente"]
          codigo_opcao_simples_nacional?: number | null
          codigo_tributario_municipio?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          discriminacao?: string | null
          document_type?: Database["public"]["Enums"]["fiscal_document_type"]
          emission_mode?: Database["public"]["Enums"]["nfse_emission_mode"]
          emitente_endereco?: Json | null
          enabled?: boolean
          focus_token_ref?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          iss_retido?: boolean
          item_lista_servico?: string | null
          metadata?: Json
          municipio_ibge?: string
          nfse_padrao?: Database["public"]["Enums"]["nfse_padrao"]
          optante_simples?: boolean | null
          parametros?: Json
          regime_tributario?: number | null
          regime_tributario_simples_nacional?: number | null
          serie?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      focus_events: {
        Row: {
          dedup_key: string
          focus_ref: string | null
          id: string
          payload: Json
          process_error: string | null
          processed_at: string | null
          received_at: string
          status: string | null
        }
        Insert: {
          dedup_key: string
          focus_ref?: string | null
          id?: string
          payload: Json
          process_error?: string | null
          processed_at?: string | null
          received_at?: string
          status?: string | null
        }
        Update: {
          dedup_key?: string
          focus_ref?: string | null
          id?: string
          payload?: Json
          process_error?: string | null
          processed_at?: string | null
          received_at?: string
          status?: string | null
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          column_mapping: Json | null
          committed_count: number
          company_id: string
          created_at: string
          created_by: string | null
          error_log: Json | null
          failed_count: number
          filename: string
          id: string
          notes: string | null
          row_count: number
          source: string
          status: Database["public"]["Enums"]["import_status"]
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          column_mapping?: Json | null
          committed_count?: number
          company_id: string
          created_at?: string
          created_by?: string | null
          error_log?: Json | null
          failed_count?: number
          filename: string
          id?: string
          notes?: string | null
          row_count?: number
          source?: string
          status?: Database["public"]["Enums"]["import_status"]
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          column_mapping?: Json | null
          committed_count?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          error_log?: Json | null
          failed_count?: number
          filename?: string
          id?: string
          notes?: string | null
          row_count?: number
          source?: string
          status?: Database["public"]["Enums"]["import_status"]
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          created_at: string
          id: string
          import_batch_id: string
          is_valid: boolean
          parsed: Json | null
          raw_data: Json
          row_number: number
          transaction_id: string | null
          validation_errors: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          import_batch_id: string
          is_valid?: boolean
          parsed?: Json | null
          raw_data: Json
          row_number: number
          transaction_id?: string | null
          validation_errors?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          import_batch_id?: string
          is_valid?: boolean
          parsed?: Json | null
          raw_data?: Json
          row_number?: number
          transaction_id?: string | null
          validation_errors?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions_signed"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_backfill_runs: {
        Row: {
          attempts: number
          charges_seen: number
          created_at: string
          created_by: string | null
          created_since: string
          created_until: string
          diagnostics: Json
          dry_run: boolean
          id: string
          jobs_created: number
          jobs_skipped: number
          last_error: string | null
          metadata: Json
          organization_id: string
          pagarme_account_id: string
          page_cursor: number
          page_size: number
          preview: Json | null
          status: Database["public"]["Enums"]["invoice_backfill_status"]
          total_charges: number | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          charges_seen?: number
          created_at?: string
          created_by?: string | null
          created_since: string
          created_until: string
          diagnostics?: Json
          dry_run?: boolean
          id?: string
          jobs_created?: number
          jobs_skipped?: number
          last_error?: string | null
          metadata?: Json
          organization_id: string
          pagarme_account_id: string
          page_cursor?: number
          page_size?: number
          preview?: Json | null
          status?: Database["public"]["Enums"]["invoice_backfill_status"]
          total_charges?: number | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          charges_seen?: number
          created_at?: string
          created_by?: string | null
          created_since?: string
          created_until?: string
          diagnostics?: Json
          dry_run?: boolean
          id?: string
          jobs_created?: number
          jobs_skipped?: number
          last_error?: string | null
          metadata?: Json
          organization_id?: string
          pagarme_account_id?: string
          page_cursor?: number
          page_size?: number
          preview?: Json | null
          status?: Database["public"]["Enums"]["invoice_backfill_status"]
          total_charges?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_backfill_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_backfill_runs_pagarme_account_id_fkey"
            columns: ["pagarme_account_id"]
            isOneToOne: false
            referencedRelation: "pagarme_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_jobs: {
        Row: {
          aliquota_iss: number | null
          ambiente: Database["public"]["Enums"]["nfse_ambiente"]
          approved_at: string | null
          approved_by: string | null
          attempts: number
          charge_created_at: string | null
          chave_nfse: string | null
          codigo_tributario_municipio: string | null
          company_id: string
          created_at: string
          danfse_path: string | null
          dedup_scope: string | null
          document_type: Database["public"]["Enums"]["fiscal_document_type"]
          emitida_em: string | null
          erros: Json | null
          focus_ref: string
          focus_status: string | null
          id: string
          item_lista_servico: string | null
          last_attempt_at: string | null
          mensagem_sefaz: string | null
          metadata: Json
          next_attempt_at: string | null
          numero_nfse: string | null
          organization_id: string
          pagarme_account_id: string | null
          pagarme_charge_id: string | null
          pagarme_recipient_id: string | null
          paid_at: string | null
          parametros: Json
          protocolo: string | null
          refund_detected_at: string | null
          refund_released_at: string | null
          refund_released_by: string | null
          refund_state: Database["public"]["Enums"]["invoice_refund_state"]
          sales_event_id: string | null
          serie: string | null
          status: Database["public"]["Enums"]["invoice_job_status"]
          tomador_documento: string | null
          tomador_email: string | null
          tomador_endereco: Json | null
          tomador_nome: string | null
          transaction_id: string | null
          updated_at: string
          valor_servicos: number
          xml_path: string | null
        }
        Insert: {
          aliquota_iss?: number | null
          ambiente?: Database["public"]["Enums"]["nfse_ambiente"]
          approved_at?: string | null
          approved_by?: string | null
          attempts?: number
          charge_created_at?: string | null
          chave_nfse?: string | null
          codigo_tributario_municipio?: string | null
          company_id: string
          created_at?: string
          danfse_path?: string | null
          dedup_scope?: string | null
          document_type?: Database["public"]["Enums"]["fiscal_document_type"]
          emitida_em?: string | null
          erros?: Json | null
          focus_ref?: string
          focus_status?: string | null
          id?: string
          item_lista_servico?: string | null
          last_attempt_at?: string | null
          mensagem_sefaz?: string | null
          metadata?: Json
          next_attempt_at?: string | null
          numero_nfse?: string | null
          organization_id: string
          pagarme_account_id?: string | null
          pagarme_charge_id?: string | null
          pagarme_recipient_id?: string | null
          paid_at?: string | null
          parametros?: Json
          protocolo?: string | null
          refund_detected_at?: string | null
          refund_released_at?: string | null
          refund_released_by?: string | null
          refund_state?: Database["public"]["Enums"]["invoice_refund_state"]
          sales_event_id?: string | null
          serie?: string | null
          status?: Database["public"]["Enums"]["invoice_job_status"]
          tomador_documento?: string | null
          tomador_email?: string | null
          tomador_endereco?: Json | null
          tomador_nome?: string | null
          transaction_id?: string | null
          updated_at?: string
          valor_servicos: number
          xml_path?: string | null
        }
        Update: {
          aliquota_iss?: number | null
          ambiente?: Database["public"]["Enums"]["nfse_ambiente"]
          approved_at?: string | null
          approved_by?: string | null
          attempts?: number
          charge_created_at?: string | null
          chave_nfse?: string | null
          codigo_tributario_municipio?: string | null
          company_id?: string
          created_at?: string
          danfse_path?: string | null
          dedup_scope?: string | null
          document_type?: Database["public"]["Enums"]["fiscal_document_type"]
          emitida_em?: string | null
          erros?: Json | null
          focus_ref?: string
          focus_status?: string | null
          id?: string
          item_lista_servico?: string | null
          last_attempt_at?: string | null
          mensagem_sefaz?: string | null
          metadata?: Json
          next_attempt_at?: string | null
          numero_nfse?: string | null
          organization_id?: string
          pagarme_account_id?: string | null
          pagarme_charge_id?: string | null
          pagarme_recipient_id?: string | null
          paid_at?: string | null
          parametros?: Json
          protocolo?: string | null
          refund_detected_at?: string | null
          refund_released_at?: string | null
          refund_released_by?: string | null
          refund_state?: Database["public"]["Enums"]["invoice_refund_state"]
          sales_event_id?: string | null
          serie?: string | null
          status?: Database["public"]["Enums"]["invoice_job_status"]
          tomador_documento?: string | null
          tomador_email?: string | null
          tomador_endereco?: Json | null
          tomador_nome?: string | null
          transaction_id?: string | null
          updated_at?: string
          valor_servicos?: number
          xml_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_jobs_pagarme_account_id_fkey"
            columns: ["pagarme_account_id"]
            isOneToOne: false
            referencedRelation: "pagarme_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_jobs_sales_event_id_fkey"
            columns: ["sales_event_id"]
            isOneToOne: false
            referencedRelation: "sales_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_jobs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_jobs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_jobs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_jobs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions_signed"
            referencedColumns: ["id"]
          },
        ]
      }
      management_accounts: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["management_account_kind"]
          metadata: Json
          name: string
          nature: Database["public"]["Enums"]["expense_nature"] | null
          organization_id: string
          parent_id: string | null
          requires_detail: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["management_account_kind"]
          metadata?: Json
          name: string
          nature?: Database["public"]["Enums"]["expense_nature"] | null
          organization_id: string
          parent_id?: string | null
          requires_detail?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["management_account_kind"]
          metadata?: Json
          name?: string
          nature?: Database["public"]["Enums"]["expense_nature"] | null
          organization_id?: string
          parent_id?: string | null
          requires_detail?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "management_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "management_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "management_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "management_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["management_account_id"]
          },
          {
            foreignKeyName: "management_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["management_group_id"]
          },
        ]
      }
      mcp_clients: {
        Row: {
          ativo: boolean
          client_id: string
          company_ids: string[] | null
          created_at: string
          created_by: string | null
          modules: Database["public"]["Enums"]["data_module"][] | null
          nome: string
          observacao: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          client_id: string
          company_ids?: string[] | null
          created_at?: string
          created_by?: string | null
          modules?: Database["public"]["Enums"]["data_module"][] | null
          nome: string
          observacao?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          client_id?: string
          company_ids?: string[] | null
          created_at?: string
          created_by?: string | null
          modules?: Database["public"]["Enums"]["data_module"][] | null
          nome?: string
          observacao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mcp_query_log: {
        Row: {
          client_id: string | null
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          params: Json
          row_count: number | null
          tool: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          params?: Json
          row_count?: number | null
          tool: string
          user_id?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          params?: Json
          row_count?: number | null
          tool?: string
          user_id?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          default_currency: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_currency?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_currency?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      pagarme_accounts: {
        Row: {
          active: boolean
          ambiente: Database["public"]["Enums"]["nfse_ambiente"]
          api_secret_ref: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string
          metadata: Json
          organization_id: string
          owner_company_id: string
          slug: string
          updated_at: string
          webhook_secret_ref: string | null
        }
        Insert: {
          active?: boolean
          ambiente?: Database["public"]["Enums"]["nfse_ambiente"]
          api_secret_ref?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          metadata?: Json
          organization_id: string
          owner_company_id: string
          slug?: string
          updated_at?: string
          webhook_secret_ref?: string | null
        }
        Update: {
          active?: boolean
          ambiente?: Database["public"]["Enums"]["nfse_ambiente"]
          api_secret_ref?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          metadata?: Json
          organization_id?: string
          owner_company_id?: string
          slug?: string
          updated_at?: string
          webhook_secret_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagarme_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_accounts_owner_company_id_fkey"
            columns: ["owner_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pagarme_charges: {
        Row: {
          acquirer_name: string | null
          amount: number
          card_brand: string | null
          card_last_four: string | null
          charge_created_at: string | null
          created_at: string
          currency: string
          id: string
          installments: number | null
          last_synced_at: string | null
          metadata: Json
          organization_id: string
          pagarme_account_id: string
          pagarme_charge_id: string
          pagarme_customer_id: string | null
          pagarme_invoice_id: string | null
          pagarme_order_id: string | null
          pagarme_plan_id: string | null
          pagarme_subscription_id: string | null
          paid_amount: number | null
          paid_at: string | null
          payment_method: string | null
          recurrence_cycle: string | null
          refunded_amount: number
          sales_event_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          acquirer_name?: string | null
          amount: number
          card_brand?: string | null
          card_last_four?: string | null
          charge_created_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          installments?: number | null
          last_synced_at?: string | null
          metadata?: Json
          organization_id: string
          pagarme_account_id: string
          pagarme_charge_id: string
          pagarme_customer_id?: string | null
          pagarme_invoice_id?: string | null
          pagarme_order_id?: string | null
          pagarme_plan_id?: string | null
          pagarme_subscription_id?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          payment_method?: string | null
          recurrence_cycle?: string | null
          refunded_amount?: number
          sales_event_id?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          acquirer_name?: string | null
          amount?: number
          card_brand?: string | null
          card_last_four?: string | null
          charge_created_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          installments?: number | null
          last_synced_at?: string | null
          metadata?: Json
          organization_id?: string
          pagarme_account_id?: string
          pagarme_charge_id?: string
          pagarme_customer_id?: string | null
          pagarme_invoice_id?: string | null
          pagarme_order_id?: string | null
          pagarme_plan_id?: string | null
          pagarme_subscription_id?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          payment_method?: string | null
          recurrence_cycle?: string | null
          refunded_amount?: number
          sales_event_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagarme_charges_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_charges_pagarme_account_id_fkey"
            columns: ["pagarme_account_id"]
            isOneToOne: false
            referencedRelation: "pagarme_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_charges_sales_event_id_fkey"
            columns: ["sales_event_id"]
            isOneToOne: false
            referencedRelation: "sales_events"
            referencedColumns: ["id"]
          },
        ]
      }
      pagarme_customers: {
        Row: {
          created_at: string
          document: string | null
          document_type: string | null
          email: string | null
          first_purchase_at: string | null
          id: string
          last_synced_at: string | null
          metadata: Json
          name: string | null
          organization_id: string
          pagarme_account_id: string
          pagarme_customer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document?: string | null
          document_type?: string | null
          email?: string | null
          first_purchase_at?: string | null
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          name?: string | null
          organization_id: string
          pagarme_account_id: string
          pagarme_customer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document?: string | null
          document_type?: string | null
          email?: string | null
          first_purchase_at?: string | null
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          name?: string | null
          organization_id?: string
          pagarme_account_id?: string
          pagarme_customer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagarme_customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_customers_pagarme_account_id_fkey"
            columns: ["pagarme_account_id"]
            isOneToOne: false
            referencedRelation: "pagarme_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      pagarme_ledger_settings: {
        Row: {
          anticipation_account_id: string | null
          company_id: string
          created_at: string
          cutover_date: string
          enabled: boolean
          fee_account_id: string | null
          gateway_bank_account_id: string | null
          id: string
          metadata: Json
          organization_id: string
          pagarme_account_id: string
          payout_bank_account_id: string | null
          refund_account_id: string | null
          revenue_account_id: string | null
          updated_at: string
        }
        Insert: {
          anticipation_account_id?: string | null
          company_id: string
          created_at?: string
          cutover_date?: string
          enabled?: boolean
          fee_account_id?: string | null
          gateway_bank_account_id?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          pagarme_account_id: string
          payout_bank_account_id?: string | null
          refund_account_id?: string | null
          revenue_account_id?: string | null
          updated_at?: string
        }
        Update: {
          anticipation_account_id?: string | null
          company_id?: string
          created_at?: string
          cutover_date?: string
          enabled?: boolean
          fee_account_id?: string | null
          gateway_bank_account_id?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          pagarme_account_id?: string
          payout_bank_account_id?: string | null
          refund_account_id?: string | null
          revenue_account_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagarme_ledger_settings_anticipation_account_id_fkey"
            columns: ["anticipation_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_ledger_settings_anticipation_account_id_fkey"
            columns: ["anticipation_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "pagarme_ledger_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_ledger_settings_fee_account_id_fkey"
            columns: ["fee_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_ledger_settings_fee_account_id_fkey"
            columns: ["fee_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "pagarme_ledger_settings_gateway_bank_account_id_fkey"
            columns: ["gateway_bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_ledger_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_ledger_settings_pagarme_account_id_fkey"
            columns: ["pagarme_account_id"]
            isOneToOne: false
            referencedRelation: "pagarme_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_ledger_settings_payout_bank_account_id_fkey"
            columns: ["payout_bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_ledger_settings_refund_account_id_fkey"
            columns: ["refund_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_ledger_settings_refund_account_id_fkey"
            columns: ["refund_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "pagarme_ledger_settings_revenue_account_id_fkey"
            columns: ["revenue_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_ledger_settings_revenue_account_id_fkey"
            columns: ["revenue_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["account_id"]
          },
        ]
      }
      pagarme_payouts: {
        Row: {
          amount: number
          bank_account_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          external_ref: string
          funded_on: string
          id: string
          metadata: Json
          organization_id: string
          pagarme_account_id: string
          pagarme_recipient_id: string | null
          statement_line_id: string | null
          status: string
          transfer_group_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          external_ref: string
          funded_on: string
          id?: string
          metadata?: Json
          organization_id: string
          pagarme_account_id: string
          pagarme_recipient_id?: string | null
          statement_line_id?: string | null
          status?: string
          transfer_group_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          external_ref?: string
          funded_on?: string
          id?: string
          metadata?: Json
          organization_id?: string
          pagarme_account_id?: string
          pagarme_recipient_id?: string | null
          statement_line_id?: string | null
          status?: string
          transfer_group_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagarme_payouts_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_payouts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_payouts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_payouts_pagarme_account_id_fkey"
            columns: ["pagarme_account_id"]
            isOneToOne: false
            referencedRelation: "pagarme_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_payouts_statement_line_id_fkey"
            columns: ["statement_line_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      pagarme_receivables: {
        Row: {
          amount: number
          anticipation_fee: number
          company_id: string
          created_at: string
          expected_payment_date: string | null
          fee: number
          first_seen_payment_date: string | null
          fraud_coverage_fee: number
          gateway_id: string | null
          id: string
          installment: number | null
          last_synced_at: string | null
          liquidation_arrangement_id: string | null
          metadata: Json
          net_amount: number | null
          organization_id: string
          pagarme_account_id: string
          pagarme_charge_id: string | null
          pagarme_payable_id: string
          pagarme_recipient_id: string | null
          payment_method: string | null
          sale_accrual_at: string | null
          settled_on: string | null
          split_id: string | null
          status: string
          transaction_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          anticipation_fee?: number
          company_id: string
          created_at?: string
          expected_payment_date?: string | null
          fee?: number
          first_seen_payment_date?: string | null
          fraud_coverage_fee?: number
          gateway_id?: string | null
          id?: string
          installment?: number | null
          last_synced_at?: string | null
          liquidation_arrangement_id?: string | null
          metadata?: Json
          net_amount?: number | null
          organization_id: string
          pagarme_account_id: string
          pagarme_charge_id?: string | null
          pagarme_payable_id: string
          pagarme_recipient_id?: string | null
          payment_method?: string | null
          sale_accrual_at?: string | null
          settled_on?: string | null
          split_id?: string | null
          status: string
          transaction_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          anticipation_fee?: number
          company_id?: string
          created_at?: string
          expected_payment_date?: string | null
          fee?: number
          first_seen_payment_date?: string | null
          fraud_coverage_fee?: number
          gateway_id?: string | null
          id?: string
          installment?: number | null
          last_synced_at?: string | null
          liquidation_arrangement_id?: string | null
          metadata?: Json
          net_amount?: number | null
          organization_id?: string
          pagarme_account_id?: string
          pagarme_charge_id?: string | null
          pagarme_payable_id?: string
          pagarme_recipient_id?: string | null
          payment_method?: string | null
          sale_accrual_at?: string | null
          settled_on?: string | null
          split_id?: string | null
          status?: string
          transaction_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagarme_receivables_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_receivables_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_receivables_pagarme_account_id_fkey"
            columns: ["pagarme_account_id"]
            isOneToOne: false
            referencedRelation: "pagarme_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_receivables_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_receivables_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_receivables_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_receivables_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions_signed"
            referencedColumns: ["id"]
          },
        ]
      }
      pagarme_recipient_map: {
        Row: {
          active: boolean
          ambiente: Database["public"]["Enums"]["nfse_ambiente"]
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          pagarme_account_id: string
          pagarme_recipient_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          ambiente?: Database["public"]["Enums"]["nfse_ambiente"]
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          pagarme_account_id: string
          pagarme_recipient_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          ambiente?: Database["public"]["Enums"]["nfse_ambiente"]
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          pagarme_account_id?: string
          pagarme_recipient_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagarme_recipient_map_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_recipient_map_pagarme_account_id_fkey"
            columns: ["pagarme_account_id"]
            isOneToOne: false
            referencedRelation: "pagarme_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      pagarme_subscriptions: {
        Row: {
          billing_type: string | null
          canceled_at: string | null
          created_at: string
          current_cycle_end: string | null
          current_cycle_start: string | null
          id: string
          interval: string | null
          interval_count: number | null
          last_synced_at: string | null
          metadata: Json
          mrr: number | null
          next_billing_at: string | null
          organization_id: string
          pagarme_account_id: string
          pagarme_customer_id: string | null
          pagarme_plan_id: string | null
          pagarme_subscription_id: string
          payment_method: string | null
          plan_name: string | null
          start_at: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          billing_type?: string | null
          canceled_at?: string | null
          created_at?: string
          current_cycle_end?: string | null
          current_cycle_start?: string | null
          id?: string
          interval?: string | null
          interval_count?: number | null
          last_synced_at?: string | null
          metadata?: Json
          mrr?: number | null
          next_billing_at?: string | null
          organization_id: string
          pagarme_account_id: string
          pagarme_customer_id?: string | null
          pagarme_plan_id?: string | null
          pagarme_subscription_id: string
          payment_method?: string | null
          plan_name?: string | null
          start_at?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          billing_type?: string | null
          canceled_at?: string | null
          created_at?: string
          current_cycle_end?: string | null
          current_cycle_start?: string | null
          id?: string
          interval?: string | null
          interval_count?: number | null
          last_synced_at?: string | null
          metadata?: Json
          mrr?: number | null
          next_billing_at?: string | null
          organization_id?: string
          pagarme_account_id?: string
          pagarme_customer_id?: string | null
          pagarme_plan_id?: string | null
          pagarme_subscription_id?: string
          payment_method?: string | null
          plan_name?: string | null
          start_at?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagarme_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_subscriptions_pagarme_account_id_fkey"
            columns: ["pagarme_account_id"]
            isOneToOne: false
            referencedRelation: "pagarme_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      pagarme_sync_runs: {
        Row: {
          attempts: number
          created_at: string
          created_by: string | null
          dry_run: boolean
          id: string
          items_seen: number
          items_skipped: number
          items_written: number
          last_error: string | null
          metadata: Json
          organization_id: string
          pagarme_account_id: string
          page_cursor: number
          page_size: number
          preview: Json | null
          resource: Database["public"]["Enums"]["pagarme_sync_resource"]
          status: Database["public"]["Enums"]["invoice_backfill_status"]
          updated_at: string
          window_end: string
          window_start: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          dry_run?: boolean
          id?: string
          items_seen?: number
          items_skipped?: number
          items_written?: number
          last_error?: string | null
          metadata?: Json
          organization_id: string
          pagarme_account_id: string
          page_cursor?: number
          page_size?: number
          preview?: Json | null
          resource: Database["public"]["Enums"]["pagarme_sync_resource"]
          status?: Database["public"]["Enums"]["invoice_backfill_status"]
          updated_at?: string
          window_end: string
          window_start: string
        }
        Update: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          dry_run?: boolean
          id?: string
          items_seen?: number
          items_skipped?: number
          items_written?: number
          last_error?: string | null
          metadata?: Json
          organization_id?: string
          pagarme_account_id?: string
          page_cursor?: number
          page_size?: number
          preview?: Json | null
          resource?: Database["public"]["Enums"]["pagarme_sync_resource"]
          status?: Database["public"]["Enums"]["invoice_backfill_status"]
          updated_at?: string
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagarme_sync_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagarme_sync_runs_pagarme_account_id_fkey"
            columns: ["pagarme_account_id"]
            isOneToOne: false
            referencedRelation: "pagarme_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_cards: {
        Row: {
          company_id: string
          created_at: string
          holder_name: string
          id: string
          is_active: boolean
          issuer: string
          kind: string
          last4: string
          metadata: Json
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          holder_name: string
          id?: string
          is_active?: boolean
          issuer: string
          kind: string
          last4: string
          metadata?: Json
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          holder_name?: string
          id?: string
          is_active?: boolean
          issuer?: string
          kind?: string
          last4?: string
          metadata?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_cards_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_account_mappings: {
        Row: {
          account_id: string
          company_id: string
          component: Database["public"]["Enums"]["payroll_component"]
          cost_center_id: string | null
          created_at: string
          employee_kind: Database["public"]["Enums"]["employee_kind"]
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          company_id: string
          component: Database["public"]["Enums"]["payroll_component"]
          cost_center_id?: string | null
          created_at?: string
          employee_kind: Database["public"]["Enums"]["employee_kind"]
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          company_id?: string
          component?: Database["public"]["Enums"]["payroll_component"]
          cost_center_id?: string | null
          created_at?: string
          employee_kind?: Database["public"]["Enums"]["employee_kind"]
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_account_mappings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_account_mappings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "payroll_account_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_account_mappings_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_items: {
        Row: {
          benefits: number
          bonus_amount: number
          created_at: string
          employee_id: string
          employer_cost: number | null
          fgts: number
          fixed_amount: number
          gross_amount: number
          id: string
          inss: number
          irrf: number
          net_amount: number | null
          notes: string | null
          other_deductions: number
          payment_type: Database["public"]["Enums"]["payroll_payment_type"]
          payroll_run_id: string
          profit_sharing_amount: number
          updated_at: string
          variable_amount: number
        }
        Insert: {
          benefits?: number
          bonus_amount?: number
          created_at?: string
          employee_id: string
          employer_cost?: number | null
          fgts?: number
          fixed_amount?: number
          gross_amount: number
          id?: string
          inss?: number
          irrf?: number
          net_amount?: number | null
          notes?: string | null
          other_deductions?: number
          payment_type: Database["public"]["Enums"]["payroll_payment_type"]
          payroll_run_id: string
          profit_sharing_amount?: number
          updated_at?: string
          variable_amount?: number
        }
        Update: {
          benefits?: number
          bonus_amount?: number
          created_at?: string
          employee_id?: string
          employer_cost?: number | null
          fgts?: number
          fixed_amount?: number
          gross_amount?: number
          id?: string
          inss?: number
          irrf?: number
          net_amount?: number | null
          notes?: string | null
          other_deductions?: number
          payment_type?: Database["public"]["Enums"]["payroll_payment_type"]
          payroll_run_id?: string
          profit_sharing_amount?: number
          updated_at?: string
          variable_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          posted_at: string | null
          posted_default_account_id: string | null
          reference_month: string
          status: string
          total_benefits: number
          total_charges: number
          total_fixed: number
          total_variable: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          posted_at?: string | null
          posted_default_account_id?: string | null
          reference_month: string
          status?: string
          total_benefits?: number
          total_charges?: number
          total_fixed?: number
          total_variable?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          posted_at?: string | null
          posted_default_account_id?: string | null
          reference_month?: string
          status?: string
          total_benefits?: number
          total_charges?: number
          total_fixed?: number
          total_variable?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_posted_default_account_id_fkey"
            columns: ["posted_default_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_posted_default_account_id_fkey"
            columns: ["posted_default_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["account_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          visible_modules: Database["public"]["Enums"]["data_module"][] | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          visible_modules?: Database["public"]["Enums"]["data_module"][] | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          visible_modules?: Database["public"]["Enums"]["data_module"][] | null
        }
        Relationships: []
      }
      recurring_templates: {
        Row: {
          account_id: string
          amount: number
          auto_generate: boolean
          bank_account_id: string | null
          company_id: string
          cost_center_id: string | null
          counterparty_id: string | null
          created_at: string
          created_by: string | null
          day_of_month: number | null
          day_of_week: number | null
          description: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          document_ref: string | null
          end_date: string | null
          frequency: Database["public"]["Enums"]["recurrence_frequency"]
          id: string
          interval_count: number
          is_active: boolean
          last_generated_date: string | null
          max_occurrences: number | null
          metadata: Json
          next_run_date: string
          notes: string | null
          start_date: string
          total_generated: number
          updated_at: string
        }
        Insert: {
          account_id: string
          amount: number
          auto_generate?: boolean
          bank_account_id?: string | null
          company_id: string
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          description: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          document_ref?: string | null
          end_date?: string | null
          frequency: Database["public"]["Enums"]["recurrence_frequency"]
          id?: string
          interval_count?: number
          is_active?: boolean
          last_generated_date?: string | null
          max_occurrences?: number | null
          metadata?: Json
          next_run_date: string
          notes?: string | null
          start_date: string
          total_generated?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          auto_generate?: boolean
          bank_account_id?: string | null
          company_id?: string
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          description?: string
          direction?: Database["public"]["Enums"]["transaction_direction"]
          document_ref?: string | null
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["recurrence_frequency"]
          id?: string
          interval_count?: number
          is_active?: boolean
          last_generated_date?: string | null
          max_occurrences?: number | null
          metadata?: Json
          next_run_date?: string
          notes?: string | null
          start_date?: string
          total_generated?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_templates_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_templates_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "recurring_templates_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_templates_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_templates_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          company_id: string | null
          config: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          metadata: Json
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_templates_company_org_fk"
            columns: ["company_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "report_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_events: {
        Row: {
          event_id: string
          event_type: string
          id: string
          pagarme_account_id: string | null
          payload: Json
          process_error: string | null
          processed_at: string | null
          provider: string
          received_at: string
          resource_id: string | null
        }
        Insert: {
          event_id: string
          event_type: string
          id?: string
          pagarme_account_id?: string | null
          payload: Json
          process_error?: string | null
          processed_at?: string | null
          provider?: string
          received_at?: string
          resource_id?: string | null
        }
        Update: {
          event_id?: string
          event_type?: string
          id?: string
          pagarme_account_id?: string | null
          payload?: Json
          process_error?: string | null
          processed_at?: string | null
          provider?: string
          received_at?: string
          resource_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_events_pagarme_account_id_fkey"
            columns: ["pagarme_account_id"]
            isOneToOne: false
            referencedRelation: "pagarme_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      service_catalog: {
        Row: {
          active: boolean
          aliquota_iss: number | null
          cest: string | null
          cfop_interestadual: string | null
          cfop_interno: string | null
          cnae: string | null
          codigo_beneficio_fiscal: string | null
          codigo_produto: string | null
          codigo_tributario_municipio: string | null
          cofins_aliquota: number | null
          cofins_cst: string | null
          company_id: string
          created_at: string
          created_by: string | null
          cst_icms: string | null
          descricao: string
          discriminacao: string | null
          document_type: Database["public"]["Enums"]["fiscal_document_type"]
          id: string
          item_lista_servico: string
          metadata: Json
          ncm: string | null
          origem: number | null
          pagarme_item_code: string | null
          pagarme_plan_id: string | null
          parametros: Json
          pis_aliquota: number | null
          pis_cst: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          aliquota_iss?: number | null
          cest?: string | null
          cfop_interestadual?: string | null
          cfop_interno?: string | null
          cnae?: string | null
          codigo_beneficio_fiscal?: string | null
          codigo_produto?: string | null
          codigo_tributario_municipio?: string | null
          cofins_aliquota?: number | null
          cofins_cst?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          cst_icms?: string | null
          descricao: string
          discriminacao?: string | null
          document_type?: Database["public"]["Enums"]["fiscal_document_type"]
          id?: string
          item_lista_servico: string
          metadata?: Json
          ncm?: string | null
          origem?: number | null
          pagarme_item_code?: string | null
          pagarme_plan_id?: string | null
          parametros?: Json
          pis_aliquota?: number | null
          pis_cst?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          aliquota_iss?: number | null
          cest?: string | null
          cfop_interestadual?: string | null
          cfop_interno?: string | null
          cnae?: string | null
          codigo_beneficio_fiscal?: string | null
          codigo_produto?: string | null
          codigo_tributario_municipio?: string | null
          cofins_aliquota?: number | null
          cofins_cst?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          cst_icms?: string | null
          descricao?: string
          discriminacao?: string | null
          document_type?: Database["public"]["Enums"]["fiscal_document_type"]
          id?: string
          item_lista_servico?: string
          metadata?: Json
          ncm?: string | null
          origem?: number | null
          pagarme_item_code?: string | null
          pagarme_plan_id?: string | null
          parametros?: Json
          pis_aliquota?: number | null
          pis_cst?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_catalog_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_assessment_lines: {
        Row: {
          account_id: string | null
          amount: number
          assessment_id: string
          base_amount: number
          created_at: string
          description: string
          document_ref: string | null
          id: string
          is_manual: boolean
          line_kind: Database["public"]["Enums"]["tax_assessment_line_kind"]
          metadata: Json
          payee: string | null
          presumption_class:
            | Database["public"]["Enums"]["tax_presumption_class"]
            | null
          presumption_rate: number | null
          reference_date: string | null
          sort_order: number
          transaction_id: string | null
        }
        Insert: {
          account_id?: string | null
          amount: number
          assessment_id: string
          base_amount?: number
          created_at?: string
          description: string
          document_ref?: string | null
          id?: string
          is_manual?: boolean
          line_kind: Database["public"]["Enums"]["tax_assessment_line_kind"]
          metadata?: Json
          payee?: string | null
          presumption_class?:
            | Database["public"]["Enums"]["tax_presumption_class"]
            | null
          presumption_rate?: number | null
          reference_date?: string | null
          sort_order?: number
          transaction_id?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          assessment_id?: string
          base_amount?: number
          created_at?: string
          description?: string
          document_ref?: string | null
          id?: string
          is_manual?: boolean
          line_kind?: Database["public"]["Enums"]["tax_assessment_line_kind"]
          metadata?: Json
          payee?: string | null
          presumption_class?:
            | Database["public"]["Enums"]["tax_presumption_class"]
            | null
          presumption_rate?: number | null
          reference_date?: string | null
          sort_order?: number
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_assessment_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_assessment_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "tax_assessment_lines_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "tax_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_assessment_lines_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_assessment_lines_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_assessment_lines_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_assessment_lines_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions_signed"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_assessments: {
        Row: {
          additions: number
          amount_due: number
          company_id: string
          computed_at: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          deductions: number
          due_date: string
          gross_revenue: number
          id: string
          kind: Database["public"]["Enums"]["tax_obligation_kind"]
          metadata: Json
          notes: string | null
          period_end: string
          period_kind: Database["public"]["Enums"]["tax_period_kind"]
          period_start: string
          rate: number
          retentions: number
          rule_id: string | null
          status: Database["public"]["Enums"]["tax_assessment_status"]
          surtax_amount: number
          surtax_base: number
          tax_amount: number
          taxable_base: number
          updated_at: string
        }
        Insert: {
          additions?: number
          amount_due?: number
          company_id: string
          computed_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          deductions?: number
          due_date: string
          gross_revenue?: number
          id?: string
          kind: Database["public"]["Enums"]["tax_obligation_kind"]
          metadata?: Json
          notes?: string | null
          period_end: string
          period_kind: Database["public"]["Enums"]["tax_period_kind"]
          period_start: string
          rate?: number
          retentions?: number
          rule_id?: string | null
          status?: Database["public"]["Enums"]["tax_assessment_status"]
          surtax_amount?: number
          surtax_base?: number
          tax_amount?: number
          taxable_base?: number
          updated_at?: string
        }
        Update: {
          additions?: number
          amount_due?: number
          company_id?: string
          computed_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          deductions?: number
          due_date?: string
          gross_revenue?: number
          id?: string
          kind?: Database["public"]["Enums"]["tax_obligation_kind"]
          metadata?: Json
          notes?: string | null
          period_end?: string
          period_kind?: Database["public"]["Enums"]["tax_period_kind"]
          period_start?: string
          rate?: number
          retentions?: number
          rule_id?: string | null
          status?: Database["public"]["Enums"]["tax_assessment_status"]
          surtax_amount?: number
          surtax_base?: number
          tax_amount?: number
          taxable_base?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_assessments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_assessments_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "tax_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_holidays: {
        Row: {
          created_at: string
          holiday_date: string
          id: string
          municipio_ibge: string | null
          name: string
          scope: string
          uf: string | null
        }
        Insert: {
          created_at?: string
          holiday_date: string
          id?: string
          municipio_ibge?: string | null
          name: string
          scope: string
          uf?: string | null
        }
        Update: {
          created_at?: string
          holiday_date?: string
          id?: string
          municipio_ibge?: string | null
          name?: string
          scope?: string
          uf?: string | null
        }
        Relationships: []
      }
      tax_obligations: {
        Row: {
          amount_estimated: number
          amount_paid: number
          assessment_id: string | null
          base_amount: number | null
          company_id: string
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          kind: Database["public"]["Enums"]["tax_obligation_kind"]
          metadata: Json
          notes: string | null
          paid_at: string | null
          rate_pct: number | null
          reference_period: string
          status: Database["public"]["Enums"]["tax_obligation_status"]
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount_estimated?: number
          amount_paid?: number
          assessment_id?: string | null
          base_amount?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          due_date: string
          id?: string
          kind: Database["public"]["Enums"]["tax_obligation_kind"]
          metadata?: Json
          notes?: string | null
          paid_at?: string | null
          rate_pct?: number | null
          reference_period: string
          status?: Database["public"]["Enums"]["tax_obligation_status"]
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_estimated?: number
          amount_paid?: number
          assessment_id?: string | null
          base_amount?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          kind?: Database["public"]["Enums"]["tax_obligation_kind"]
          metadata?: Json
          notes?: string | null
          paid_at?: string | null
          rate_pct?: number | null
          reference_period?: string
          status?: Database["public"]["Enums"]["tax_obligation_status"]
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_obligations_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "tax_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_obligations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_obligations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_obligations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_obligations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_obligations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_transactions_signed"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rule_presumptions: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          presumption_class: Database["public"]["Enums"]["tax_presumption_class"]
          rate: number
          rule_id: string
          threshold_from: number
          threshold_to: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          presumption_class: Database["public"]["Enums"]["tax_presumption_class"]
          rate: number
          rule_id: string
          threshold_from?: number
          threshold_to?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          presumption_class?: Database["public"]["Enums"]["tax_presumption_class"]
          rate?: number
          rule_id?: string
          threshold_from?: number
          threshold_to?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_rule_presumptions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "tax_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rules: {
        Row: {
          account_id: string | null
          active: boolean
          base_account_ids: string[] | null
          base_allowance: number | null
          base_allowance_mode: Database["public"]["Enums"]["tax_allowance_mode"]
          base_allowance_per_payee: boolean
          base_date_basis: Database["public"]["Enums"]["tax_base_date_basis"]
          base_date_basis_confirmed: boolean
          base_source: Database["public"]["Enums"]["tax_base_source"]
          company_id: string
          created_at: string
          created_by: string | null
          deducts_retentions: boolean
          default_presumption_class:
            | Database["public"]["Enums"]["tax_presumption_class"]
            | null
          due_date_adjust: Database["public"]["Enums"]["tax_due_date_adjust"]
          due_day: number
          due_month_offset: number
          id: string
          kind: Database["public"]["Enums"]["tax_obligation_kind"]
          metadata: Json
          notes: string | null
          payee: string | null
          period_kind: Database["public"]["Enums"]["tax_period_kind"]
          rate: number
          surtax_monthly_allowance: number | null
          surtax_rate: number | null
          updated_at: string
          uses_presumption: boolean
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          account_id?: string | null
          active?: boolean
          base_account_ids?: string[] | null
          base_allowance?: number | null
          base_allowance_mode?: Database["public"]["Enums"]["tax_allowance_mode"]
          base_allowance_per_payee?: boolean
          base_date_basis?: Database["public"]["Enums"]["tax_base_date_basis"]
          base_date_basis_confirmed?: boolean
          base_source?: Database["public"]["Enums"]["tax_base_source"]
          company_id: string
          created_at?: string
          created_by?: string | null
          deducts_retentions?: boolean
          default_presumption_class?:
            | Database["public"]["Enums"]["tax_presumption_class"]
            | null
          due_date_adjust?: Database["public"]["Enums"]["tax_due_date_adjust"]
          due_day: number
          due_month_offset?: number
          id?: string
          kind: Database["public"]["Enums"]["tax_obligation_kind"]
          metadata?: Json
          notes?: string | null
          payee?: string | null
          period_kind?: Database["public"]["Enums"]["tax_period_kind"]
          rate: number
          surtax_monthly_allowance?: number | null
          surtax_rate?: number | null
          updated_at?: string
          uses_presumption?: boolean
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          account_id?: string | null
          active?: boolean
          base_account_ids?: string[] | null
          base_allowance?: number | null
          base_allowance_mode?: Database["public"]["Enums"]["tax_allowance_mode"]
          base_allowance_per_payee?: boolean
          base_date_basis?: Database["public"]["Enums"]["tax_base_date_basis"]
          base_date_basis_confirmed?: boolean
          base_source?: Database["public"]["Enums"]["tax_base_source"]
          company_id?: string
          created_at?: string
          created_by?: string | null
          deducts_retentions?: boolean
          default_presumption_class?:
            | Database["public"]["Enums"]["tax_presumption_class"]
            | null
          due_date_adjust?: Database["public"]["Enums"]["tax_due_date_adjust"]
          due_day?: number
          due_month_offset?: number
          id?: string
          kind?: Database["public"]["Enums"]["tax_obligation_kind"]
          metadata?: Json
          notes?: string | null
          payee?: string | null
          period_kind?: Database["public"]["Enums"]["tax_period_kind"]
          rate?: number
          surtax_monthly_allowance?: number | null
          surtax_rate?: number | null
          updated_at?: string
          uses_presumption?: boolean
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "tax_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          accrual_date: string
          amount: number
          bank_account_id: string | null
          cash_date: string | null
          company_id: string
          cost_center_id: string | null
          counterparty_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          discount_amount: number
          document_ref: string | null
          due_date: string | null
          fine_amount: number
          id: string
          import_batch_id: string | null
          installment_n: number | null
          installment_total: number | null
          interest_amount: number
          metadata: Json
          nature_override: Database["public"]["Enums"]["expense_nature"] | null
          notes: string | null
          pagarme_projection_key: string | null
          paid_amount: number
          parent_id: string | null
          payroll_item_id: string | null
          recurring_manually_edited: boolean
          recurring_template_id: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          tags: string[]
          transfer_group_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          accrual_date: string
          amount: number
          bank_account_id?: string | null
          cash_date?: string | null
          company_id: string
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          discount_amount?: number
          document_ref?: string | null
          due_date?: string | null
          fine_amount?: number
          id?: string
          import_batch_id?: string | null
          installment_n?: number | null
          installment_total?: number | null
          interest_amount?: number
          metadata?: Json
          nature_override?: Database["public"]["Enums"]["expense_nature"] | null
          notes?: string | null
          pagarme_projection_key?: string | null
          paid_amount?: number
          parent_id?: string | null
          payroll_item_id?: string | null
          recurring_manually_edited?: boolean
          recurring_template_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          tags?: string[]
          transfer_group_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          accrual_date?: string
          amount?: number
          bank_account_id?: string | null
          cash_date?: string | null
          company_id?: string
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          direction?: Database["public"]["Enums"]["transaction_direction"]
          discount_amount?: number
          document_ref?: string | null
          due_date?: string | null
          fine_amount?: number
          id?: string
          import_batch_id?: string | null
          installment_n?: number | null
          installment_total?: number | null
          interest_amount?: number
          metadata?: Json
          nature_override?: Database["public"]["Enums"]["expense_nature"] | null
          notes?: string | null
          pagarme_projection_key?: string | null
          paid_amount?: number
          parent_id?: string | null
          payroll_item_id?: string | null
          recurring_manually_edited?: boolean
          recurring_template_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          tags?: string[]
          transfer_group_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_tx_import"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tx_payroll"
            columns: ["payroll_item_id"]
            isOneToOne: false
            referencedRelation: "payroll_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tx_recurring"
            columns: ["recurring_template_id"]
            isOneToOne: false
            referencedRelation: "recurring_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_transactions_signed"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_account_management_map: {
        Row: {
          account_code: string | null
          account_id: string | null
          account_kind: Database["public"]["Enums"]["account_kind"] | null
          account_name: string | null
          company_id: string | null
          management_account_id: string | null
          management_code: string | null
          management_group_code: string | null
          management_group_id: string | null
          management_group_name: string | null
          management_kind:
            | Database["public"]["Enums"]["management_account_kind"]
            | null
          management_name: string | null
          mapping_source: string | null
          nature: Database["public"]["Enums"]["expense_nature"] | null
          requires_detail: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      v_bills: {
        Row: {
          account_id: string | null
          accrual_date: string | null
          amount: number | null
          bank_account_id: string | null
          cash_date: string | null
          company_id: string | null
          cost_center_id: string | null
          counterparty_id: string | null
          created_at: string | null
          days_overdue: number | null
          description: string | null
          direction: Database["public"]["Enums"]["transaction_direction"] | null
          discount_amount: number | null
          document_ref: string | null
          due_date: string | null
          effective_status: string | null
          fine_amount: number | null
          id: string | null
          installment_n: number | null
          installment_total: number | null
          interest_amount: number | null
          notes: string | null
          open_amount: number | null
          pagarme_projection_key: string | null
          paid_amount: number | null
          parent_id: string | null
          status: Database["public"]["Enums"]["transaction_status"] | null
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          accrual_date?: string | null
          amount?: number | null
          bank_account_id?: string | null
          cash_date?: string | null
          company_id?: string | null
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string | null
          days_overdue?: never
          description?: string | null
          direction?:
            | Database["public"]["Enums"]["transaction_direction"]
            | null
          discount_amount?: number | null
          document_ref?: string | null
          due_date?: string | null
          effective_status?: never
          fine_amount?: number | null
          id?: string | null
          installment_n?: number | null
          installment_total?: number | null
          interest_amount?: number | null
          notes?: string | null
          open_amount?: never
          pagarme_projection_key?: string | null
          paid_amount?: number | null
          parent_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          accrual_date?: string | null
          amount?: number | null
          bank_account_id?: string | null
          cash_date?: string | null
          company_id?: string | null
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string | null
          days_overdue?: never
          description?: string | null
          direction?:
            | Database["public"]["Enums"]["transaction_direction"]
            | null
          discount_amount?: number | null
          document_ref?: string | null
          due_date?: string | null
          effective_status?: never
          fine_amount?: number | null
          id?: string | null
          installment_n?: number | null
          installment_total?: number | null
          interest_amount?: number | null
          notes?: string | null
          open_amount?: never
          pagarme_projection_key?: string | null
          paid_amount?: number | null
          parent_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_transactions_signed"
            referencedColumns: ["id"]
          },
        ]
      }
      v_bills_aging: {
        Row: {
          bucket: string | null
          company_id: string | null
          count: number | null
          direction: Database["public"]["Enums"]["transaction_direction"] | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      v_management_lines: {
        Row: {
          account_id: string | null
          accrual_date: string | null
          amount: number | null
          cash_date: string | null
          company_id: string | null
          cost_center_id: string | null
          counterparty_id: string | null
          description: string | null
          direction: Database["public"]["Enums"]["transaction_direction"] | null
          document_ref: string | null
          management_account_id: string | null
          management_group_id: string | null
          management_kind:
            | Database["public"]["Enums"]["management_account_kind"]
            | null
          nature: Database["public"]["Enums"]["expense_nature"] | null
          source: string | null
          source_id: string | null
          status: Database["public"]["Enums"]["transaction_status"] | null
          transaction_id: string | null
        }
        Relationships: []
      }
      v_pagarme_ledger_health: {
        Row: {
          amount: number | null
          company_id: string | null
          detail: string | null
          issue: string | null
          occurrences: number | null
        }
        Relationships: []
      }
      v_transactions: {
        Row: {
          account_id: string | null
          accrual_date: string | null
          amount: number | null
          bank_account_id: string | null
          cash_date: string | null
          company_id: string | null
          cost_center_id: string | null
          counterparty_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          direction: Database["public"]["Enums"]["transaction_direction"] | null
          discount_amount: number | null
          document_ref: string | null
          due_date: string | null
          fine_amount: number | null
          id: string | null
          import_batch_id: string | null
          installment_n: number | null
          installment_total: number | null
          interest_amount: number | null
          metadata: Json | null
          notes: string | null
          paid_amount: number | null
          parent_id: string | null
          payroll_item_id: string | null
          recurring_template_id: string | null
          status: Database["public"]["Enums"]["transaction_status"] | null
          tags: string[] | null
          transfer_group_id: string | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          accrual_date?: string | null
          amount?: number | null
          bank_account_id?: string | null
          cash_date?: string | null
          company_id?: string | null
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          direction?:
            | Database["public"]["Enums"]["transaction_direction"]
            | null
          discount_amount?: number | null
          document_ref?: string | null
          due_date?: string | null
          fine_amount?: number | null
          id?: string | null
          import_batch_id?: string | null
          installment_n?: number | null
          installment_total?: number | null
          interest_amount?: number | null
          metadata?: Json | null
          notes?: string | null
          paid_amount?: number | null
          parent_id?: string | null
          payroll_item_id?: string | null
          recurring_template_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          tags?: string[] | null
          transfer_group_id?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          accrual_date?: string | null
          amount?: number | null
          bank_account_id?: string | null
          cash_date?: string | null
          company_id?: string | null
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          direction?:
            | Database["public"]["Enums"]["transaction_direction"]
            | null
          discount_amount?: number | null
          document_ref?: string | null
          due_date?: string | null
          fine_amount?: number | null
          id?: string | null
          import_batch_id?: string | null
          installment_n?: number | null
          installment_total?: number | null
          interest_amount?: number | null
          metadata?: Json | null
          notes?: string | null
          paid_amount?: number | null
          parent_id?: string | null
          payroll_item_id?: string | null
          recurring_template_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          tags?: string[] | null
          transfer_group_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_tx_import"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tx_payroll"
            columns: ["payroll_item_id"]
            isOneToOne: false
            referencedRelation: "payroll_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tx_recurring"
            columns: ["recurring_template_id"]
            isOneToOne: false
            referencedRelation: "recurring_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_transactions_signed"
            referencedColumns: ["id"]
          },
        ]
      }
      v_transactions_signed: {
        Row: {
          account_id: string | null
          accrual_date: string | null
          amount: number | null
          bank_account_id: string | null
          cash_date: string | null
          company_id: string | null
          cost_center_id: string | null
          counterparty_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          direction: Database["public"]["Enums"]["transaction_direction"] | null
          discount_amount: number | null
          document_ref: string | null
          due_date: string | null
          fine_amount: number | null
          id: string | null
          import_batch_id: string | null
          installment_n: number | null
          installment_total: number | null
          interest_amount: number | null
          metadata: Json | null
          notes: string | null
          paid_amount: number | null
          parent_id: string | null
          payroll_item_id: string | null
          recurring_template_id: string | null
          signed_amount: number | null
          status: Database["public"]["Enums"]["transaction_status"] | null
          tags: string[] | null
          transfer_group_id: string | null
          updated_at: string | null
        }
        Insert: {
          account_id?: string | null
          accrual_date?: string | null
          amount?: number | null
          bank_account_id?: string | null
          cash_date?: string | null
          company_id?: string | null
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          direction?:
            | Database["public"]["Enums"]["transaction_direction"]
            | null
          discount_amount?: number | null
          document_ref?: string | null
          due_date?: string | null
          fine_amount?: number | null
          id?: string | null
          import_batch_id?: string | null
          installment_n?: number | null
          installment_total?: number | null
          interest_amount?: number | null
          metadata?: Json | null
          notes?: string | null
          paid_amount?: number | null
          parent_id?: string | null
          payroll_item_id?: string | null
          recurring_template_id?: string | null
          signed_amount?: never
          status?: Database["public"]["Enums"]["transaction_status"] | null
          tags?: string[] | null
          transfer_group_id?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string | null
          accrual_date?: string | null
          amount?: number | null
          bank_account_id?: string | null
          cash_date?: string | null
          company_id?: string | null
          cost_center_id?: string | null
          counterparty_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          direction?:
            | Database["public"]["Enums"]["transaction_direction"]
            | null
          discount_amount?: number | null
          document_ref?: string | null
          due_date?: string | null
          fine_amount?: number | null
          id?: string | null
          import_batch_id?: string | null
          installment_n?: number | null
          installment_total?: number | null
          interest_amount?: number | null
          metadata?: Json | null
          notes?: string | null
          paid_amount?: number | null
          parent_id?: string | null
          payroll_item_id?: string | null
          recurring_template_id?: string | null
          signed_amount?: never
          status?: Database["public"]["Enums"]["transaction_status"] | null
          tags?: string[] | null
          transfer_group_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_tx_import"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tx_payroll"
            columns: ["payroll_item_id"]
            isOneToOne: false
            referencedRelation: "payroll_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tx_recurring"
            columns: ["recurring_template_id"]
            isOneToOne: false
            referencedRelation: "recurring_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_management_map"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "v_transactions_signed"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _apply_classification_rules: {
        Args: { p_line_ids: string[] }
        Returns: number
      }
      _clause: {
        Args: {
          p_area_ids: string[]
          p_include_no_area: boolean
          p_management_ids: string[]
          p_nature: string
        }
        Returns: Json
      }
      _find_company_account: {
        Args: { p_code: string; p_company_id: string }
        Returns: string
      }
      advance_recurrence_date: {
        Args: {
          p_current: string
          p_day_of_month?: number
          p_frequency: string
        }
        Returns: string
      }
      apply_charge_refund_to_jobs: {
        Args: {
          p_charge_id: string
          p_state: Database["public"]["Enums"]["invoice_refund_state"]
        }
        Returns: number
      }
      apply_classification_rules: {
        Args: { p_statement_id: string }
        Returns: number
      }
      approve_invoice_jobs: {
        Args: { p_ids: string[] }
        Returns: {
          approved: number
          blocked: number
        }[]
      }
      approve_recurring_template: {
        Args: { p_template_id: string }
        Returns: string
      }
      audit_log_list: {
        Args: {
          p_changed_by?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_record_id?: string
          p_table_name?: string
          p_to?: string
        }
        Returns: {
          action: string
          changed_at: string
          changed_by: string
          changed_fields: string[]
          changer_email: string
          changer_name: string
          id: number
          new_data: Json
          old_data: Json
          record_id: string
          table_name: string
          total_count: number
        }[]
      }
      backfill_recurring_template: {
        Args: { p_template_id: string; p_through_date?: string }
        Returns: number
      }
      bank_account_ledger: {
        Args: { p_bank_account_id: string; p_from: string; p_to: string }
        Returns: {
          account_code: string
          account_name: string
          amount: number
          cash_date: string
          counterparty_name: string
          description: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          document_ref: string
          is_transfer: boolean
          running_balance: number
          signed_amount: number
          transaction_id: string
        }[]
      }
      bank_account_period: {
        Args: { p_bank_account_id: string; p_from: string; p_to: string }
        Returns: {
          closing_balance: number
          inflow: number
          opening_balance: number
          outflow: number
        }[]
      }
      bank_account_usage: {
        Args: { p_id: string }
        Returns: {
          recurring_templates: number
          snapshots: number
          statement_lines: number
          transactions: number
        }[]
      }
      bank_balances: {
        Args: { p_as_of: string; p_company_id: string }
        Returns: {
          account_type: Database["public"]["Enums"]["bank_account_type"]
          bank_account_id: string
          bank_name: string
          closing_balance: number
          inflow: number
          initial_balance: number
          nickname: string
          outflow: number
        }[]
      }
      bank_balances_multi: {
        Args: { p_as_of: string; p_company_ids?: string[] }
        Returns: {
          account_type: Database["public"]["Enums"]["bank_account_type"]
          bank_account_id: string
          bank_name: string
          closing_balance: number
          company_id: string
          company_name: string
          inflow: number
          initial_balance: number
          nickname: string
          outflow: number
        }[]
      }
      bulk_update_transactions: {
        Args: { p_ids: string[]; p_patch: Json }
        Returns: number
      }
      calculate_simples_anexo_iii: {
        Args: { p_period_revenue: number; p_rbt12: number }
        Returns: {
          amount_due: number
          deduction: number
          effective_rate: number
          nominal_rate: number
          period_revenue: number
          rbt12: number
        }[]
      }
      can_view_module: {
        Args: { p_module: Database["public"]["Enums"]["data_module"] }
        Returns: boolean
      }
      cashflow_daily: {
        Args: { p_company_id: string; p_end: string; p_start: string }
        Returns: {
          day: string
          inflow: number
          net: number
          outflow: number
        }[]
      }
      cashflow_daily_multi: {
        Args: { p_company_ids?: string[]; p_end: string; p_start: string }
        Returns: {
          day: string
          inflow: number
          net: number
          outflow: number
        }[]
      }
      cashflow_monthly: {
        Args: { p_company_id: string; p_year: number }
        Returns: {
          inflow: number
          month_start: string
          net: number
          outflow: number
        }[]
      }
      cashflow_monthly_multi: {
        Args: { p_company_ids?: string[]; p_year: number }
        Returns: {
          inflow: number
          month_start: string
          net: number
          outflow: number
        }[]
      }
      claim_nfse_jobs: {
        Args: { p_limit?: number }
        Returns: {
          aliquota_iss: number | null
          ambiente: Database["public"]["Enums"]["nfse_ambiente"]
          approved_at: string | null
          approved_by: string | null
          attempts: number
          charge_created_at: string | null
          chave_nfse: string | null
          codigo_tributario_municipio: string | null
          company_id: string
          created_at: string
          danfse_path: string | null
          dedup_scope: string | null
          document_type: Database["public"]["Enums"]["fiscal_document_type"]
          emitida_em: string | null
          erros: Json | null
          focus_ref: string
          focus_status: string | null
          id: string
          item_lista_servico: string | null
          last_attempt_at: string | null
          mensagem_sefaz: string | null
          metadata: Json
          next_attempt_at: string | null
          numero_nfse: string | null
          organization_id: string
          pagarme_account_id: string | null
          pagarme_charge_id: string | null
          pagarme_recipient_id: string | null
          paid_at: string | null
          parametros: Json
          protocolo: string | null
          refund_detected_at: string | null
          refund_released_at: string | null
          refund_released_by: string | null
          refund_state: Database["public"]["Enums"]["invoice_refund_state"]
          sales_event_id: string | null
          serie: string | null
          status: Database["public"]["Enums"]["invoice_job_status"]
          tomador_documento: string | null
          tomador_email: string | null
          tomador_endereco: Json | null
          tomador_nome: string | null
          transaction_id: string | null
          updated_at: string
          valor_servicos: number
          xml_path: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "invoice_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_pagarme_sync_run: {
        Args: never
        Returns: {
          attempts: number
          created_at: string
          created_by: string | null
          dry_run: boolean
          id: string
          items_seen: number
          items_skipped: number
          items_written: number
          last_error: string | null
          metadata: Json
          organization_id: string
          pagarme_account_id: string
          page_cursor: number
          page_size: number
          preview: Json | null
          resource: Database["public"]["Enums"]["pagarme_sync_resource"]
          status: Database["public"]["Enums"]["invoice_backfill_status"]
          updated_at: string
          window_end: string
          window_start: string
        }[]
        SetofOptions: {
          from: "*"
          to: "pagarme_sync_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      commit_import_batch: {
        Args: { p_batch_id: string }
        Returns: {
          batch_status: string
          committed_count: number
          failed_count: number
        }[]
      }
      company_stats: {
        Args: never
        Returns: {
          bank_account_count: number
          company_id: string
          employee_count_active: number
          expense_ytd: number
          last_activity: string
          revenue_ytd: number
          tx_count: number
          tx_count_ytd: number
        }[]
      }
      compute_company_period_revenue: {
        Args: { p_company_id: string; p_reference_period: string }
        Returns: number
      }
      compute_company_rbt12: {
        Args: { p_company_id: string; p_reference_period: string }
        Returns: number
      }
      confirm_tax_assessment: {
        Args: { p_assessment_id: string }
        Returns: {
          amount_estimated: number
          amount_paid: number
          assessment_id: string | null
          base_amount: number | null
          company_id: string
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          kind: Database["public"]["Enums"]["tax_obligation_kind"]
          metadata: Json
          notes: string | null
          paid_at: string | null
          rate_pct: number | null
          reference_period: string
          status: Database["public"]["Enums"]["tax_obligation_status"]
          transaction_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tax_obligations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cost_center_analysis: {
        Args: { p_company_id: string; p_from: string; p_to: string }
        Returns: {
          cost_center_id: string
          cost_center_name: string
          expense: number
          margin_pct: number
          net: number
          revenue: number
          transaction_count: number
        }[]
      }
      cost_center_analysis_multi: {
        Args: { p_company_ids?: string[]; p_from: string; p_to: string }
        Returns: {
          companies_count: number
          cost_center_id: string
          cost_center_name: string
          expense: number
          margin_pct: number
          net: number
          revenue: number
          transaction_count: number
        }[]
      }
      cost_center_monthly_series: {
        Args: {
          p_basis?: Database["public"]["Enums"]["accounting_basis"]
          p_company_id: string
          p_from: string
          p_to: string
        }
        Returns: {
          cost_center_id: string
          cost_center_name: string
          expense: number
          month: string
          revenue: number
          transaction_count: number
        }[]
      }
      cost_center_monthly_series_multi: {
        Args: {
          p_basis?: Database["public"]["Enums"]["accounting_basis"]
          p_company_ids?: string[]
          p_from: string
          p_to: string
        }
        Returns: {
          company_id: string
          cost_center_id: string
          cost_center_name: string
          expense: number
          month: string
          revenue: number
          transaction_count: number
        }[]
      }
      counterparty_analysis: {
        Args: {
          p_company_id?: string
          p_company_ids?: string[]
          p_from: string
          p_kind?: string
          p_limit?: number
          p_to: string
        }
        Returns: {
          avg_ticket: number
          companies_count: number
          counterparty_id: string
          counterparty_kind: string
          counterparty_name: string
          last_movement: string
          net: number
          total_inflow: number
          total_outflow: number
          transaction_count: number
        }[]
      }
      create_installments: {
        Args: {
          p_first_due?: string
          p_installments: number
          p_interval_days?: number
          p_template: Json
        }
        Returns: {
          account_id: string
          accrual_date: string
          amount: number
          bank_account_id: string | null
          cash_date: string | null
          company_id: string
          cost_center_id: string | null
          counterparty_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          discount_amount: number
          document_ref: string | null
          due_date: string | null
          fine_amount: number
          id: string
          import_batch_id: string | null
          installment_n: number | null
          installment_total: number | null
          interest_amount: number
          metadata: Json
          nature_override: Database["public"]["Enums"]["expense_nature"] | null
          notes: string | null
          pagarme_projection_key: string | null
          paid_amount: number
          parent_id: string | null
          payroll_item_id: string | null
          recurring_manually_edited: boolean
          recurring_template_id: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          tags: string[]
          transfer_group_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_payroll_run_with_active_employees: {
        Args: { p_company_id: string; p_reference_month: string }
        Returns: string
      }
      create_transaction_from_line: {
        Args: {
          p_account_id: string
          p_cost_center_id?: string
          p_counterparty_id?: string
          p_line_id: string
        }
        Returns: {
          account_id: string
          accrual_date: string
          amount: number
          bank_account_id: string | null
          cash_date: string | null
          company_id: string
          cost_center_id: string | null
          counterparty_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          discount_amount: number
          document_ref: string | null
          due_date: string | null
          fine_amount: number
          id: string
          import_batch_id: string | null
          installment_n: number | null
          installment_total: number | null
          interest_amount: number
          metadata: Json
          nature_override: Database["public"]["Enums"]["expense_nature"] | null
          notes: string | null
          pagarme_projection_key: string | null
          paid_amount: number
          parent_id: string | null
          payroll_item_id: string | null
          recurring_manually_edited: boolean
          recurring_template_id: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          tags: string[]
          transfer_group_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_transfer: {
        Args: {
          p_amount: number
          p_company_id: string
          p_date: string
          p_description?: string
          p_from_account: string
          p_notes?: string
          p_to_account: string
        }
        Returns: string
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      default_management_account_code: {
        Args: { p_kind: Database["public"]["Enums"]["account_kind"] }
        Returns: string
      }
      delete_card_statement: {
        Args: { p_statement_id: string }
        Returns: undefined
      }
      delete_chart_account: {
        Args: { p_account_id: string }
        Returns: undefined
      }
      delete_employee: { Args: { p_employee_id: string }; Returns: undefined }
      delete_payroll_run: { Args: { p_run_id: string }; Returns: undefined }
      dre_by_company: {
        Args: { p_company_id: string; p_end: string; p_start: string }
        Returns: {
          account_id: string
          below_the_line: boolean
          code: string
          dre_section: Database["public"]["Enums"]["dre_section"]
          is_summary: boolean
          kind: Database["public"]["Enums"]["account_kind"]
          name: string
          parent_id: string
          sign_hint: string
          sort_order: number
          total: number
          total_cash: number
        }[]
      }
      dre_comparison: {
        Args: {
          p_company_id: string
          p_period_a_from: string
          p_period_a_to: string
          p_period_b_from: string
          p_period_b_to: string
        }
        Returns: {
          account_id: string
          code: string
          dre_section: Database["public"]["Enums"]["dre_section"]
          is_summary: boolean
          kind: Database["public"]["Enums"]["account_kind"]
          name: string
          sort_order: number
          total_a: number
          total_b: number
          variance_abs: number
          variance_pct: number
        }[]
      }
      dre_comparison_multi: {
        Args: {
          p_company_ids?: string[]
          p_organization_id: string
          p_period_a_from: string
          p_period_a_to: string
          p_period_b_from: string
          p_period_b_to: string
        }
        Returns: {
          account_id: string
          code: string
          dre_section: Database["public"]["Enums"]["dre_section"]
          is_summary: boolean
          kind: Database["public"]["Enums"]["account_kind"]
          name: string
          sort_order: number
          total_a: number
          total_b: number
          variance_abs: number
          variance_pct: number
        }[]
      }
      dre_consolidated: {
        Args: {
          p_company_ids?: string[]
          p_end: string
          p_organization_id: string
          p_start: string
        }
        Returns: {
          below_the_line: boolean
          code: string
          dre_section: Database["public"]["Enums"]["dre_section"]
          is_summary: boolean
          kind: Database["public"]["Enums"]["account_kind"]
          master_id: string
          name: string
          parent_id: string
          sign_hint: string
          sort_order: number
          total: number
          total_cash: number
        }[]
      }
      expense_breakdown: {
        Args: {
          p_company_id?: string
          p_company_ids?: string[]
          p_end?: string
          p_limit?: number
          p_organization_id?: string
          p_start?: string
        }
        Returns: {
          account_code: string
          account_id: string
          account_name: string
          is_other: boolean
          kind: Database["public"]["Enums"]["account_kind"]
          total: number
        }[]
      }
      forecast_cashflow_daily: {
        Args: { p_company_id: string; p_from: string; p_to: string }
        Returns: {
          day: string
          inflow_expected: number
          inflow_recurring: number
          outflow_expected: number
          outflow_recurring: number
          running_balance: number
        }[]
      }
      forecast_cashflow_daily_multi: {
        Args: { p_company_ids?: string[]; p_from: string; p_to: string }
        Returns: {
          day: string
          inflow_expected: number
          inflow_recurring: number
          outflow_expected: number
          outflow_recurring: number
          running_balance: number
        }[]
      }
      forecast_pagarme_inflow: {
        Args: {
          p_company_id?: string
          p_company_ids?: string[]
          p_from: string
          p_to: string
        }
        Returns: {
          day: string
          fees_pagarme: number
          inflow_pagarme: number
        }[]
      }
      generate_recurring_transactions: {
        Args: { p_through_date?: string }
        Returns: {
          generated_count: number
          template_id: string
        }[]
      }
      generate_tax_obligations: {
        Args: { p_company_id: string; p_reference_period: string }
        Returns: {
          amount_estimated: number
          amount_paid: number
          assessment_id: string | null
          base_amount: number | null
          company_id: string
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          kind: Database["public"]["Enums"]["tax_obligation_kind"]
          metadata: Json
          notes: string | null
          paid_at: string | null
          rate_pct: number | null
          reference_period: string
          status: Database["public"]["Enums"]["tax_obligation_status"]
          transaction_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tax_obligations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_focus_token: { Args: { p_company_id: string }; Returns: string }
      get_pagarme_account_secret: {
        Args: { p_account_id: string }
        Returns: string
      }
      get_pagarme_webhook_secret: { Args: { p_slug: string }; Returns: string }
      has_company_access: { Args: { p_company_id: string }; Returns: boolean }
      has_company_write_access: {
        Args: { p_company_id: string }
        Returns: boolean
      }
      has_organization_access: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      hidden_company_group_ids: { Args: never; Returns: string[] }
      ignore_statement_line: {
        Args: { p_line_id: string }
        Returns: {
          amount: number
          balance_after: number | null
          bank_account_id: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string
          document_ref: string | null
          fit_id: string | null
          id: string
          import_batch_id: string | null
          import_source: string
          matched_at: string | null
          matched_by: string | null
          matched_transaction_id: string | null
          notes: string | null
          posted_at: string
          raw: Json
          status: Database["public"]["Enums"]["statement_line_status"]
        }
        SetofOptions: {
          from: "*"
          to: "bank_statement_lines"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_financial_user: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      kpi_dashboard: {
        Args: { p_company_id: string; p_year: number }
        Returns: {
          cash_generation: number
          cogs: number
          contribution_margin: number
          dividends: number
          effective_tax_rate_pct: number
          financial_result: number
          fixed_costs: number
          gross_margin_pct: number
          gross_revenue: number
          month_start: string
          net_margin_pct: number
          net_result: number
          net_revenue: number
          partner_bonus: number
          partner_reimbursement: number
          revenue_deductions: number
        }[]
      }
      kpi_dashboard_consolidated: {
        Args: {
          p_company_ids?: string[]
          p_organization_id: string
          p_year: number
        }
        Returns: {
          cash_generation: number
          cogs: number
          contribution_margin: number
          dividends: number
          effective_tax_rate_pct: number
          financial_result: number
          fixed_costs: number
          gross_margin_pct: number
          gross_revenue: number
          month_start: string
          net_margin_pct: number
          net_result: number
          net_revenue: number
          partner_bonus: number
          partner_reimbursement: number
          revenue_deductions: number
        }[]
      }
      management_kind_accepts: {
        Args: {
          p_account_kind: Database["public"]["Enums"]["account_kind"]
          p_management_kind: Database["public"]["Enums"]["management_account_kind"]
        }
        Returns: boolean
      }
      management_line_transactions: {
        Args: {
          p_basis: Database["public"]["Enums"]["accounting_basis"]
          p_company_ids?: string[]
          p_from: string
          p_keys: Json
          p_limit?: number
          p_to: string
        }
        Returns: {
          account_code: string
          account_name: string
          accrual_date: string
          amount: number
          cash_date: string
          cost_center_id: string
          cost_center_name: string
          counterparty_name: string
          description: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          document_ref: string
          id: string
          source: string
          status: Database["public"]["Enums"]["transaction_status"]
          total_count: number
          transaction_id: string
        }[]
      }
      management_monthly_series_multi: {
        Args: {
          p_basis?: Database["public"]["Enums"]["accounting_basis"]
          p_company_ids?: string[]
          p_from: string
          p_to: string
        }
        Returns: {
          cost_center_id: string
          expense: number
          management_account_id: string
          management_group_id: string
          month: string
          nature: Database["public"]["Enums"]["expense_nature"]
          revenue: number
          transaction_count: number
        }[]
      }
      mark_overdue_obligations: {
        Args: { p_company_id: string }
        Returns: number
      }
      mark_tax_paid: {
        Args: {
          p_account_id: string
          p_actual_amount?: number
          p_bank_account_id: string
          p_obligation_id: string
          p_paid_at: string
        }
        Returns: {
          amount_estimated: number
          amount_paid: number
          assessment_id: string | null
          base_amount: number | null
          company_id: string
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          kind: Database["public"]["Enums"]["tax_obligation_kind"]
          metadata: Json
          notes: string | null
          paid_at: string | null
          rate_pct: number | null
          reference_period: string
          status: Database["public"]["Enums"]["tax_obligation_status"]
          transaction_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tax_obligations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      match_statement_line: {
        Args: { p_line_id: string; p_transaction_id: string }
        Returns: {
          amount: number
          balance_after: number | null
          bank_account_id: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string
          document_ref: string | null
          fit_id: string | null
          id: string
          import_batch_id: string | null
          import_source: string
          matched_at: string | null
          matched_by: string | null
          matched_transaction_id: string | null
          notes: string | null
          posted_at: string
          raw: Json
          status: Database["public"]["Enums"]["statement_line_status"]
        }
        SetofOptions: {
          from: "*"
          to: "bank_statement_lines"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      materialize_recurring_occurrence: {
        Args: { p_template_id: string }
        Returns: string
      }
      mcp_run_query: {
        Args: { p_limit?: number; p_sql: string }
        Returns: Json
      }
      merge_cost_centers: {
        Args: { p_source_ids: string[]; p_target_id: string }
        Returns: number
      }
      nfse_backfill_cron_invoke: { Args: never; Returns: undefined }
      nfse_cron_invoke: { Args: { p_mode?: string }; Returns: undefined }
      normalize_card_description: { Args: { p_text: string }; Returns: string }
      pagarme_active_sync_accounts: {
        Args: never
        Returns: {
          id: string
          slug: string
        }[]
      }
      pagarme_charges_needing_maturity_sync: {
        Args: { p_account_id: string; p_grace_days?: number; p_limit?: number }
        Returns: {
          pagarme_charge_id: string
        }[]
      }
      pagarme_cron_invoke: { Args: { p_mode?: string }; Returns: undefined }
      pagarme_cron_status: {
        Args: never
        Returns: {
          active: boolean
          job_name: string
          last_run_at: string
          last_status: string
          schedule: string
        }[]
      }
      pagarme_gateway_accounts: {
        Args: { p_company_id: string }
        Returns: {
          account_label: string
          cutover_date: string
          enabled: boolean
          gateway_bank_account_id: string
          gateway_nickname: string
          pagarme_account_id: string
          payout_bank_account_id: string
          payout_nickname: string
          settings_id: string
        }[]
      }
      pagarme_project_ledger: {
        Args: {
          p_company_id: string
          p_from: string
          p_pagarme_account_id?: string
          p_to: string
        }
        Returns: {
          kind: string
          lancamentos: number
          valor: number
        }[]
      }
      pagarme_receivables_of_transaction: {
        Args: { p_transaction_id: string }
        Returns: {
          amount: number
          anticipated: boolean
          card_brand: string
          customer_name: string
          expected_payment_date: string
          fee_total: number
          installment: number
          installments_total: number
          net_amount: number
          pagarme_charge_id: string
          payment_method: string
          receivable_id: string
          sale_paid_at: string
          status: string
        }[]
      }
      pagarme_reconcile_month: {
        Args: { p_company_id: string; p_month: string }
        Returns: {
          detail: string
          metric: string
          value: number
        }[]
      }
      pagarme_reconcile_payout: {
        Args: {
          p_amount: number
          p_bank_account_id?: string
          p_company_id: string
          p_external_ref: string
          p_funded_on: string
          p_notes?: string
          p_statement_line_id?: string
        }
        Returns: string
      }
      pagarme_resume_sync_run: { Args: { p_run_id: string }; Returns: string }
      pagarme_setup_gateway_account: {
        Args: {
          p_account_id: string
          p_company_id: string
          p_cutover_date?: string
          p_gateway_bank_account_id?: string
          p_payout_bank_account_id?: string
        }
        Returns: string
      }
      pagarme_start_backfill: {
        Args: {
          p_account_id: string
          p_dry_run?: boolean
          p_window_end: string
          p_window_start: string
        }
        Returns: string
      }
      pending_card_invoice_transactions: {
        Args: { p_company_ids?: string[]; p_limit?: number }
        Returns: {
          accrual_date: string
          amount: number
          cash_date: string
          company_id: string
          description: string
          id: string
        }[]
      }
      post_payroll_run: {
        Args: { p_default_account_id: string; p_run_id: string }
        Returns: {
          generated_count: number
          total_amount: number
        }[]
      }
      preview_payroll_posting: {
        Args: { p_run_id: string }
        Returns: {
          account_code: string
          account_name: string
          amount: number
          component: Database["public"]["Enums"]["payroll_component"]
          employee_kind: Database["public"]["Enums"]["employee_kind"]
          employee_name: string
          has_mapping: boolean
        }[]
      }
      receivables_schedule: {
        Args: {
          p_company_id?: string
          p_company_ids?: string[]
          p_from: string
          p_to: string
        }
        Returns: {
          fees: number
          gross: number
          installments_count: number
          month_start: string
          net: number
          pending_gross: number
          pending_installments: number
          settled_gross: number
        }[]
      }
      recurring_horizon_date: { Args: never; Returns: string }
      recurring_horizon_months: { Args: never; Returns: number }
      reemit_authorized_to_producao: {
        Args: { p_account_id: string }
        Returns: number
      }
      register_payment: {
        Args: {
          p_amount: number
          p_bank_account_id?: string
          p_discount?: number
          p_fine?: number
          p_interest?: number
          p_paid_at?: string
          p_transaction_id: string
        }
        Returns: {
          account_id: string
          accrual_date: string
          amount: number
          bank_account_id: string | null
          cash_date: string | null
          company_id: string
          cost_center_id: string | null
          counterparty_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          discount_amount: number
          document_ref: string | null
          due_date: string | null
          fine_amount: number
          id: string
          import_batch_id: string | null
          installment_n: number | null
          installment_total: number | null
          interest_amount: number
          metadata: Json
          nature_override: Database["public"]["Enums"]["expense_nature"] | null
          notes: string | null
          pagarme_projection_key: string | null
          paid_amount: number
          parent_id: string | null
          payroll_item_id: string | null
          recurring_manually_edited: boolean
          recurring_template_id: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          tags: string[]
          transfer_group_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      release_invoice_job_for_emission: {
        Args: { p_id: string; p_motivo: string }
        Returns: Database["public"]["Enums"]["invoice_job_status"]
      }
      reopen_tax_assessment: {
        Args: { p_assessment_id: string }
        Returns: {
          additions: number
          amount_due: number
          company_id: string
          computed_at: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          deductions: number
          due_date: string
          gross_revenue: number
          id: string
          kind: Database["public"]["Enums"]["tax_obligation_kind"]
          metadata: Json
          notes: string | null
          period_end: string
          period_kind: Database["public"]["Enums"]["tax_period_kind"]
          period_start: string
          rate: number
          retentions: number
          rule_id: string | null
          status: Database["public"]["Enums"]["tax_assessment_status"]
          surtax_amount: number
          surtax_base: number
          tax_amount: number
          taxable_base: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tax_assessments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      restructure_cost_centers_into_areas: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      resync_recurring_future: {
        Args: { p_template_id: string }
        Returns: number
      }
      rewrite_balance_model_lines: {
        Args: {
          p_company_ids: string[]
          p_lines: Json
          p_organization_id: string
        }
        Returns: Json
      }
      rotate_account_webhook_secret: {
        Args: { p_account_id: string }
        Returns: string
      }
      sales_breakdown: {
        Args: {
          p_account_id?: string
          p_dimension?: string
          p_from: string
          p_to: string
        }
        Returns: {
          amount: number
          label: string
          sales_count: number
        }[]
      }
      sales_customers: {
        Args: { p_account_id?: string; p_from: string; p_to: string }
        Returns: {
          ledger_since: string
          new_customers: number
          new_revenue: number
          repeat_rate: number
          returning_customers: number
          returning_revenue: number
        }[]
      }
      sales_overview: {
        Args: { p_account_id?: string; p_from: string; p_to: string }
        Returns: {
          approval_rate: number
          attempts_count: number
          avg_ticket: number
          customers_count: number
          failed_count: number
          gmv: number
          installments_avg: number
          net_sales: number
          refunded: number
          sales_count: number
        }[]
      }
      sales_recurrence: {
        Args: { p_account_id?: string; p_from: string; p_to: string }
        Returns: {
          churn_rate_logo: number
          contracted_installments: number
          contracted_receivables: number
          has_subscriptions: boolean
          involuntary_failed: number
          mrr_active: number
          subs_active: number
          subs_canceled: number
          subs_new: number
        }[]
      }
      sales_timeseries: {
        Args: {
          p_account_id?: string
          p_from: string
          p_grain?: string
          p_to: string
        }
        Returns: {
          avg_ticket: number
          bucket: string
          failed_count: number
          gmv: number
          sales_count: number
        }[]
      }
      save_card_statement: {
        Args: {
          p_attachment_id?: string
          p_file_sha256?: string
          p_parser?: string
          p_parser_version?: string
          p_replace?: boolean
          p_statement: Json
          p_transaction_id: string
        }
        Returns: Json
      }
      save_tax_assessment: {
        Args: { p_payload: Json }
        Returns: {
          additions: number
          amount_due: number
          company_id: string
          computed_at: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          deductions: number
          due_date: string
          gross_revenue: number
          id: string
          kind: Database["public"]["Enums"]["tax_obligation_kind"]
          metadata: Json
          notes: string | null
          period_end: string
          period_kind: Database["public"]["Enums"]["tax_period_kind"]
          period_start: string
          rate: number
          retentions: number
          rule_id: string | null
          status: Database["public"]["Enums"]["tax_assessment_status"]
          surtax_amount: number
          surtax_base: number
          tax_amount: number
          taxable_base: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tax_assessments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      seed_company_chart_of_accounts: {
        Args: { p_company_id: string }
        Returns: number
      }
      seed_management_plan: {
        Args: { p_organization_id: string }
        Returns: number
      }
      set_company_focus_token: {
        Args: { p_company_id: string; p_token: string }
        Returns: undefined
      }
      set_pagarme_account_secret: {
        Args: { p_account_id: string; p_secret: string }
        Returns: undefined
      }
      setup_payroll_mappings_defaults: {
        Args: { p_company_id: string }
        Returns: {
          account_id: string
          company_id: string
          component: Database["public"]["Enums"]["payroll_component"]
          cost_center_id: string | null
          created_at: string
          employee_kind: Database["public"]["Enums"]["employee_kind"]
          id: string
          notes: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payroll_account_mappings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      suggest_match_candidates: {
        Args: { p_line_id: string; p_max?: number }
        Returns: {
          account_code: string
          account_name: string
          accrual_date: string
          amount: number
          cash_date: string
          counterparty_name: string
          description: string
          direction: Database["public"]["Enums"]["transaction_direction"]
          due_date: string
          score: number
          transaction_id: string
        }[]
      }
      tax_adjust_business_day: {
        Args: {
          p_adjust: Database["public"]["Enums"]["tax_due_date_adjust"]
          p_date: string
          p_municipio_ibge?: string
          p_uf?: string
        }
        Returns: string
      }
      tax_assessment_inputs: {
        Args: {
          p_company_id: string
          p_kind: Database["public"]["Enums"]["tax_obligation_kind"]
          p_period_date: string
        }
        Returns: Json
      }
      tax_due_date: {
        Args: {
          p_adjust: Database["public"]["Enums"]["tax_due_date_adjust"]
          p_due_day: number
          p_month_offset: number
          p_municipio_ibge?: string
          p_period_end: string
          p_uf?: string
        }
        Returns: string
      }
      tax_is_business_day: {
        Args: { p_date: string; p_municipio_ibge?: string; p_uf?: string }
        Returns: boolean
      }
      tax_period_end: {
        Args: {
          p_date: string
          p_period_kind: Database["public"]["Enums"]["tax_period_kind"]
        }
        Returns: string
      }
      tax_period_start: {
        Args: {
          p_date: string
          p_period_kind: Database["public"]["Enums"]["tax_period_kind"]
        }
        Returns: string
      }
      tax_uf_from_ibge: { Args: { p_municipio_ibge: string }; Returns: string }
      unmatch_statement_line: {
        Args: { p_line_id: string }
        Returns: {
          amount: number
          balance_after: number | null
          bank_account_id: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string
          document_ref: string | null
          fit_id: string | null
          id: string
          import_batch_id: string | null
          import_source: string
          matched_at: string | null
          matched_by: string | null
          matched_transaction_id: string | null
          notes: string | null
          posted_at: string
          raw: Json
          status: Database["public"]["Enums"]["statement_line_status"]
        }
        SetofOptions: {
          from: "*"
          to: "bank_statement_lines"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      void_invoice_job: {
        Args: { p_id: string; p_motivo: string }
        Returns: Database["public"]["Enums"]["invoice_job_status"]
      }
    }
    Enums: {
      account_kind:
        | "revenue"
        | "revenue_deduction"
        | "cogs"
        | "operating_expense"
        | "personnel_expense"
        | "financial_expense"
        | "financial_income"
        | "dividend"
        | "partner_bonus"
        | "partner_reimbursement"
        | "capital_movement"
        | "asset"
        | "liability"
        | "equity"
        | "tax_on_profit"
        | "summary"
      accounting_basis: "accrual" | "cash"
      attachment_entity_type:
        | "transaction"
        | "counterparty"
        | "company"
        | "payroll_run"
        | "employee"
      bank_account_type:
        | "checking"
        | "savings"
        | "cdb_automatic"
        | "cdb_daily"
        | "cdb_term"
        | "investment_fund"
        | "cash"
        | "payment_gateway"
      card_classification_source: "rule" | "ai" | "human"
      card_line_classification: "unclassified" | "suggested" | "confirmed"
      card_line_kind: "purchase" | "fee" | "interest" | "refund"
      card_statement_status: "needs_review" | "reconciled"
      company_tax_regime: "simples" | "lucro_presumido" | "lucro_real" | "mei"
      data_module:
        | "financials"
        | "payroll"
        | "taxes"
        | "nfse"
        | "audit"
        | "sales"
      dre_section:
        | "gross_revenue"
        | "revenue_deductions"
        | "net_revenue"
        | "cogs"
        | "contribution_margin"
        | "fixed_costs"
        | "fixed_costs_personnel"
        | "fixed_costs_utilities"
        | "financial_result"
        | "net_result"
        | "profitability"
        | "capital_movements"
        | "cash_generation"
        | "balance_snapshot"
        | "applications"
        | "operational_data"
      employee_kind: "clt" | "pj" | "intern" | "partner"
      employee_status: "active" | "on_leave" | "terminated"
      expense_nature: "opex" | "capex"
      fiscal_document_type: "nfse" | "nfe"
      import_status:
        | "uploaded"
        | "mapped"
        | "previewed"
        | "committed"
        | "failed"
      invoice_backfill_status: "running" | "completed" | "failed" | "cancelled"
      invoice_job_status:
        | "pending_review"
        | "approved"
        | "queued"
        | "submitting"
        | "processing_authorization"
        | "authorized"
        | "rejected"
        | "cancelling"
        | "cancelled"
        | "failed"
        | "voided"
      invoice_refund_state: "none" | "partial" | "full" | "chargeback"
      management_account_kind:
        | "revenue"
        | "revenue_tax"
        | "expense"
        | "financial"
        | "distribution"
      nfse_ambiente: "homologacao" | "producao"
      nfse_emission_mode: "manual" | "automatic"
      nfse_padrao: "municipal" | "nacional"
      pagarme_sync_resource:
        | "charges"
        | "payables"
        | "balance_operations"
        | "subscriptions"
      payroll_component:
        | "salary_fixed"
        | "salary_variable"
        | "salary_bonus"
        | "fgts"
        | "benefits"
        | "irrf_withheld"
        | "inss_withheld"
      payroll_payment_type:
        | "fixed"
        | "variable"
        | "bonus"
        | "vacation"
        | "thirteenth"
        | "severance"
        | "adjustment"
      recurrence_frequency:
        | "weekly"
        | "biweekly"
        | "monthly"
        | "quarterly"
        | "semiannual"
        | "yearly"
      statement_line_status: "unmatched" | "matched" | "created" | "ignored"
      tax_allowance_mode: "excess" | "full_when_exceeded"
      tax_assessment_line_kind:
        | "revenue"
        | "revenue_return"
        | "retention"
        | "deduction"
        | "addition"
        | "carryforward"
      tax_assessment_status: "draft" | "confirmed"
      tax_base_date_basis: "accrual" | "cash"
      tax_base_source: "revenue_accounts" | "dividends" | "payroll" | "manual"
      tax_due_date_adjust:
        | "none"
        | "previous_business_day"
        | "next_business_day"
      tax_obligation_kind:
        | "das_simples"
        | "darf_irpj"
        | "darf_csll"
        | "darf_pis"
        | "darf_cofins"
        | "gps_inss"
        | "fgts"
        | "icms"
        | "iss"
        | "irrf_retencao"
        | "inss_retencao"
        | "custom"
        | "irrf_dividendos"
      tax_obligation_status: "pending" | "paid" | "overdue" | "waived"
      tax_period_kind: "monthly" | "quarterly" | "annual"
      tax_presumption_class:
        | "revenda_mercadoria"
        | "industria"
        | "servico_geral"
        | "servico_transporte"
        | "servico_hospitalar"
        | "combustivel_revenda"
        | "financeiro_exterior"
        | "outras"
      transaction_direction: "inflow" | "outflow"
      transaction_status:
        | "scheduled"
        | "pending"
        | "settled"
        | "reconciled"
        | "canceled"
      user_role: "admin" | "editor" | "viewer" | "super_admin"
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
      account_kind: [
        "revenue",
        "revenue_deduction",
        "cogs",
        "operating_expense",
        "personnel_expense",
        "financial_expense",
        "financial_income",
        "dividend",
        "partner_bonus",
        "partner_reimbursement",
        "capital_movement",
        "asset",
        "liability",
        "equity",
        "tax_on_profit",
        "summary",
      ],
      accounting_basis: ["accrual", "cash"],
      attachment_entity_type: [
        "transaction",
        "counterparty",
        "company",
        "payroll_run",
        "employee",
      ],
      bank_account_type: [
        "checking",
        "savings",
        "cdb_automatic",
        "cdb_daily",
        "cdb_term",
        "investment_fund",
        "cash",
        "payment_gateway",
      ],
      card_classification_source: ["rule", "ai", "human"],
      card_line_classification: ["unclassified", "suggested", "confirmed"],
      card_line_kind: ["purchase", "fee", "interest", "refund"],
      card_statement_status: ["needs_review", "reconciled"],
      company_tax_regime: ["simples", "lucro_presumido", "lucro_real", "mei"],
      data_module: ["financials", "payroll", "taxes", "nfse", "audit", "sales"],
      dre_section: [
        "gross_revenue",
        "revenue_deductions",
        "net_revenue",
        "cogs",
        "contribution_margin",
        "fixed_costs",
        "fixed_costs_personnel",
        "fixed_costs_utilities",
        "financial_result",
        "net_result",
        "profitability",
        "capital_movements",
        "cash_generation",
        "balance_snapshot",
        "applications",
        "operational_data",
      ],
      employee_kind: ["clt", "pj", "intern", "partner"],
      employee_status: ["active", "on_leave", "terminated"],
      expense_nature: ["opex", "capex"],
      fiscal_document_type: ["nfse", "nfe"],
      import_status: ["uploaded", "mapped", "previewed", "committed", "failed"],
      invoice_backfill_status: ["running", "completed", "failed", "cancelled"],
      invoice_job_status: [
        "pending_review",
        "approved",
        "queued",
        "submitting",
        "processing_authorization",
        "authorized",
        "rejected",
        "cancelling",
        "cancelled",
        "failed",
        "voided",
      ],
      invoice_refund_state: ["none", "partial", "full", "chargeback"],
      management_account_kind: [
        "revenue",
        "revenue_tax",
        "expense",
        "financial",
        "distribution",
      ],
      nfse_ambiente: ["homologacao", "producao"],
      nfse_emission_mode: ["manual", "automatic"],
      nfse_padrao: ["municipal", "nacional"],
      pagarme_sync_resource: [
        "charges",
        "payables",
        "balance_operations",
        "subscriptions",
      ],
      payroll_component: [
        "salary_fixed",
        "salary_variable",
        "salary_bonus",
        "fgts",
        "benefits",
        "irrf_withheld",
        "inss_withheld",
      ],
      payroll_payment_type: [
        "fixed",
        "variable",
        "bonus",
        "vacation",
        "thirteenth",
        "severance",
        "adjustment",
      ],
      recurrence_frequency: [
        "weekly",
        "biweekly",
        "monthly",
        "quarterly",
        "semiannual",
        "yearly",
      ],
      statement_line_status: ["unmatched", "matched", "created", "ignored"],
      tax_allowance_mode: ["excess", "full_when_exceeded"],
      tax_assessment_line_kind: [
        "revenue",
        "revenue_return",
        "retention",
        "deduction",
        "addition",
        "carryforward",
      ],
      tax_assessment_status: ["draft", "confirmed"],
      tax_base_date_basis: ["accrual", "cash"],
      tax_base_source: ["revenue_accounts", "dividends", "payroll", "manual"],
      tax_due_date_adjust: [
        "none",
        "previous_business_day",
        "next_business_day",
      ],
      tax_obligation_kind: [
        "das_simples",
        "darf_irpj",
        "darf_csll",
        "darf_pis",
        "darf_cofins",
        "gps_inss",
        "fgts",
        "icms",
        "iss",
        "irrf_retencao",
        "inss_retencao",
        "custom",
        "irrf_dividendos",
      ],
      tax_obligation_status: ["pending", "paid", "overdue", "waived"],
      tax_period_kind: ["monthly", "quarterly", "annual"],
      tax_presumption_class: [
        "revenda_mercadoria",
        "industria",
        "servico_geral",
        "servico_transporte",
        "servico_hospitalar",
        "combustivel_revenda",
        "financeiro_exterior",
        "outras",
      ],
      transaction_direction: ["inflow", "outflow"],
      transaction_status: [
        "scheduled",
        "pending",
        "settled",
        "reconciled",
        "canceled",
      ],
      user_role: ["admin", "editor", "viewer", "super_admin"],
    },
  },
} as const

