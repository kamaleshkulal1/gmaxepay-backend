-- Fix Slab.companyId to allow NULL values for global slabs
-- Run this SQL script if Sequelize sync doesn't update the constraint automatically

-- First, drop the foreign key constraint if it exists
ALTER TABLE "Slab" 
DROP CONSTRAINT IF EXISTS "Slab_companyId_fkey";

-- Make the column nullable
ALTER TABLE "Slab" 
ALTER COLUMN "companyId" DROP NOT NULL;

-- Re-add the foreign key constraint (nullable foreign keys are allowed in PostgreSQL)
ALTER TABLE "Slab" 
ADD CONSTRAINT "Slab_companyId_fkey" 
FOREIGN KEY ("companyId") 
REFERENCES "company" ("id") 
ON DELETE SET NULL 
ON UPDATE CASCADE;
