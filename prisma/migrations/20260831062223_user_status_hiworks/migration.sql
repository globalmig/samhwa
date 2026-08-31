/*
  Warnings:

  - You are about to drop the column `is_active` on the `users` table. All the data in the column will be lost.

*/
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[fee_policies] DROP CONSTRAINT [fee_policies_co_inst_addon_method_df],
[fee_policies_exemption_mode_df],
[fee_policies_fee_basis_df];

-- AlterTable
-- users.is_active 컬럼의 DEFAULT 제약(자동 생성된 이름이 Prisma diff가 예상한 이름과 달라
-- 누락됐던 것)을 먼저 제거해야 컬럼을 지울 수 있다. 이름을 몰라도 동적으로 찾아서 지운다.
DECLARE @isActiveDefault NVARCHAR(200);
SELECT @isActiveDefault = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('[dbo].[users]') AND c.name = 'is_active';
IF @isActiveDefault IS NOT NULL
BEGIN
    EXEC('ALTER TABLE [dbo].[users] DROP CONSTRAINT [' + @isActiveDefault + ']');
END

ALTER TABLE [dbo].[users] DROP COLUMN [is_active];
ALTER TABLE [dbo].[users] ADD [hiworks_email] NVARCHAR(255),
[hiworks_mail_password] NVARCHAR(255),
[phone] NVARCHAR(30),
[status] NVARCHAR(20) NOT NULL CONSTRAINT [users_status_df] DEFAULT 'ACTIVE';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
