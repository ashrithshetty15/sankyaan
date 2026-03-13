-- Add Magic Formula and CANSLIM score columns to stock_quality_scores table

ALTER TABLE stock_quality_scores 
ADD COLUMN IF NOT EXISTS magic_formula_score NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS canslim_score NUMERIC(5,2);

-- Add comment for documentation
COMMENT ON COLUMN stock_quality_scores.magic_formula_score IS 'Joel Greenblatt Magic Formula Score (0-100): Combines Earnings Yield and Return on Capital';
COMMENT ON COLUMN stock_quality_scores.canslim_score IS 'William O''Neil CANSLIM Score (0-100): Growth + Leadership + Institutional';

-- Update existing records to NULL (will be recalculated)
-- No UPDATE needed since columns default to NULL
