-- AlterTable
ALTER TABLE "User" ADD COLUMN     "xAccessToken" TEXT,
ADD COLUMN     "xRefreshToken" TEXT,
ADD COLUMN     "xTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "xUsername" TEXT;

-- CreateTable
CREATE TABLE "ContentItemPost" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalUrl" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentItemPost_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ContentItemPost" ADD CONSTRAINT "ContentItemPost_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
