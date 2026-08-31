/*
  Warnings:

  - Added the required column `co_inst_addon_method` to the `fee_policies` table without a default value. This is not possible if the table is not empty.
  - Added the required column `exemption_mode` to the `fee_policies` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fee_basis` to the `fee_policies` table without a default value. This is not possible if the table is not empty.

  참고: 아래 3개 컬럼에는 마이그레이션 통과를 위한 임시 DEFAULT ''를 넣었다. 이 마이그레이션
  직후 `npm run db:seed`가 fee_policies를 포함한 전 테이블을 정리하고 mock.ts 원본으로
  다시 채우므로, 이 임시 기본값이 실제로 남아있는 행에 쓰이는 일은 없다.
*/
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[fee_policies] ADD [annual_billing_rate] DECIMAL(9,4) NOT NULL CONSTRAINT [fee_policies_annual_billing_rate_df] DEFAULT 0,
[calc_mode] NVARCHAR(20),
[co_inst_additional_rate] DECIMAL(9,4),
[co_inst_addon_method] NVARCHAR(20) NOT NULL CONSTRAINT [fee_policies_co_inst_addon_method_df] DEFAULT '',
[co_inst_first_rate] DECIMAL(9,4),
[default_settlement_type] NVARCHAR(20),
[exclude_lead_from_calc] BIT NOT NULL CONSTRAINT [fee_policies_exclude_lead_from_calc_df] DEFAULT 0,
[exempt_custom_rate] DECIMAL(9,4),
[exemption_mode] NVARCHAR(20) NOT NULL CONSTRAINT [fee_policies_exemption_mode_df] DEFAULT '',
[fee_basis] NVARCHAR(20) NOT NULL CONSTRAINT [fee_policies_fee_basis_df] DEFAULT '',
[has_autonomy_track] BIT NOT NULL CONSTRAINT [fee_policies_has_autonomy_track_df] DEFAULT 0,
[legacy_transition_note] NVARCHAR(max),
[minimum_fee] BIGINT,
[per_institution_minimum_fee] BIGINT,
[program_type] NVARCHAR(20),
[standard_rate] DECIMAL(9,4) NOT NULL CONSTRAINT [fee_policies_standard_rate_df] DEFAULT 0,
[version_label] NVARCHAR(50);

-- CreateTable
CREATE TABLE [dbo].[fee_policy_exempt_grades] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [policy_id] UNIQUEIDENTIFIER NOT NULL,
    [grade] NVARCHAR(10) NOT NULL,
    CONSTRAINT [fee_policy_exempt_grades_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [fee_policy_exempt_grades_policy_id_grade_key] UNIQUE NONCLUSTERED ([policy_id],[grade])
);

-- AddForeignKey
ALTER TABLE [dbo].[fee_policy_exempt_grades] ADD CONSTRAINT [fee_policy_exempt_grades_policy_id_fkey] FOREIGN KEY ([policy_id]) REFERENCES [dbo].[fee_policies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
