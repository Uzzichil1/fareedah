-- AlterTable
ALTER TABLE "Bundle" ADD COLUMN     "offerCents" INTEGER;

-- At most one OPEN bundle per (buyer, seller); makes find-or-create race-safe.
CREATE UNIQUE INDEX "Bundle_buyer_seller_open_key"
  ON "Bundle" ("buyerId", "storefrontId")
  WHERE status = 'OPEN';
