import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Export mutual fund report to PDF
 * @param {string} fundName - Name of the mutual fund
 * @param {string} elementId - ID of the HTML element to export
 */
export const exportFundReportToPDF = async (fundName, elementId = 'fund-report-container') => {
  try {
    // Show loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'pdf-loading';
    loadingDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 30px 50px;
      border-radius: 12px;
      z-index: 10000;
      font-size: 18px;
      text-align: center;
    `;
    loadingDiv.innerHTML = `
      <div style="margin-bottom: 15px;">📄 Generating PDF...</div>
      <div style="font-size: 14px; opacity: 0.8;">Please wait</div>
    `;
    document.body.appendChild(loadingDiv);

    // Get the element to export
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`Element with ID "${elementId}" not found`);
    }

    // Store original styles to restore later
    const originalOverflow = element.style.overflow;

    // Find and hide elements that shouldn't appear in PDF
    const paginationControls = element.querySelector('.holdings-pagination');
    const exportButton = element.querySelector('.export-pdf-btn');
    const holdingsTable = element.querySelector('.holdings-table');

    const originalPaginationDisplay = paginationControls?.style.display;
    const originalExportBtnDisplay = exportButton?.style.display;
    const originalHoldingsMaxHeight = holdingsTable?.style.maxHeight;
    const originalHoldingsOverflow = holdingsTable?.style.overflow;

    // Temporarily hide pagination and export button
    if (paginationControls) paginationControls.style.display = 'none';
    if (exportButton) exportButton.style.display = 'none';

    // Show all holdings (remove max-height restriction)
    if (holdingsTable) {
      holdingsTable.style.maxHeight = 'none';
      holdingsTable.style.overflow = 'visible';
    }

    // Make all holdings rows visible
    const allHoldingRows = element.querySelectorAll('.holdings-table tbody tr');
    const originalRowDisplays = [];
    allHoldingRows.forEach((row, index) => {
      originalRowDisplays[index] = row.style.display;
      row.style.display = 'table-row'; // Make all rows visible
    });

    // Temporarily adjust container styles for better PDF rendering
    element.style.overflow = 'visible';

    // Capture the element as canvas
    const canvas = await html2canvas(element, {
      scale: 2, // Higher quality
      useCORS: true, // Handle images from other domains
      logging: false,
      backgroundColor: '#1a1a1a', // Match dark theme background
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    });

    // Restore original styles
    element.style.overflow = originalOverflow;
    if (paginationControls) paginationControls.style.display = originalPaginationDisplay;
    if (exportButton) exportButton.style.display = originalExportBtnDisplay;
    if (holdingsTable) {
      holdingsTable.style.maxHeight = originalHoldingsMaxHeight;
      holdingsTable.style.overflow = originalHoldingsOverflow;
    }

    // Restore original row displays
    allHoldingRows.forEach((row, index) => {
      row.style.display = originalRowDisplays[index];
    });

    // Calculate PDF dimensions
    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Create PDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Add image to PDF
    const imgData = canvas.toDataURL('image/png', 1.0);

    // If content is longer than one page, split it
    let heightLeft = imgHeight;
    let position = 0;

    // Add first page
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Add additional pages if needed
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    // Add page numbers
    const pageCount = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFontSize(10);
      pdf.setTextColor(150);
      pdf.text(`Page ${i} of ${pageCount}`, pdf.internal.pageSize.getWidth() - 30, pdf.internal.pageSize.getHeight() - 10);
    }

    // Add metadata
    const date = new Date().toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    pdf.setProperties({
      title: `${fundName} - Portfolio Report`,
      subject: 'Mutual Fund Analysis Report',
      author: 'Sankyaan - Portfolio Analytics',
      keywords: 'mutual fund, portfolio, analysis, forensic scores',
      creator: 'Sankyaan'
    });

    // Generate filename
    const sanitizedFundName = fundName
      .replace(/[^a-z0-9]/gi, '_')
      .replace(/_+/g, '_')
      .substring(0, 50);
    const filename = `${sanitizedFundName}_Report_${new Date().toISOString().split('T')[0]}.pdf`;

    // Save the PDF
    pdf.save(filename);

    // Remove loading indicator
    document.body.removeChild(loadingDiv);

    // Show success message
    const successDiv = document.createElement('div');
    successDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #22c55e;
      color: white;
      padding: 15px 25px;
      border-radius: 8px;
      z-index: 10000;
      font-size: 16px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    successDiv.innerHTML = '✅ PDF downloaded successfully!';
    document.body.appendChild(successDiv);

    setTimeout(() => {
      document.body.removeChild(successDiv);
    }, 3000);

    return true;
  } catch (error) {
    console.error('Error generating PDF:', error);

    // Remove loading indicator if it exists
    const loadingDiv = document.getElementById('pdf-loading');
    if (loadingDiv) {
      document.body.removeChild(loadingDiv);
    }

    // Show error message
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ef4444;
      color: white;
      padding: 15px 25px;
      border-radius: 8px;
      z-index: 10000;
      font-size: 16px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    errorDiv.innerHTML = '❌ Failed to generate PDF';
    document.body.appendChild(errorDiv);

    setTimeout(() => {
      document.body.removeChild(errorDiv);
    }, 3000);

    return false;
  }
};
