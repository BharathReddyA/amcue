-- CreateTable
CREATE TABLE "ContentMessage" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentMessage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ContentMessage" ADD CONSTRAINT "ContentMessage_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
