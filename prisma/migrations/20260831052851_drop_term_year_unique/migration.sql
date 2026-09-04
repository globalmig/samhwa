BEGIN TRY

BEGIN TRAN;

-- DropIndex
ALTER TABLE [dbo].[project_terms] DROP CONSTRAINT [project_terms_project_id_term_year_key];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
