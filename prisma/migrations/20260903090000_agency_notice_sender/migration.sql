BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[funding_agencies] ADD [notice_sender_email] NVARCHAR(255),
[notice_sender_mail_password] NVARCHAR(255);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
