import ExcelJS from 'exceljs';

const COLORS = {
  headerFill: 'FFF9FAFB',
  headerFont: 'FF374151',
  incomeFill: 'FFECFDF5',
  incomeFont: 'FF047857',
  incomeTotalFill: 'FFD1FAE5',
  transferFill: 'FFFFFBEB',
  transferFont: 'FFB45309',
  transferTotalFill: 'FFFEF3C7',
  evenRowFill: 'FFFFFFFF',
  oddRowFill: 'FFF9FAFB',
  totalRowFill: 'FFF3F4F6',
  totalColFill: 'FFF3F4F6',
  grandTotalColFill: 'FFDBEAFE',
  border: 'FFE5E7EB',
  mutedFont: 'FF9CA3AF',
  bodyFont: 'FF111827',
};

const applyBorder = (cell) => {
  cell.border = {
    top: { style: 'thin', color: { argb: COLORS.border } },
    left: { style: 'thin', color: { argb: COLORS.border } },
    bottom: { style: 'thin', color: { argb: COLORS.border } },
    right: { style: 'thin', color: { argb: COLORS.border } },
  };
};

const styleHeaderRow = (row, totalCols) => {
  row.height = 22;
  for (let col = 1; col <= totalCols; col += 1) {
    const cell = row.getCell(col);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerFill } };
    cell.font = { bold: true, size: 10, color: { argb: COLORS.headerFont } };
    cell.alignment = { vertical: 'middle', horizontal: col <= 2 ? 'left' : 'right' };
    applyBorder(cell);
  }
};

const styleSummaryLabelCell = (cell, fill, fontColor, bold = true) => {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  cell.font = { bold, size: 11, color: { argb: fontColor } };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  applyBorder(cell);
};

const styleCurrencyCell = (cell, fill, fontColor, bold = true) => {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  cell.font = { bold, size: 11, color: { argb: fontColor } };
  cell.alignment = { vertical: 'middle', horizontal: 'right' };
  applyBorder(cell);
};

const styleQtyCell = (cell, fill, qty, bold = false) => {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  cell.font = {
    bold,
    size: 11,
    color: { argb: qty > 0 ? COLORS.bodyFont : COLORS.mutedFont },
  };
  cell.alignment = { vertical: 'middle', horizontal: 'right' };
  applyBorder(cell);
};

