import jsPDF from 'jspdf';

/**
 * Export mutual fund report to PDF using native jsPDF rendering.
 * Produces a compact PDF (<2MB) with ALL holdings.
 *
 * @param {object} fundData - The full fund data object from the API
 */
export const exportFundReportToPDF = async (fundData) => {
  try {
    const fundName = fundData.companyName || 'Fund Portfolio';

    // Show loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'pdf-loading';
    loadingDiv.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.85); color: white; padding: 30px 50px;
      border-radius: 12px; z-index: 10000; font-size: 18px; text-align: center;
    `;
    loadingDiv.innerHTML = `<div style="margin-bottom:10px;">Generating PDF...</div><div style="font-size:14px;opacity:0.7;">Please wait</div>`;
    document.body.appendChild(loadingDiv);

    // Small delay so the loading indicator renders
    await new Promise(r => setTimeout(r, 50));

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pageW = 210;
    const pageH = 297;
    const ml = 12; // margin left
    const mr = 12; // margin right
    const mt = 15; // margin top
    const mb = 15; // margin bottom
    const cw = pageW - ml - mr; // content width
    let y = mt;

    // ── Colors ──
    const C = {
      bg: [26, 26, 26],
      headerBg: [30, 41, 59],
      accent: [59, 130, 246],
      green: [34, 197, 94],
      red: [239, 68, 68],
      white: [255, 255, 255],
      gray: [156, 163, 175],
      lightGray: [209, 213, 219],
      darkBg: [15, 23, 42],
      rowAlt: [31, 41, 55],
      rowBase: [22, 30, 44],
    };

    const setColor = (c) => pdf.setTextColor(c[0], c[1], c[2]);
    const setFill = (c) => pdf.setFillColor(c[0], c[1], c[2]);

    // ── Page background ──
    const drawPageBg = () => {
      setFill(C.bg);
      pdf.rect(0, 0, pageW, pageH, 'F');
    };

    // ── Check & add new page ──
    const checkPage = (needed = 10) => {
      if (y + needed > pageH - mb) {
        pdf.addPage();
        drawPageBg();
        y = mt;
        return true;
      }
      return false;
    };

    // ── Draw section header ──
    const sectionHeader = (title) => {
      checkPage(14);
      setFill(C.headerBg);
      pdf.roundedRect(ml, y, cw, 10, 2, 2, 'F');
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      setColor(C.white);
      pdf.text(title, ml + 5, y + 7);
      y += 14;
    };

    // ── Draw key-value row ──
    const kvRow = (label, value, valueColor = C.white) => {
      checkPage(7);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      setColor(C.gray);
      pdf.text(label, ml + 4, y);
      pdf.setFont('helvetica', 'bold');
      setColor(valueColor);
      pdf.text(String(value ?? 'N/A'), ml + cw - 4, y, { align: 'right' });
      y += 6;
    };

    // ══════════════ PAGE 1 — HEADER ══════════════
    drawPageBg();

    // Title bar
    setFill(C.darkBg);
    pdf.roundedRect(ml, y, cw, 22, 3, 3, 'F');
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    setColor(C.white);
    const displayName = fundName.length > 55 ? fundName.substring(0, 55) + '...' : fundName;
    pdf.text(displayName, ml + 6, y + 10);

    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    setColor(C.gray);
    const headerMeta = [fundData.fundHouse, fundData.ticker].filter(Boolean).join('  |  ');
    pdf.text(headerMeta, ml + 6, y + 18);
    y += 28;

    // ── Summary Stats ──
    sectionHeader('Fund Summary');

    const totalValue = fundData.freeFloatValue ? (fundData.freeFloatValue / 100).toFixed(2) : '0.00';
    kvRow('Total Portfolio Value', `Rs ${totalValue} Cr`);
    kvRow('Holdings Count', String(fundData.funds?.length || 0));
    kvRow('Total Allocation', `${(fundData.totalMFPercentageOfFreeFloat || 0).toFixed(2)}%`);
    if (fundData.portfolioPE) kvRow('Portfolio P/E Ratio', String(fundData.portfolioPE));
    if (fundData.fundHouse) kvRow('Fund House', fundData.fundHouse);

    const dateStr = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
    kvRow('Report Date', dateStr);
    y += 4;



    // ── Top 10 Holdings ──
    const holdings = fundData.funds || [];
    const sorted = [...holdings].sort((a, b) => (b.portfolioPercentage || 0) - (a.portfolioPercentage || 0));
    const top10 = sorted.slice(0, 10);

    sectionHeader('Top 10 Holdings');

    // Column positions for top 10
    const t10Cols = { num: ml + 2, name: ml + 12, ind: ml + cw * 0.55, alloc: ml + cw * 0.72, val: ml + cw - 3 };

    const drawTop10Header = () => {
      setFill(C.headerBg);
      pdf.rect(ml, y, cw, 7, 'F');
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'bold');
      setColor(C.lightGray);
      pdf.text('#', t10Cols.num, y + 5);
      pdf.text('INSTRUMENT', t10Cols.name, y + 5);
      pdf.text('INDUSTRY', t10Cols.ind, y + 5);
      pdf.text('ALLOC %', t10Cols.alloc, y + 5);
      pdf.text('VALUE (L)', t10Cols.val, y + 5, { align: 'right' });
      y += 9;
    };

    drawTop10Header();

    top10.forEach((h, i) => {
      checkPage(7);
      setFill(i % 2 === 0 ? C.rowBase : C.rowAlt);
      pdf.rect(ml, y - 3.5, cw, 7, 'F');

      const name = (h.fundName || h.instrument_name || 'Unknown');
      const truncName = name.length > 45 ? name.substring(0, 45) + '..' : name;
      const industry = (h.industry || h.industry_rating || '-');
      const truncInd = industry.length > 18 ? industry.substring(0, 18) + '..' : industry;
      const alloc = (h.portfolioPercentage || 0).toFixed(2);
      const value = (h.assetsUnderManagement || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'normal');
      setColor(C.gray);
      pdf.text(String(i + 1).padStart(2, '0'), t10Cols.num, y);
      setColor(C.white);
      pdf.setFont('helvetica', 'bold');
      pdf.text(truncName, t10Cols.name, y);
      pdf.setFont('helvetica', 'normal');
      setColor(C.gray);
      pdf.text(truncInd, t10Cols.ind, y);
      setColor(C.green);
      pdf.text(`${alloc}%`, t10Cols.alloc, y);
      setColor(C.lightGray);
      pdf.text(value, t10Cols.val, y, { align: 'right' });
      y += 7;
    });

    y += 4;

    // ── Forensic Scores (extracted from DOM if present) ──
    const forensicEl = document.querySelector('.forensic-scores-section');
    if (forensicEl) {
      sectionHeader('Portfolio Quality Scores');

      const primaryScore = forensicEl.querySelector('.primary-score-num');
      if (primaryScore) kvRow('Overall Quality Score', `${primaryScore.textContent.trim()} / 100`);

      const metricCards = forensicEl.querySelectorAll('.metric-card');
      metricCards.forEach(card => {
        const label = card.querySelector('.metric-label')?.textContent.trim();
        const value = card.querySelector('.metric-value')?.textContent.trim();
        if (label && value) kvRow(label, value);
      });

      const detailCards = forensicEl.querySelectorAll('.detail-card');
      detailCards.forEach(card => {
        const label = card.querySelector('.detail-label')?.textContent.trim();
        const value = card.querySelector('.detail-score')?.textContent.trim();
        if (label && value) kvRow(label, `${value} / 100`);
      });

      // CAGR values
      const cagrCards = forensicEl.querySelectorAll('.cagr-card');
      if (cagrCards.length > 0) {
        y += 2;
        checkPage(10);
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        setColor(C.accent);
        pdf.text('Fund Returns (CAGR)', ml + 4, y);
        y += 6;

        cagrCards.forEach(card => {
          const label = card.querySelector('.cagr-label')?.textContent.trim();
          const value = card.querySelector('.cagr-value')?.textContent.trim();
          if (label && value) {
            const color = value.startsWith('+') ? C.green : value.startsWith('-') ? C.red : C.white;
            kvRow(label, value, color);
          }
        });
      }
      y += 4;
    }

    // ══════════════ ALL HOLDINGS TABLE ══════════════
    sectionHeader(`All Holdings (${sorted.length} instruments)`);

    // Column positions for full table
    const fCols = { num: ml + 2, name: ml + 12, ind: ml + cw * 0.50, alloc: ml + cw * 0.72, val: ml + cw - 3 };

    const drawFullTableHeader = () => {
      setFill(C.headerBg);
      pdf.rect(ml, y, cw, 7, 'F');
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      setColor(C.lightGray);
      pdf.text('#', fCols.num, y + 5);
      pdf.text('INSTRUMENT', fCols.name, y + 5);
      pdf.text('INDUSTRY', fCols.ind, y + 5);
      pdf.text('ALLOC %', fCols.alloc, y + 5);
      pdf.text('VALUE (Lakh)', fCols.val, y + 5, { align: 'right' });
      y += 9;
    };

    drawFullTableHeader();

    sorted.forEach((h, i) => {
      if (checkPage(7)) {
        drawFullTableHeader();
      }

      setFill(i % 2 === 0 ? C.rowBase : C.rowAlt);
      pdf.rect(ml, y - 3.5, cw, 6.5, 'F');

      const name = (h.fundName || h.instrument_name || 'Unknown');
      const truncName = name.length > 42 ? name.substring(0, 42) + '..' : name;
      const industry = (h.industry || h.industry_rating || '-');
      const truncInd = industry.length > 20 ? industry.substring(0, 20) + '..' : industry;
      const alloc = (h.portfolioPercentage || 0).toFixed(2);
      const value = (h.assetsUnderManagement || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      setColor(C.gray);
      pdf.text(String(i + 1), fCols.num, y);
      setColor(C.white);
      pdf.setFont('helvetica', 'bold');
      pdf.text(truncName, fCols.name, y);
      pdf.setFont('helvetica', 'normal');
      setColor(C.gray);
      pdf.text(truncInd, fCols.ind, y);
      setColor(parseFloat(alloc) >= 1 ? C.green : C.lightGray);
      pdf.text(`${alloc}%`, fCols.alloc, y);
      setColor(C.lightGray);
      pdf.text(value, fCols.val, y, { align: 'right' });
      y += 6.5;
    });

    // ── Footer on all pages ──
    const pageCount = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setDrawColor(50, 50, 50);
      pdf.line(ml, pageH - 12, pageW - mr, pageH - 12);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      setColor(C.gray);
      pdf.text('Sankyaan - Portfolio Analytics', ml, pageH - 8);
      pdf.text(`Page ${i} of ${pageCount}`, pageW - mr, pageH - 8, { align: 'right' });
    }

    // ── Metadata ──
    pdf.setProperties({
      title: `${fundName} - Portfolio Report`,
      subject: 'Mutual Fund Analysis Report',
      author: 'Sankyaan - Portfolio Analytics',
      creator: 'Sankyaan'
    });

    // ── Save ──
    const sanitized = fundName.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').substring(0, 50);
    pdf.save(`${sanitized}_Report_${new Date().toISOString().split('T')[0]}.pdf`);

    // Remove loading, show success
    document.body.removeChild(loadingDiv);

    const successDiv = document.createElement('div');
    successDiv.style.cssText = `
      position: fixed; top: 20px; right: 20px; background: #22c55e; color: white;
      padding: 15px 25px; border-radius: 8px; z-index: 10000; font-size: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    successDiv.textContent = 'PDF downloaded successfully!';
    document.body.appendChild(successDiv);
    setTimeout(() => document.body.removeChild(successDiv), 3000);

    return true;
  } catch (error) {
    console.error('Error generating PDF:', error);
    const loadingDiv = document.getElementById('pdf-loading');
    if (loadingDiv) document.body.removeChild(loadingDiv);

    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed; top: 20px; right: 20px; background: #ef4444; color: white;
      padding: 15px 25px; border-radius: 8px; z-index: 10000; font-size: 16px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    errorDiv.textContent = 'Failed to generate PDF';
    document.body.appendChild(errorDiv);
    setTimeout(() => document.body.removeChild(errorDiv), 3000);

    return false;
  }
};
