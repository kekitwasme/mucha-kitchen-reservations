-- CreateTable
CREATE TABLE "TableGroup" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "combinedCapacity" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TableGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TableGroup_restaurantId_idx" ON "TableGroup"("restaurantId");

-- CreateIndex
CREATE INDEX "TableGroupMember_groupId_idx" ON "TableGroupMember"("groupId");

-- CreateIndex
CREATE INDEX "TableGroupMember_tableId_idx" ON "TableGroupMember"("tableId");

-- CreateIndex
CREATE UNIQUE INDEX "TableGroupMember_groupId_tableId_key" ON "TableGroupMember"("groupId", "tableId");

-- AddForeignKey
ALTER TABLE "TableGroup" ADD CONSTRAINT "TableGroup_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableGroupMember" ADD CONSTRAINT "TableGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TableGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableGroupMember" ADD CONSTRAINT "TableGroupMember_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;