const downloadWorkbook = async (workbook, filename) => {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const sanitizeFilename = (name) =>
  (name || 'Report').replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');

export const exportMonthlySaleReportExcel = async ({
  report,
  formatCurrency,
  getProductPrice,
  warehouseName = '',
}) => {
  if (!report || report.items.length === 0) return;

  const { months, items, itemMonthlySales, monthlyRevenue, monthlyTransferRevenue, monthlyTotals } = report;
  const totalCols = 2 + months.length + 1;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Monthly Sale Report');

  sheet.getColumn(1).width = 8;
  sheet.getColumn(2).width = 42;
  months.forEach((_, index) => {
    sheet.getColumn(3 + index).width = 14;
  });
  sheet.getColumn(totalCols).width = 16;

  let rowNum = 1;

  sheet.mergeCells(rowNum, 1, rowNum, totalCols);
  const titleCell = sheet.getCell(rowNum, 1);
  titleCell.value = warehouseName
    ? `Monthly Sale Report - ${warehouseName}`
    : 'Monthly Sale Report';
  titleCell.font = { bold: true, size: 14, color: { argb: COLORS.bodyFont } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  rowNum += 1;

  sheet.mergeCells(rowNum, 1, rowNum, totalCols);
  const subtitleCell = sheet.getCell(rowNum, 1);
  subtitleCell.value = 'Comprehensive view of all items sold across all months';
  subtitleCell.font = { size: 10, color: { argb: 'FF6B7280' } };
  rowNum += 2;

  const headerRow = sheet.getRow(rowNum);
  headerRow.values = ['S.No', 'Item Name', ...months.map((m) => m.name.toUpperCase()), 'TOTAL'];
  styleHeaderRow(headerRow, totalCols);
  const headerRowNum = rowNum;
  rowNum += 1;

  const incomeRow = sheet.getRow(rowNum);
  sheet.mergeCells(rowNum, 1, rowNum, 2);
  incomeRow.getCell(1).value = 'MONTHLY INCOME';
  styleSummaryLabelCell(incomeRow.getCell(1), COLORS.incomeFill, COLORS.incomeFont);
  months.forEach((month, index) => {
    const revenue = monthlyRevenue.get(month.key) || 0;
    const cell = incomeRow.getCell(3 + index);
    cell.value = revenue > 0 ? formatCurrency(revenue) : '-';
    styleCurrencyCell(cell, COLORS.incomeFill, COLORS.incomeFont);
  });
  const incomeTotal = Array.from(monthlyRevenue.values()).reduce((sum, rev) => sum + rev, 0);
  const incomeTotalCell = incomeRow.getCell(totalCols);
  incomeTotalCell.value = formatCurrency(incomeTotal);
  styleCurrencyCell(incomeTotalCell, COLORS.incomeTotalFill, COLORS.incomeFont);
  rowNum += 1;

  const transferRow = sheet.getRow(rowNum);
  sheet.mergeCells(rowNum, 1, rowNum, 2);
  transferRow.getCell(1).value = 'COLLEGE TRANSFERS';
  styleSummaryLabelCell(transferRow.getCell(1), COLORS.transferFill, COLORS.transferFont);
  months.forEach((month, index) => {
    const transferRev = monthlyTransferRevenue.get(month.key) || 0;
    const cell = transferRow.getCell(3 + index);
    cell.value = transferRev > 0 ? formatCurrency(transferRev) : '-';
    styleCurrencyCell(cell, COLORS.transferFill, COLORS.transferFont);
  });
  const transferTotal = Array.from(monthlyTransferRevenue.values()).reduce((sum, rev) => sum + rev, 0);
  const transferTotalCell = transferRow.getCell(totalCols);
  transferTotalCell.value = formatCurrency(transferTotal);
  styleCurrencyCell(transferTotalCell, COLORS.transferTotalFill, COLORS.transferFont);
  rowNum += 1;

  items.forEach((itemName, itemIndex) => {
    const itemSales = itemMonthlySales.get(itemName) || new Map();
    const currentPrice = getProductPrice(itemName);
    const rowTotal = Array.from(itemSales.values()).reduce((sum, qty) => sum + qty, 0);
    const itemRow = sheet.getRow(rowNum);
    const itemLabel =
      currentPrice > 0 ? `${itemName} (${formatCurrency(currentPrice)})` : itemName;
    const rowFill = itemIndex % 2 === 0 ? COLORS.evenRowFill : COLORS.oddRowFill;

    itemRow.getCell(1).value = itemIndex + 1;
    itemRow.getCell(2).value = itemLabel;
    itemRow.height = 20;
    itemRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowFill } };
    itemRow.getCell(1).font = { size: 11, color: { argb: COLORS.bodyFont } };
    itemRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    applyBorder(itemRow.getCell(1));
    itemRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowFill } };
    itemRow.getCell(2).font = { size: 11, color: { argb: COLORS.bodyFont } };
    itemRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
    applyBorder(itemRow.getCell(2));

    months.forEach((month, index) => {
      const qty = itemSales.get(month.key) || 0;
      const cell = itemRow.getCell(3 + index);
      cell.value = qty > 0 ? qty : '-';
      styleQtyCell(cell, rowFill, qty);
    });
    const totalCell = itemRow.getCell(totalCols);
    totalCell.value = rowTotal > 0 ? rowTotal : '-';
    styleQtyCell(totalCell, COLORS.totalColFill, rowTotal, true);
    rowNum += 1;
  });

  const grandTotalRow = sheet.getRow(rowNum);
  sheet.mergeCells(rowNum, 1, rowNum, 2);
  grandTotalRow.getCell(1).value = 'GRAND TOTAL';
  styleSummaryLabelCell(grandTotalRow.getCell(1), COLORS.totalRowFill, COLORS.bodyFont);
  months.forEach((month, index) => {
    const monthTotal = monthlyTotals.get(month.key) || 0;
    const cell = grandTotalRow.getCell(3 + index);
    cell.value = monthTotal > 0 ? monthTotal : '-';
    styleQtyCell(cell, COLORS.totalRowFill, monthTotal, true);
  });
  const grandTotal = Array.from(monthlyTotals.values()).reduce((sum, total) => sum + total, 0);
  const grandTotalCell = grandTotalRow.getCell(totalCols);
  grandTotalCell.value = grandTotal;
  styleQtyCell(grandTotalCell, COLORS.grandTotalColFill, grandTotal, true);

  sheet.views = [{ state: 'frozen', ySplit: headerRowNum, activeCell: 'A1' }];

  const dateStamp = new Date().toISOString().split('T')[0];
  const warehousePart = warehouseName ? `_${sanitizeFilename(warehouseName)}` : '';
  await downloadWorkbook(workbook, `Monthly_Sale_Report${warehousePart}_${dateStamp}.xlsx`);
};

