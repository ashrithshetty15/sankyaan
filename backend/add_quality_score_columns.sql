-- Add missing columns to stock_quality_scores table

ALTER TABLE stock_quality_scores
ADD COLUMN IF NOT EXISTS financial_health_score INTEGER,
ADD COLUMN IF NOT EXISTS management_quality_score INTEGER;

-- Update comments
COMMENT ON COLUMN stock_quality_scores.piotroski_score IS 'Piotroski F-Score (0-9, higher is better)';
COMMENT ON COLUMN stock_quality_scores.altman_z_score IS 'Altman Z-Score for bankruptcy risk prediction';
COMMENT ON COLUMN stock_quality_scores.earnings_quality_score IS 'Quality of earnings score (0-100)';
COMMENT ON COLUMN stock_quality_scores.financial_health_score IS 'Overall financial health score (0-100)';
COMMENT ON COLUMN stock_quality_scores.management_quality_score IS 'Management quality and efficiency score (0-100)';
COMMENT ON COLUMN stock_quality_scores.overall_quality_score IS 'Weighted overall quality score (0-100)';
