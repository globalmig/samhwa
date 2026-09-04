BEGIN TRY

BEGIN TRAN;

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