export const exportDailyBreakdownReportExcel = async ({
  report,
  formatCurrency,
  getProductPrice,
  warehouseName = '',
}) => {
  if (!report || report.items.length === 0) return;

  const { days, items, itemDailySales, dailyTotals, dailyRevenue, dailyTransferRevenue, monthName } = report;
  const totalCols = 2 + days.length + 1;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Daily Breakdown');

  sheet.getColumn(1).width = 8;
  sheet.getColumn(2).width = 42;
  days.forEach((_, index) => {
    sheet.getColumn(3 + index).width = 12;
  });
  sheet.getColumn(totalCols).width = 16;

  let rowNum = 1;

  sheet.mergeCells(rowNum, 1, rowNum, totalCols);
  const titleCell = sheet.getCell(rowNum, 1);
  titleCell.value = warehouseName
    ? `Daily Breakdown - ${monthName} (${warehouseName})`
    : `Daily Breakdown - ${monthName}`;
  titleCell.font = { bold: true, size: 14, color: { argb: COLORS.bodyFont } };
  rowNum += 1;

  sheet.mergeCells(rowNum, 1, rowNum, totalCols);
  const subtitleCell = sheet.getCell(rowNum, 1);
  subtitleCell.value = 'Daily breakdown of sales for selected month';
  subtitleCell.font = { size: 10, color: { argb: 'FF6B7280' } };
  rowNum += 2;

  const headerRow = sheet.getRow(rowNum);
  headerRow.values = ['S.No', 'Item Name', ...days.map((d) => d.name.toUpperCase()), 'TOTAL'];
  styleHeaderRow(headerRow, totalCols);
  const headerRowNum = rowNum;
  rowNum += 1;

  const incomeRow = sheet.getRow(rowNum);
  sheet.mergeCells(rowNum, 1, rowNum, 2);
  incomeRow.getCell(1).value = 'DAILY INCOME';
  styleSummaryLabelCell(incomeRow.getCell(1), COLORS.incomeFill, COLORS.incomeFont);
  days.forEach((day, index) => {
    const dayRevenue = dailyRevenue.get(day.key) || 0;
    const cell = incomeRow.getCell(3 + index);
    cell.value = dayRevenue > 0 ? formatCurrency(dayRevenue) : '-';
    styleCurrencyCell(cell, COLORS.incomeFill, COLORS.incomeFont);
  });
  const incomeTotal = Array.from(dailyRevenue.values()).reduce((sum, rev) => sum + rev, 0);
  const incomeTotalCell = incomeRow.getCell(totalCols);
  incomeTotalCell.value = formatCurrency(incomeTotal);
  styleCurrencyCell(incomeTotalCell, COLORS.incomeTotalFill, COLORS.incomeFont);
  rowNum += 1;

  const transferRow = sheet.getRow(rowNum);
  transferRow.getCell(1).value = '';
  transferRow.getCell(2).value = 'College Transfers';
  styleSummaryLabelCell(transferRow.getCell(1), COLORS.transferFill, COLORS.transferFont, false);
  styleSummaryLabelCell(transferRow.getCell(2), COLORS.transferFill, COLORS.transferFont);
  days.forEach((day, index) => {
    const transferRev = dailyTransferRevenue?.get(day.key) || 0;
    const cell = transferRow.getCell(3 + index);
    cell.value = transferRev > 0 ? formatCurrency(transferRev) : '-';
    styleCurrencyCell(cell, COLORS.transferFill, COLORS.transferFont, transferRev > 0);
  });
  const transferTotal = Array.from(dailyTransferRevenue?.values() || []).reduce((sum, rev) => sum + rev, 0);
  const transferTotalCell = transferRow.getCell(totalCols);
  transferTotalCell.value = formatCurrency(transferTotal);
  styleCurrencyCell(transferTotalCell, COLORS.transferTotalFill, COLORS.transferFont);
  rowNum += 1;

  items.forEach((itemName, itemIndex) => {
    const itemSales = itemDailySales.get(itemName) || new Map();
    const currentPrice = getProductPrice(itemName);
    const rowTotal = Array.from(itemSales.values()).reduce((sum, qty) => sum + qty, 0);
    const itemRow = sheet.getRow(rowNum);
    const itemLabel =
      currentPrice > 0 ? `${itemName} (${formatCurrency(currentPrice)})` : itemName;
    const rowFill = itemIndex % 2 === 0 ? COLORS.evenRowFill : COLORS.oddRowFill;

    itemRow.getCell(1).value = itemIndex + 1;
    itemRow.getCell(2).value = itemLabel;
    itemRow.height = 20;
    itemRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowFill } };
    itemRow.getCell(1).font = { size: 11, color: { argb: COLORS.bodyFont } };
    itemRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    applyBorder(itemRow.getCell(1));
    itemRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowFill } };
    itemRow.getCell(2).font = { size: 11, color: { argb: COLORS.bodyFont } };
    itemRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
    applyBorder(itemRow.getCell(2));

    days.forEach((day, index) => {
      const qty = itemSales.get(day.key) || 0;
      const cell = itemRow.getCell(3 + index);
      cell.value = qty > 0 ? qty : '-';
      styleQtyCell(cell, rowFill, qty);
    });
    const totalCell = itemRow.getCell(totalCols);
    totalCell.value = rowTotal > 0 ? rowTotal : '-';
    styleQtyCell(totalCell, COLORS.totalColFill, rowTotal, true);
    rowNum += 1;
  });

  const grandTotalRow = sheet.getRow(rowNum);
  sheet.mergeCells(rowNum, 1, rowNum, 2);
  grandTotalRow.getCell(1).value = 'GRAND TOTAL';
  styleSummaryLabelCell(grandTotalRow.getCell(1), COLORS.totalRowFill, COLORS.bodyFont);
  days.forEach((day, index) => {
    const dayTotal = dailyTotals.get(day.key) || 0;
    const cell = grandTotalRow.getCell(3 + index);
    cell.value = dayTotal > 0 ? dayTotal : '-';
    styleQtyCell(cell, COLORS.totalRowFill, dayTotal, true);
  });
  const grandTotal = Array.from(dailyTotals.values()).reduce((sum, total) => sum + total, 0);
  const grandTotalCell = grandTotalRow.getCell(totalCols);
  grandTotalCell.value = grandTotal;
  styleQtyCell(grandTotalCell, COLORS.grandTotalColFill, grandTotal, true);

  sheet.views = [{ state: 'frozen', ySplit: headerRowNum, activeCell: 'A1' }];

  const dateStamp = new Date().toISOString().split('T')[0];
  const monthPart = sanitizeFilename(monthName);
  const warehousePart = warehouseName ? `_${sanitizeFilename(warehouseName)}` : '';
  await downloadWorkbook(workbook, `Daily_Breakdown_${monthPart}${warehousePart}_${dateStamp}.xlsx`);
};
