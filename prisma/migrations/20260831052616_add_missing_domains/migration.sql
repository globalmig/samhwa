BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[fee_policies] ADD [extra_data] NVARCHAR(max);

-- AlterTable
ALTER TABLE [dbo].[project_term_institutions] ADD [extra_data] NVARCHAR(max);

-- AlterTable
ALTER TABLE [dbo].[projects] ADD [extra_data] NVARCHAR(max),
[funding_agency_id] UNIQUEIDENTIFIER;

-- AlterTable
ALTER TABLE [dbo].[term_fees] ADD [extra_data] NVARCHAR(max);

-- CreateTable
CREATE TABLE [dbo].[funding_agencies] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [short_name] NVARCHAR(50) NOT NULL,
    [code] NVARCHAR(50) NOT NULL,
    [contact_name] NVARCHAR(100) NOT NULL,
    [contact_email] NVARCHAR(255) NOT NULL,
    [contact_phone] NVARCHAR(30) NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [funding_agencies_status_df] DEFAULT 'ACTIVE',
    [registered_at] DATE NOT NULL,
    [website] NVARCHAR(255),
    [notice_recipient_scope] NVARCHAR(30) NOT NULL,
    [auto_detect_by_lead_institution] BIT NOT NULL CONSTRAINT [funding_agencies_auto_detect_by_lead_institution_df] DEFAULT 0,
    [affiliated_institution_names] NVARCHAR(max),
    [special_notes] NVARCHAR(max),
    [guide_content] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [funding_agencies_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [funding_agencies_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [funding_agencies_short_name_key] UNIQUE NONCLUSTERED ([short_name])
);

-- CreateTable
CREATE TABLE [dbo].[agency_notice_templates] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [funding_agency_id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [content] NVARCHAR(max) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [agency_notice_templates_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [agency_notice_templates_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[fee_invoice_templates] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [category] NVARCHAR(20) NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [is_default] BIT NOT NULL CONSTRAINT [fee_invoice_templates_is_default_df] DEFAULT 0,
    [content] NVARCHAR(max) NOT NULL,
    [default_attachments] NVARCHAR(max),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [fee_invoice_templates_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [fee_invoice_templates_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[simple_notice_templates] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [category] NVARCHAR(30) NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [is_default] BIT NOT NULL CONSTRAINT [simple_notice_templates_is_default_df] DEFAULT 0,
    [content] NVARCHAR(max) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [simple_notice_templates_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [simple_notice_templates_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[standard_attachments] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [file_data_url] NVARCHAR(max),
    [enabled_by_category] NVARCHAR(max),
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [standard_attachments_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[company_info] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [address_line] NVARCHAR(500) NOT NULL,
    [tel] NVARCHAR(30) NOT NULL,
    [fax] NVARCHAR(30) NOT NULL,
    [prepared_by] NVARCHAR(100) NOT NULL,
    [ceo_name] NVARCHAR(100) NOT NULL,
    [doc_number_prefix] NVARCHAR(50) NOT NULL,
    [manager_name] NVARCHAR(100) NOT NULL,
    [manager_email] NVARCHAR(255) NOT NULL,
    [manager_phone] NVARCHAR(30) NOT NULL,
    [deposit_account_note] NVARCHAR(500) NOT NULL,
    [stamp_data_url] NVARCHAR(max),
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [company_info_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[notices] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [title] NVARCHAR(300) NOT NULL,
    [content] NVARCHAR(max) NOT NULL,
    [author_name] NVARCHAR(100) NOT NULL,
    [author_id] UNIQUEIDENTIFIER,
    [author_role] NVARCHAR(20) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [notices_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [notices_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[term_fee_calcs] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [project_id] UNIQUEIDENTIFIER NOT NULL,
    [project_number] NVARCHAR(100) NOT NULL,
    [project_name] NVARCHAR(500) NOT NULL,
    [funding_agency_id] UNIQUEIDENTIFIER NOT NULL,
    [term_year] INT NOT NULL,
    [term_number] INT NOT NULL,
    [stage_number] INT NOT NULL,
    [work_type] NVARCHAR(20) NOT NULL,
    [total_cash_budget] BIGINT NOT NULL,
    [co_inst_count] INT NOT NULL,
    [base_fee] BIGINT NOT NULL,
    [addon_fee] BIGINT NOT NULL,
    [standard_fee] BIGINT NOT NULL,
    [non_exempt_cash_budget] BIGINT NOT NULL,
    [non_exempt_co_inst_count] INT NOT NULL,
    [non_exempt_base_fee] BIGINT NOT NULL,
    [non_exempt_addon_fee] BIGINT NOT NULL,
    [general_fee] BIGINT NOT NULL,
    [exempt_fee_total] BIGINT NOT NULL,
    [exempt_breakdown] NVARCHAR(max) NOT NULL,
    [calculated_fee] BIGINT NOT NULL,
    [general_calc_fee] BIGINT NOT NULL,
    [general_billing_fee] BIGINT NOT NULL,
    [general_unclaimed_fee] BIGINT NOT NULL,
    [carried_over_unclaimed] BIGINT NOT NULL,
    [total_billing_fee] BIGINT NOT NULL,
    [overrides] NVARCHAR(max) NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [term_fee_calcs_status_df] DEFAULT 'DRAFT',
    [created_at] DATETIME2 NOT NULL CONSTRAINT [term_fee_calcs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2,
    CONSTRAINT [term_fee_calcs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[project_issues] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [project_id] UNIQUEIDENTIFIER NOT NULL,
    [content] NVARCHAR(max) NOT NULL,
    [author] NVARCHAR(100) NOT NULL,
    [priority] NVARCHAR(10) NOT NULL CONSTRAINT [project_issues_priority_df] DEFAULT 'MEDIUM',
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [project_issues_status_df] DEFAULT 'OPEN',
    [recipient_groups] NVARCHAR(max),
    [recipient_user_ids] NVARCHAR(max),
    [institution_name] NVARCHAR(200),
    [no_institution] BIT NOT NULL CONSTRAINT [project_issues_no_institution_df] DEFAULT 0,
    [term] INT,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [project_issues_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [project_issues_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[notification_state] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [user_id] UNIQUEIDENTIFIER NOT NULL,
    [read_ids] NVARCHAR(max) NOT NULL,
    [dismissed_ids] NVARCHAR(max) NOT NULL,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [notification_state_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [notification_state_user_id_key] UNIQUE NONCLUSTERED ([user_id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_term_fee_calcs_project_id] ON [dbo].[term_fee_calcs]([project_id]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [idx_project_issues_project_id] ON [dbo].[project_issues]([project_id]);

-- AddForeignKey
ALTER TABLE [dbo].[projects] ADD CONSTRAINT [projects_funding_agency_id_fkey] FOREIGN KEY ([funding_agency_id]) REFERENCES [dbo].[funding_agencies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[agency_notice_templates] ADD CONSTRAINT [agency_notice_templates_funding_agency_id_fkey] FOREIGN KEY ([funding_agency_id]) REFERENCES [dbo].[funding_agencies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[notices] ADD CONSTRAINT [notices_author_id_fkey] FOREIGN KEY ([author_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[term_fee_calcs] ADD CONSTRAINT [term_fee_calcs_project_id_fkey] FOREIGN KEY ([project_id]) REFERENCES [dbo].[projects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[term_fee_calcs] ADD CONSTRAINT [term_fee_calcs_funding_agency_id_fkey] FOREIGN KEY ([funding_agency_id]) REFERENCES [dbo].[funding_agencies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[project_issues] ADD CONSTRAINT [project_issues_project_id_fkey] FOREIGN KEY ([project_id]) REFERENCES [dbo].[projects]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[notification_state] ADD CONSTRAINT [notification_state_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
