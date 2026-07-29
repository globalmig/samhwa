BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[users] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [email] NVARCHAR(255) NOT NULL,
    [password_hash] NVARCHAR(255) NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [role] NVARCHAR(20) NOT NULL,
    [is_active] BIT NOT NULL CONSTRAINT [users_is_active_df] DEFAULT 1,
    [last_login_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [users_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [users_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [users_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[role_permissions] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [role] NVARCHAR(20) NOT NULL,
    [resource_type] NVARCHAR(20) NOT NULL,
    [resource_key] NVARCHAR(200) NOT NULL,
    [action] NVARCHAR(20) NOT NULL,
    [is_allowed] BIT NOT NULL CONSTRAINT [role_permissions_is_allowed_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [role_permissions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [role_permissions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [role_permissions_role_resource_type_resource_key_action_key] UNIQUE NONCLUSTERED ([role],[resource_type],[resource_key],[action])
);

-- CreateTable
CREATE TABLE [dbo].[audit_logs] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [user_id] UNIQUEIDENTIFIER,
    [action] NVARCHAR(50) NOT NULL,
    [resource_type] NVARCHAR(100) NOT NULL,
    [resource_id] UNIQUEIDENTIFIER,
    [old_values] NVARCHAR(max),
    [new_values] NVARCHAR(max),
    [ip_address] NVARCHAR(45),
    [user_agent] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [audit_logs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [audit_logs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[companies] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [company_name] NVARCHAR(200) NOT NULL,
    [business_number] NVARCHAR(20) NOT NULL,
    [ceo_name] NVARCHAR(100),
    [address] NVARCHAR(max),
    [phone] NVARCHAR(30),
    [email] NVARCHAR(255),
    [is_active] BIT NOT NULL CONSTRAINT [companies_is_active_df] DEFAULT 1,
    [notes] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [companies_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [companies_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [companies_business_number_key] UNIQUE NONCLUSTERED ([business_number])
);

-- CreateTable
CREATE TABLE [dbo].[company_contacts] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [company_id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [department] NVARCHAR(100),
    [position] NVARCHAR(100),
    [phone] NVARCHAR(30),
    [email] NVARCHAR(255),
    [is_primary] BIT NOT NULL CONSTRAINT [company_contacts_is_primary_df] DEFAULT 0,
    [is_active] BIT NOT NULL CONSTRAINT [company_contacts_is_active_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [company_contacts_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [company_contacts_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[company_classifications] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [company_id] UNIQUEIDENTIFIER NOT NULL,
    [project_term_id] UNIQUEIDENTIFIER NOT NULL,
    [classification] NVARCHAR(100) NOT NULL,
    [effective_from] DATE NOT NULL,
    [notes] NVARCHAR(max),
    [created_by] UNIQUEIDENTIFIER,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [company_classifications_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [company_classifications_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [company_classifications_company_id_project_term_id_key] UNIQUE NONCLUSTERED ([company_id],[project_term_id])
);

-- CreateTable
CREATE TABLE [dbo].[company_classification_histories] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [company_id] UNIQUEIDENTIFIER NOT NULL,
    [project_term_id] UNIQUEIDENTIFIER NOT NULL,
    [old_classification] NVARCHAR(100),
    [new_classification] NVARCHAR(100) NOT NULL,
    [change_reason] NVARCHAR(max),
    [changed_by] UNIQUEIDENTIFIER NOT NULL,
    [changed_at] DATETIME2 NOT NULL CONSTRAINT [company_classification_histories_changed_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [company_classification_histories_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[institutions] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [company_id] UNIQUEIDENTIFIER,
    [institution_name] NVARCHAR(200) NOT NULL,
    [business_number] NVARCHAR(20),
    [institution_type] NVARCHAR(50),
    [address] NVARCHAR(max),
    [phone] NVARCHAR(30),
    [email] NVARCHAR(255),
    [representative_name] NVARCHAR(100),
    [is_active] BIT NOT NULL CONSTRAINT [institutions_is_active_df] DEFAULT 1,
    [notes] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [institutions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [institutions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [institutions_business_number_key] UNIQUE NONCLUSTERED ([business_number])
);

-- CreateTable
CREATE TABLE [dbo].[institution_contacts] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [institution_id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [department] NVARCHAR(100),
    [position] NVARCHAR(100),
    [phone] NVARCHAR(30),
    [email] NVARCHAR(255),
    [is_primary] BIT NOT NULL CONSTRAINT [institution_contacts_is_primary_df] DEFAULT 0,
    [is_active] BIT NOT NULL CONSTRAINT [institution_contacts_is_active_df] DEFAULT 1,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [institution_contacts_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [institution_contacts_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[projects] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [project_number] NVARCHAR(100) NOT NULL,
    [project_name] NVARCHAR(500) NOT NULL,
    [project_type] NVARCHAR(100) NOT NULL,
    [agency] NVARCHAR(200),
    [settlement_type] NVARCHAR(50) NOT NULL,
    [start_year] INT NOT NULL,
    [end_year] INT NOT NULL,
    [total_terms] INT NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [projects_status_df] DEFAULT 'ACTIVE',
    [notes] NVARCHAR(max),
    [created_by] UNIQUEIDENTIFIER,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [projects_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [projects_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [projects_project_number_key] UNIQUE NONCLUSTERED ([project_number])
);

-- CreateTable
CREATE TABLE [dbo].[project_terms] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [project_id] UNIQUEIDENTIFIER NOT NULL,
    [term_year] INT NOT NULL,
    [term_number] INT NOT NULL,
    [total_budget] BIGINT NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [project_terms_status_df] DEFAULT 'ACTIVE',
    [notes] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [project_terms_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [project_terms_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [project_terms_project_id_term_year_key] UNIQUE NONCLUSTERED ([project_id],[term_year]),
    CONSTRAINT [project_terms_project_id_term_number_key] UNIQUE NONCLUSTERED ([project_id],[term_number])
);

-- CreateTable
CREATE TABLE [dbo].[project_term_institutions] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [project_term_id] UNIQUEIDENTIFIER NOT NULL,
    [institution_id] UNIQUEIDENTIFIER NOT NULL,
    [role] NVARCHAR(20) NOT NULL,
    [project_budget] BIGINT NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [project_term_institutions_status_df] DEFAULT 'ACTIVE',
    [notes] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [project_term_institutions_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [project_term_institutions_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [project_term_institutions_project_term_id_institution_id_key] UNIQUE NONCLUSTERED ([project_term_id],[institution_id])
);

-- CreateTable
CREATE TABLE [dbo].[fee_policies] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [policy_name] NVARCHAR(200) NOT NULL,
    [policy_version] INT NOT NULL,
    [description] NVARCHAR(max),
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [fee_policies_status_df] DEFAULT 'DRAFT',
    [effective_from] DATE,
    [effective_to] DATE,
    [created_by] UNIQUEIDENTIFIER,
    [approved_by] UNIQUEIDENTIFIER,
    [approved_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [fee_policies_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [fee_policies_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[fee_policy_budget_rules] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [policy_id] UNIQUEIDENTIFIER NOT NULL,
    [budget_min] BIGINT NOT NULL,
    [budget_max] BIGINT,
    [base_rate] DECIMAL(7,5),
    [base_amount] BIGINT,
    [priority] INT NOT NULL CONSTRAINT [fee_policy_budget_rules_priority_df] DEFAULT 0,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [fee_policy_budget_rules_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [fee_policy_budget_rules_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[fee_policy_institution_count_rules] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [policy_id] UNIQUEIDENTIFIER NOT NULL,
    [count_min] INT NOT NULL,
    [count_max] INT,
    [additional_rate] DECIMAL(7,5),
    [additional_amount] BIGINT,
    [priority] INT NOT NULL CONSTRAINT [fee_policy_institution_count_rules_priority_df] DEFAULT 0,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [fee_policy_institution_count_rules_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [fee_policy_institution_count_rules_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[fee_policy_project_type_rules] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [policy_id] UNIQUEIDENTIFIER NOT NULL,
    [project_type] NVARCHAR(100) NOT NULL,
    [multiplier] DECIMAL(6,4) NOT NULL CONSTRAINT [fee_policy_project_type_rules_multiplier_df] DEFAULT 1.0,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [fee_policy_project_type_rules_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [fee_policy_project_type_rules_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fee_policy_project_type_rules_policy_id_project_type_key] UNIQUE NONCLUSTERED ([policy_id],[project_type])
);

-- CreateTable
CREATE TABLE [dbo].[fee_policy_settlement_type_rules] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [policy_id] UNIQUEIDENTIFIER NOT NULL,
    [settlement_type] NVARCHAR(50) NOT NULL,
    [multiplier] DECIMAL(6,4) NOT NULL CONSTRAINT [fee_policy_settlement_type_rules_multiplier_df] DEFAULT 1.0,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [fee_policy_settlement_type_rules_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [fee_policy_settlement_type_rules_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fee_policy_settlement_type_rules_policy_id_settlement_type_key] UNIQUE NONCLUSTERED ([policy_id],[settlement_type])
);

-- CreateTable
CREATE TABLE [dbo].[fee_policy_company_class_rules] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [policy_id] UNIQUEIDENTIFIER NOT NULL,
    [company_classification] NVARCHAR(100) NOT NULL,
    [multiplier] DECIMAL(6,4) NOT NULL CONSTRAINT [fee_policy_company_class_rules_multiplier_df] DEFAULT 1.0,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [fee_policy_company_class_rules_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [fee_policy_company_class_rules_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fee_policy_company_class_rules_policy_id_company_classification_key] UNIQUE NONCLUSTERED ([policy_id],[company_classification])
);

-- CreateTable
CREATE TABLE [dbo].[fee_policy_billing_ratio_rules] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [policy_id] UNIQUEIDENTIFIER NOT NULL,
    [term_number] INT NOT NULL,
    [billing_ratio] DECIMAL(6,4) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [fee_policy_billing_ratio_rules_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [fee_policy_billing_ratio_rules_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fee_policy_billing_ratio_rules_policy_id_term_number_key] UNIQUE NONCLUSTERED ([policy_id],[term_number])
);

-- CreateTable
CREATE TABLE [dbo].[fee_policy_exemption_rules] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [policy_id] UNIQUEIDENTIFIER NOT NULL,
    [rule_name] NVARCHAR(200) NOT NULL,
    [conditions] NVARCHAR(max) NOT NULL,
    [priority] INT NOT NULL CONSTRAINT [fee_policy_exemption_rules_priority_df] DEFAULT 0,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [fee_policy_exemption_rules_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [fee_policy_exemption_rules_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[fee_policy_exception_rules] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [policy_id] UNIQUEIDENTIFIER NOT NULL,
    [rule_name] NVARCHAR(200) NOT NULL,
    [target_project_id] UNIQUEIDENTIFIER,
    [target_institution_id] UNIQUEIDENTIFIER,
    [conditions] NVARCHAR(max),
    [override_rate] DECIMAL(7,5),
    [override_amount] BIGINT,
    [priority] INT NOT NULL CONSTRAINT [fee_policy_exception_rules_priority_df] DEFAULT 0,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [fee_policy_exception_rules_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [fee_policy_exception_rules_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[policy_change_histories] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [fee_policy_id] UNIQUEIDENTIFIER NOT NULL,
    [change_type] NVARCHAR(50) NOT NULL,
    [change_description] NVARCHAR(max),
    [old_policy_snapshot] NVARCHAR(max),
    [new_policy_snapshot] NVARCHAR(max),
    [changed_by] UNIQUEIDENTIFIER NOT NULL,
    [changed_at] DATETIME2 NOT NULL CONSTRAINT [policy_change_histories_changed_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [policy_change_histories_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[term_fees] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [project_term_institution_id] UNIQUEIDENTIFIER NOT NULL,
    [fee_policy_id] UNIQUEIDENTIFIER NOT NULL,
    [project_budget] BIGINT NOT NULL,
    [standard_fee] BIGINT NOT NULL,
    [applied_fee] BIGINT,
    [billed_fee] BIGINT,
    [cumulative_fee] BIGINT,
    [is_fee_exempt] BIT NOT NULL CONSTRAINT [term_fees_is_fee_exempt_df] DEFAULT 0,
    [exemption_reason] NVARCHAR(max),
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [term_fees_status_df] DEFAULT 'DRAFT',
    [confirmed_by] UNIQUEIDENTIFIER,
    [confirmed_at] DATETIME2,
    [notes] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [term_fees_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [term_fees_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [term_fees_project_term_institution_id_key] UNIQUE NONCLUSTERED ([project_term_institution_id])
);

-- CreateTable
CREATE TABLE [dbo].[unclaimed_fees] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [project_term_institution_id] UNIQUEIDENTIFIER NOT NULL,
    [fiscal_year] INT NOT NULL,
    [billed_fee] BIGINT NOT NULL,
    [actually_billed] BIGINT NOT NULL CONSTRAINT [unclaimed_fees_actually_billed_df] DEFAULT 0,
    [unclaimed_amount] BIGINT NOT NULL,
    [carried_over_from_id] UNIQUEIDENTIFIER,
    [carried_over_amount] BIGINT NOT NULL CONSTRAINT [unclaimed_fees_carried_over_amount_df] DEFAULT 0,
    [cumulative_unclaimed] BIGINT NOT NULL,
    [final_claim_amount] BIGINT,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [unclaimed_fees_status_df] DEFAULT 'UNCLAIMED',
    [created_at] DATETIME2 NOT NULL CONSTRAINT [unclaimed_fees_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [unclaimed_fees_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [unclaimed_fees_project_term_institution_id_fiscal_year_key] UNIQUE NONCLUSTERED ([project_term_institution_id],[fiscal_year])
);

-- CreateTable
CREATE TABLE [dbo].[claims] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [project_term_institution_id] UNIQUEIDENTIFIER NOT NULL,
    [term_fee_id] UNIQUEIDENTIFIER,
    [claim_date] DATE NOT NULL,
    [claim_amount] BIGINT NOT NULL,
    [claim_type] NVARCHAR(50),
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [claims_status_df] DEFAULT 'DRAFT',
    [notes] NVARCHAR(max),
    [created_by] UNIQUEIDENTIFIER,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [claims_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [claims_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[receivables] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [claim_id] UNIQUEIDENTIFIER NOT NULL,
    [project_term_institution_id] UNIQUEIDENTIFIER NOT NULL,
    [billed_amount] BIGINT NOT NULL,
    [collected_amount] BIGINT NOT NULL CONSTRAINT [receivables_collected_amount_df] DEFAULT 0,
    [outstanding_amount] BIGINT NOT NULL,
    [due_date] DATE,
    [is_long_overdue] BIT NOT NULL CONSTRAINT [receivables_is_long_overdue_df] DEFAULT 0,
    [overdue_days] INT NOT NULL CONSTRAINT [receivables_overdue_days_df] DEFAULT 0,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [receivables_status_df] DEFAULT 'OUTSTANDING',
    [notes] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [receivables_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [receivables_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[payment_histories] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [receivable_id] UNIQUEIDENTIFIER NOT NULL,
    [payment_date] DATE NOT NULL,
    [payment_amount] BIGINT NOT NULL,
    [payment_method] NVARCHAR(50),
    [reference_number] NVARCHAR(100),
    [memo] NVARCHAR(max),
    [created_by] UNIQUEIDENTIFIER,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [payment_histories_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [payment_histories_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[tax_invoice_templates] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [template_name] NVARCHAR(200) NOT NULL,
    [template_content] NVARCHAR(max) NOT NULL,
    [is_default] BIT NOT NULL CONSTRAINT [tax_invoice_templates_is_default_df] DEFAULT 0,
    [created_by] UNIQUEIDENTIFIER,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [tax_invoice_templates_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [tax_invoice_templates_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[tax_invoices] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [project_term_institution_id] UNIQUEIDENTIFIER NOT NULL,
    [claim_id] UNIQUEIDENTIFIER,
    [template_id] UNIQUEIDENTIFIER,
    [invoice_number] NVARCHAR(100) NOT NULL,
    [issue_date] DATE NOT NULL,
    [supply_amount] BIGINT NOT NULL,
    [tax_amount] BIGINT NOT NULL,
    [total_amount] BIGINT NOT NULL,
    [buyer_name] NVARCHAR(200) NOT NULL,
    [buyer_business_number] NVARCHAR(20) NOT NULL,
    [buyer_address] NVARCHAR(max),
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [tax_invoices_status_df] DEFAULT 'DRAFT',
    [pdf_path] NVARCHAR(max),
    [issued_by] UNIQUEIDENTIFIER,
    [cancelled_at] DATETIME2,
    [cancel_reason] NVARCHAR(max),
    [original_invoice_id] UNIQUEIDENTIFIER,
    [notes] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [tax_invoices_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [tax_invoices_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [tax_invoices_invoice_number_key] UNIQUE NONCLUSTERED ([invoice_number])
);

-- CreateTable
CREATE TABLE [dbo].[tax_invoice_histories] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tax_invoice_id] UNIQUEIDENTIFIER NOT NULL,
    [action] NVARCHAR(50) NOT NULL,
    [old_status] NVARCHAR(20),
    [new_status] NVARCHAR(20),
    [old_values] NVARCHAR(max),
    [reason] NVARCHAR(max),
    [changed_by] UNIQUEIDENTIFIER NOT NULL,
    [changed_at] DATETIME2 NOT NULL CONSTRAINT [tax_invoice_histories_changed_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [tax_invoice_histories_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[settlements] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [project_term_institution_id] UNIQUEIDENTIFIER NOT NULL,
    [settlement_amount] BIGINT NOT NULL,
    [additional_amount] BIGINT NOT NULL CONSTRAINT [settlements_additional_amount_df] DEFAULT 0,
    [fee_amount] BIGINT NOT NULL,
    [scheduled_amount] BIGINT,
    [paid_amount] BIGINT NOT NULL CONSTRAINT [settlements_paid_amount_df] DEFAULT 0,
    [outstanding_amount] BIGINT NOT NULL,
    [settlement_date] DATE,
    [payment_due_date] DATE,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [settlements_status_df] DEFAULT 'SCHEDULED',
    [notes] NVARCHAR(max),
    [created_by] UNIQUEIDENTIFIER,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [settlements_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [settlements_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[settlement_histories] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [settlement_id] UNIQUEIDENTIFIER NOT NULL,
    [action] NVARCHAR(100) NOT NULL,
    [old_values] NVARCHAR(max),
    [new_values] NVARCHAR(max),
    [changed_by] UNIQUEIDENTIFIER NOT NULL,
    [changed_at] DATETIME2 NOT NULL CONSTRAINT [settlement_histories_changed_at_df] DEFAULT CURRENT_TIMESTAMP,
    [notes] NVARCHAR(max),
    CONSTRAINT [settlement_histories_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[email_batches] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [batch_name] NVARCHAR(200) NOT NULL,
    [email_type] NVARCHAR(100) NOT NULL,
    [project_term_id] UNIQUEIDENTIFIER,
    [total_count] INT NOT NULL CONSTRAINT [email_batches_total_count_df] DEFAULT 0,
    [sent_count] INT NOT NULL CONSTRAINT [email_batches_sent_count_df] DEFAULT 0,
    [failed_count] INT NOT NULL CONSTRAINT [email_batches_failed_count_df] DEFAULT 0,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [email_batches_status_df] DEFAULT 'PENDING',
    [started_at] DATETIME2,
    [completed_at] DATETIME2,
    [created_by] UNIQUEIDENTIFIER,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [email_batches_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [email_batches_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[email_logs] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [batch_id] UNIQUEIDENTIFIER,
    [email_type] NVARCHAR(100) NOT NULL,
    [project_term_id] UNIQUEIDENTIFIER,
    [institution_id] UNIQUEIDENTIFIER,
    [company_contact_id] UNIQUEIDENTIFIER,
    [institution_contact_id] UNIQUEIDENTIFIER,
    [to_email] NVARCHAR(255) NOT NULL,
    [subject] NVARCHAR(500) NOT NULL,
    [body] NVARCHAR(max) NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [email_logs_status_df] DEFAULT 'PENDING',
    [sent_at] DATETIME2,
    [error_message] NVARCHAR(max),
    [sent_by] UNIQUEIDENTIFIER,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [email_logs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [email_logs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_role_permissions_role] ON [dbo].[role_permissions]([role], [resource_type]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_audit_logs_user_id] ON [dbo].[audit_logs]([user_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_audit_logs_resource] ON [dbo].[audit_logs]([resource_type], [resource_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_audit_logs_created_at] ON [dbo].[audit_logs]([created_at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_project_terms_project_id] ON [dbo].[project_terms]([project_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_project_terms_year] ON [dbo].[project_terms]([term_year], [project_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_pti_project_term_id] ON [dbo].[project_term_institutions]([project_term_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_pti_institution_id] ON [dbo].[project_term_institutions]([institution_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_pti_term_institution] ON [dbo].[project_term_institutions]([project_term_id], [institution_id], [role]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_fee_policies_status] ON [dbo].[fee_policies]([status], [effective_from], [effective_to]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_term_fees_pti_id] ON [dbo].[term_fees]([project_term_institution_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_term_fees_policy_id] ON [dbo].[term_fees]([fee_policy_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_unclaimed_fees_pti_id] ON [dbo].[unclaimed_fees]([project_term_institution_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_unclaimed_fees_fiscal_year] ON [dbo].[unclaimed_fees]([fiscal_year]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_claims_pti_id] ON [dbo].[claims]([project_term_institution_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_claims_term_fee_id] ON [dbo].[claims]([term_fee_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_receivables_claim_id] ON [dbo].[receivables]([claim_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_receivables_status] ON [dbo].[receivables]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_payment_histories_receivable_id] ON [dbo].[payment_histories]([receivable_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_tax_invoices_pti_id] ON [dbo].[tax_invoices]([project_term_institution_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_tax_invoices_status] ON [dbo].[tax_invoices]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_tax_invoice_histories_invoice_id] ON [dbo].[tax_invoice_histories]([tax_invoice_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_settlements_pti_id] ON [dbo].[settlements]([project_term_institution_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_settlements_status] ON [dbo].[settlements]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_email_logs_batch_id] ON [dbo].[email_logs]([batch_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_email_logs_institution_id] ON [dbo].[email_logs]([institution_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_email_logs_status] ON [dbo].[email_logs]([status]);

-- AddForeignKey
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[company_contacts] ADD CONSTRAINT [company_contacts_company_id_fkey] FOREIGN KEY ([company_id]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[company_classifications] ADD CONSTRAINT [company_classifications_company_id_fkey] FOREIGN KEY ([company_id]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[company_classifications] ADD CONSTRAINT [company_classifications_project_term_id_fkey] FOREIGN KEY ([project_term_id]) REFERENCES [dbo].[project_terms]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[company_classifications] ADD CONSTRAINT [company_classifications_created_by_fkey] FOREIGN KEY ([created_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[company_classification_histories] ADD CONSTRAINT [company_classification_histories_changed_by_fkey] FOREIGN KEY ([changed_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[institutions] ADD CONSTRAINT [institutions_company_id_fkey] FOREIGN KEY ([company_id]) REFERENCES [dbo].[companies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[institution_contacts] ADD CONSTRAINT [institution_contacts_institution_id_fkey] FOREIGN KEY ([institution_id]) REFERENCES [dbo].[institutions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[projects] ADD CONSTRAINT [projects_created_by_fkey] FOREIGN KEY ([created_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[project_terms] ADD CONSTRAINT [project_terms_project_id_fkey] FOREIGN KEY ([project_id]) REFERENCES [dbo].[projects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[project_term_institutions] ADD CONSTRAINT [project_term_institutions_project_term_id_fkey] FOREIGN KEY ([project_term_id]) REFERENCES [dbo].[project_terms]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[project_term_institutions] ADD CONSTRAINT [project_term_institutions_institution_id_fkey] FOREIGN KEY ([institution_id]) REFERENCES [dbo].[institutions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[fee_policies] ADD CONSTRAINT [fee_policies_created_by_fkey] FOREIGN KEY ([created_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[fee_policies] ADD CONSTRAINT [fee_policies_approved_by_fkey] FOREIGN KEY ([approved_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[fee_policy_budget_rules] ADD CONSTRAINT [fee_policy_budget_rules_policy_id_fkey] FOREIGN KEY ([policy_id]) REFERENCES [dbo].[fee_policies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[fee_policy_institution_count_rules] ADD CONSTRAINT [fee_policy_institution_count_rules_policy_id_fkey] FOREIGN KEY ([policy_id]) REFERENCES [dbo].[fee_policies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[fee_policy_project_type_rules] ADD CONSTRAINT [fee_policy_project_type_rules_policy_id_fkey] FOREIGN KEY ([policy_id]) REFERENCES [dbo].[fee_policies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[fee_policy_settlement_type_rules] ADD CONSTRAINT [fee_policy_settlement_type_rules_policy_id_fkey] FOREIGN KEY ([policy_id]) REFERENCES [dbo].[fee_policies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[fee_policy_company_class_rules] ADD CONSTRAINT [fee_policy_company_class_rules_policy_id_fkey] FOREIGN KEY ([policy_id]) REFERENCES [dbo].[fee_policies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[fee_policy_billing_ratio_rules] ADD CONSTRAINT [fee_policy_billing_ratio_rules_policy_id_fkey] FOREIGN KEY ([policy_id]) REFERENCES [dbo].[fee_policies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[fee_policy_exemption_rules] ADD CONSTRAINT [fee_policy_exemption_rules_policy_id_fkey] FOREIGN KEY ([policy_id]) REFERENCES [dbo].[fee_policies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[fee_policy_exception_rules] ADD CONSTRAINT [fee_policy_exception_rules_policy_id_fkey] FOREIGN KEY ([policy_id]) REFERENCES [dbo].[fee_policies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[fee_policy_exception_rules] ADD CONSTRAINT [fee_policy_exception_rules_target_project_id_fkey] FOREIGN KEY ([target_project_id]) REFERENCES [dbo].[projects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[fee_policy_exception_rules] ADD CONSTRAINT [fee_policy_exception_rules_target_institution_id_fkey] FOREIGN KEY ([target_institution_id]) REFERENCES [dbo].[institutions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[policy_change_histories] ADD CONSTRAINT [policy_change_histories_fee_policy_id_fkey] FOREIGN KEY ([fee_policy_id]) REFERENCES [dbo].[fee_policies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[policy_change_histories] ADD CONSTRAINT [policy_change_histories_changed_by_fkey] FOREIGN KEY ([changed_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[term_fees] ADD CONSTRAINT [term_fees_project_term_institution_id_fkey] FOREIGN KEY ([project_term_institution_id]) REFERENCES [dbo].[project_term_institutions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[term_fees] ADD CONSTRAINT [term_fees_fee_policy_id_fkey] FOREIGN KEY ([fee_policy_id]) REFERENCES [dbo].[fee_policies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[term_fees] ADD CONSTRAINT [term_fees_confirmed_by_fkey] FOREIGN KEY ([confirmed_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[unclaimed_fees] ADD CONSTRAINT [unclaimed_fees_project_term_institution_id_fkey] FOREIGN KEY ([project_term_institution_id]) REFERENCES [dbo].[project_term_institutions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[unclaimed_fees] ADD CONSTRAINT [unclaimed_fees_carried_over_from_id_fkey] FOREIGN KEY ([carried_over_from_id]) REFERENCES [dbo].[unclaimed_fees]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[claims] ADD CONSTRAINT [claims_project_term_institution_id_fkey] FOREIGN KEY ([project_term_institution_id]) REFERENCES [dbo].[project_term_institutions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[claims] ADD CONSTRAINT [claims_term_fee_id_fkey] FOREIGN KEY ([term_fee_id]) REFERENCES [dbo].[term_fees]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[claims] ADD CONSTRAINT [claims_created_by_fkey] FOREIGN KEY ([created_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[receivables] ADD CONSTRAINT [receivables_claim_id_fkey] FOREIGN KEY ([claim_id]) REFERENCES [dbo].[claims]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[receivables] ADD CONSTRAINT [receivables_project_term_institution_id_fkey] FOREIGN KEY ([project_term_institution_id]) REFERENCES [dbo].[project_term_institutions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[payment_histories] ADD CONSTRAINT [payment_histories_receivable_id_fkey] FOREIGN KEY ([receivable_id]) REFERENCES [dbo].[receivables]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[payment_histories] ADD CONSTRAINT [payment_histories_created_by_fkey] FOREIGN KEY ([created_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[tax_invoice_templates] ADD CONSTRAINT [tax_invoice_templates_created_by_fkey] FOREIGN KEY ([created_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[tax_invoices] ADD CONSTRAINT [tax_invoices_project_term_institution_id_fkey] FOREIGN KEY ([project_term_institution_id]) REFERENCES [dbo].[project_term_institutions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[tax_invoices] ADD CONSTRAINT [tax_invoices_claim_id_fkey] FOREIGN KEY ([claim_id]) REFERENCES [dbo].[claims]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[tax_invoices] ADD CONSTRAINT [tax_invoices_template_id_fkey] FOREIGN KEY ([template_id]) REFERENCES [dbo].[tax_invoice_templates]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[tax_invoices] ADD CONSTRAINT [tax_invoices_issued_by_fkey] FOREIGN KEY ([issued_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[tax_invoices] ADD CONSTRAINT [tax_invoices_original_invoice_id_fkey] FOREIGN KEY ([original_invoice_id]) REFERENCES [dbo].[tax_invoices]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[tax_invoice_histories] ADD CONSTRAINT [tax_invoice_histories_tax_invoice_id_fkey] FOREIGN KEY ([tax_invoice_id]) REFERENCES [dbo].[tax_invoices]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[tax_invoice_histories] ADD CONSTRAINT [tax_invoice_histories_changed_by_fkey] FOREIGN KEY ([changed_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[settlements] ADD CONSTRAINT [settlements_project_term_institution_id_fkey] FOREIGN KEY ([project_term_institution_id]) REFERENCES [dbo].[project_term_institutions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[settlements] ADD CONSTRAINT [settlements_created_by_fkey] FOREIGN KEY ([created_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[settlement_histories] ADD CONSTRAINT [settlement_histories_settlement_id_fkey] FOREIGN KEY ([settlement_id]) REFERENCES [dbo].[settlements]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[settlement_histories] ADD CONSTRAINT [settlement_histories_changed_by_fkey] FOREIGN KEY ([changed_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[email_batches] ADD CONSTRAINT [email_batches_project_term_id_fkey] FOREIGN KEY ([project_term_id]) REFERENCES [dbo].[project_terms]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[email_batches] ADD CONSTRAINT [email_batches_created_by_fkey] FOREIGN KEY ([created_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[email_logs] ADD CONSTRAINT [email_logs_batch_id_fkey] FOREIGN KEY ([batch_id]) REFERENCES [dbo].[email_batches]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[email_logs] ADD CONSTRAINT [email_logs_project_term_id_fkey] FOREIGN KEY ([project_term_id]) REFERENCES [dbo].[project_terms]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[email_logs] ADD CONSTRAINT [email_logs_institution_id_fkey] FOREIGN KEY ([institution_id]) REFERENCES [dbo].[institutions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[email_logs] ADD CONSTRAINT [email_logs_company_contact_id_fkey] FOREIGN KEY ([company_contact_id]) REFERENCES [dbo].[company_contacts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[email_logs] ADD CONSTRAINT [email_logs_institution_contact_id_fkey] FOREIGN KEY ([institution_contact_id]) REFERENCES [dbo].[institution_contacts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[email_logs] ADD CONSTRAINT [email_logs_sent_by_fkey] FOREIGN KEY ([sent_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
