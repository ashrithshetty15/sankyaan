-- Add sample PE ratios for testing
-- You can replace these with actual PE ratio data

-- Banks typically have lower PE ratios (15-25)
UPDATE hdfc_portfolio
SET pe_ratio = 18.5
WHERE industry_rating = 'Banks' AND pe_ratio IS NULL;

-- IT sector typically has higher PE ratios (25-35)
UPDATE hdfc_portfolio
SET pe_ratio = 28.3
WHERE industry_rating = 'IT - Software' AND pe_ratio IS NULL;

-- Finance sector (20-30)
UPDATE hdfc_portfolio
SET pe_ratio = 22.7
WHERE industry_rating = 'Finance' AND pe_ratio IS NULL;

-- Automobiles (15-25)
UPDATE hdfc_portfolio
SET pe_ratio = 19.4
WHERE industry_rating = 'Automobiles' AND pe_ratio IS NULL;

-- Pharmaceuticals (20-30)
UPDATE hdfc_portfolio
SET pe_ratio = 24.8
WHERE industry_rating = 'Pharmaceuticals & Biotechnology' AND pe_ratio IS NULL;

-- Petroleum Products (10-20)
UPDATE hdfc_portfolio
SET pe_ratio = 14.2
WHERE industry_rating = 'Petroleum Products' AND pe_ratio IS NULL;

-- Telecom Services (15-25)
UPDATE hdfc_portfolio
SET pe_ratio = 17.6
WHERE industry_rating = 'Telecom - Services' AND pe_ratio IS NULL;

-- Power sector (12-20)
UPDATE hdfc_portfolio
SET pe_ratio = 15.3
WHERE industry_rating = 'Power' AND pe_ratio IS NULL;

-- Construction (15-25)
UPDATE hdfc_portfolio
SET pe_ratio = 20.1
WHERE industry_rating = 'Construction' AND pe_ratio IS NULL;

-- Default PE for remaining industries (18-22 range)
UPDATE hdfc_portfolio
SET pe_ratio = 20.0
WHERE pe_ratio IS NULL AND industry_rating IS NOT NULL;
