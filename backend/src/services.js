import { searchPortfolio } from './db.js';

/**
 * Format portfolio data for API response
 */
export const searchStock = async (fundName) => {
  try {
    const portfolioData = await searchPortfolio(fundName);
    
    if (!portfolioData || portfolioData.length === 0) {
      return null;
    }

    // Get unique fund info from first row
    const firstRow = portfolioData[0];

    // Transform holdings into the expected format
    const holdings = portfolioData.map((holding, index) => ({
      fundId: `holding-${index}`,
      fundName: holding.instrument_name,
      portfolioPercentage: parseFloat(holding.percent_nav) || 0,
      assetsUnderManagement: parseFloat(holding.market_value_lacs) || 0,
      estimatedValue: (parseFloat(holding.market_value_lacs) || 0).toFixed(2),
      estimatedFreeFloatPercentage: parseFloat(holding.percent_nav) || 0,
      quantity: parseInt(holding.quantity) || 0,
      scheme: holding.scheme_name,
      date: holding.portfolio_date,
      industry: holding.industry_rating,
      peRatio: parseFloat(holding.pe_ratio) || null,
      stockId: holding.stock_id || null,
      symbol: holding.symbol || null,
      stockCompanyName: holding.stock_company_name || null
    }));

    // Calculate total allocation
    const totalAllocation = holdings.reduce((sum, h) => sum + h.portfolioPercentage, 0);

    // Aggregate industry data for the industry donut chart
    const industryMap = new Map();
    portfolioData.forEach(holding => {
      const industry = holding.industry_rating || 'Unknown';
      const percentage = parseFloat(holding.percent_nav) || 0;
      const currentValue = industryMap.get(industry) || 0;
      industryMap.set(industry, currentValue + percentage);
    });

    // Convert to array and sort by percentage
    const allIndustries = Array.from(industryMap.entries())
      .map(([industry, percentage]) => ({
        industry,
        percentage: parseFloat(percentage.toFixed(2))
      }))
      .sort((a, b) => b.percentage - a.percentage);

    // Keep top 9 industries and group the rest as "Others"
    const TOP_INDUSTRIES = 9;
    const topIndustries = allIndustries.slice(0, TOP_INDUSTRIES);
    const remainingIndustries = allIndustries.slice(TOP_INDUSTRIES);

    const industryData = [...topIndustries];

    if (remainingIndustries.length > 0) {
      const othersPercentage = remainingIndustries.reduce((sum, item) => sum + item.percentage, 0);
      industryData.push({
        industry: 'Others',
        percentage: parseFloat(othersPercentage.toFixed(2))
      });
    }

    // Calculate weighted portfolio PE ratio
    let portfolioPE = null;
    const holdingsWithPE = portfolioData.filter(h => h.pe_ratio != null && parseFloat(h.pe_ratio) > 0);

    if (holdingsWithPE.length > 0) {
      const totalWeight = holdingsWithPE.reduce((sum, h) => sum + (parseFloat(h.percent_nav) || 0), 0);

      if (totalWeight > 0) {
        const weightedPESum = holdingsWithPE.reduce((sum, h) => {
          const weight = (parseFloat(h.percent_nav) || 0) / totalWeight;
          return sum + (parseFloat(h.pe_ratio) * weight);
        }, 0);

        portfolioPE = parseFloat(weightedPESum.toFixed(2));
      }
    }

    return {
      ticker: fundName, // Use fund_name as ticker
      companyName: firstRow.scheme_name || fundName,
      fundHouse: firstRow.fund_house || 'Unknown',
      price: 0, // Not applicable for funds
      freeFloatValue: portfolioData.reduce((sum, row) => sum + (parseFloat(row.market_value_lacs) || 0), 0),
      freeFloatPercentage: 100,
      funds: holdings.sort((a, b) => b.portfolioPercentage - a.portfolioPercentage),
      totalMFPercentageOfFreeFloat: totalAllocation,
      industryDistribution: industryData,
      portfolioPE: portfolioPE
    };
  } catch (error) {
    console.error('Error searching portfolio:', error);
    return null;
  }
};
