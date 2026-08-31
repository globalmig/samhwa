BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[fee_policies] ADD [funding_agency_id] UNIQUEIDENTIFIER;

-- AddForeignKey
ALTER TABLE [dbo].[fee_policies] ADD CONSTRAINT [fee_policies_funding_agency_id_fkey] FOREIGN KEY ([funding_agency_id]) REFERENCES [dbo].[funding_agencies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
