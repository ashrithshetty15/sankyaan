-- Add PE ratio column to hdfc_portfolio table
ALTER TABLE hdfc_portfolio
ADD COLUMN IF NOT EXISTS pe_ratio DECIMAL(10, 2);

-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_pe_ratio ON hdfc_portfolio(pe_ratio);

-- Example: Update PE ratios for some holdings (you can populate with actual data)
-- UPDATE hdfc_portfolio SET pe_ratio = 25.5 WHERE isin = 'INE237A01036';
