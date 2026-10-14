/**
 * Import Element invoices and attach PDF evidence to the current audit draft.
 * Classic script module; shared services and state are loaded by index.html.
 */

function parseElementInvoiceFile(file) {
  if (!file) return;
  const extension = String(file.name || '').split('.').pop().toLowerCase();
  if (!['csv', 'txt', 'cdv'].includes(extension)) {
    alert('Choose an Element .csv, .txt, or .cdv file.');
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => alert('The Element invoice CSV/CDV could not be read.');
  reader.onload = event => {
    try {
      const sourceRows = elementRecordsFromText(String(event.target.result || ''));
      if (!sourceRows.length) throw new Error('The Element file has headers but no invoice records.');
      const csvInvoiceNumber = String(sourceValue(sourceRows[0], ['Invoice #', 'Invoice Number'])).trim();
      const csvInvoiceDate = elementInvoiceDate(sourceValue(sourceRows[0], ['Invoice Date']));
      if (!$('elementInvoiceNumber').value.trim() && csvInvoiceNumber) {
        $('elementInvoiceNumber').value = csvInvoiceNumber;
      }
      if (!$('elementInvoiceDate').value && csvInvoiceDate.iso) {
        $('elementInvoiceDate').value = csvInvoiceDate.iso;
      }
      if (!$('elementAuditMonth').value.trim() && csvInvoiceDate.month) {
        $('elementAuditMonth').value = csvInvoiceDate.month;
      }
      const month = $('elementAuditMonth').value.trim();
      const invoiceNumber = $('elementInvoiceNumber').value.trim();
      if (!month || !invoiceNumber) {
        alert('Enter the Audit Month and Invoice Number. The invoice date and number can be read from the Element CSV when present.');
        return;
      }
      const clientId = currentClientId;
      const key = elementAuditKey(clientId, month, invoiceNumber);
      const activeAudit = currentElementAudit();
      const existingMonthAudit = elementAuditList().find(item =>
        elementAuditMonthKey(item.clientId, item.month) === elementAuditMonthKey(clientId, month)
      );
      if (existingMonthAudit &&
          (existingMonthAudit.id !== (activeAudit && activeAudit.id) ||
           normalizedElementKey(existingMonthAudit.invoiceNumber) !== normalizedElementKey(invoiceNumber))) {
        if (window.confirm('An audit already exists for this client and month. Open it from Audit History instead of importing over it?')) {
          changeElementAudit(existingMonthAudit.id);
        }
        return;
      }
      if (activeAudit && activeAudit.month && activeAudit.invoiceNumber &&
          elementAuditKey(activeAudit.clientId, activeAudit.month, activeAudit.invoiceNumber) !== key &&
          elementAuditIsDirty(activeAudit)) {
        const shouldSave = window.confirm('The active Element audit has unsaved changes. Save it to Audit History before importing another invoice?');
        if (!shouldSave || !saveCurrentElementAudit(activeAudit, false)) return;
      }
      let audit = activeAudit &&
        (!activeAudit.month || !activeAudit.invoiceNumber ||
          elementAuditKey(activeAudit.clientId, activeAudit.month, activeAudit.invoiceNumber) === key)
        ? activeAudit
        : null;
      if (!audit) audit = elementAuditList().find(item =>
        elementAuditKey(item.clientId, item.month, item.invoiceNumber) === key
      );
      if (audit && state.elementAudits.includes(audit)) audit = cloneElementAudit(audit);
      if (!audit) {
        audit = {
          id: createElementAuditId(),
          clientId,
          month,
          invoiceNumber,
          invoiceDate: '',
          sourceInvoiceTotal: '',
          elementRecords: [],
          maintenanceReview: [],
          unmatchedReviewRecords: []
        };
      }
      audit.month = month;
      audit.invoiceNumber = invoiceNumber;
      const client = selectedClient();
      audit.clientId = clientId;
      audit.clientName = client.company;
      audit.shortCode = client.shortCode;
      audit.station = client.station;
      const pdfDetailReference = ELEMENT_PDF_DETAIL_REFERENCES[key];
      if ((audit.pdfMaintenanceDetailTotal == null || audit.pdfMaintenanceDetailTotal === '') &&
          pdfDetailReference) {
        audit.pdfMaintenanceDetailTotal = String(pdfDetailReference.total);
        audit.pdfMaintenanceDetailSource = pdfDetailReference.source;
      }
      const invoiceDate = $('elementInvoiceDate').value;
      if (invoiceDate || !audit.invoiceDate) audit.invoiceDate = invoiceDate;
      audit.elementRecords = sourceRows.map(elementRecordValues);
      const invoiceTotal = $('elementInvoiceTotal').value.trim();
      if (invoiceTotal || !audit.sourceInvoiceTotal) audit.sourceInvoiceTotal = invoiceTotal;
      audit.csvFileName = file.name;
      audit.csvFileSize = file.size;
      audit.csvImportedAt = new Date().toISOString();
      state.activeElementAuditByClient = state.activeElementAuditByClient || {};
      state.activeElementAuditByClient[clientId] = audit;
      state.selectedElementAuditByClient = state.selectedElementAuditByClient || {};
      state.selectedElementAuditByClient[clientId] = audit.id;
      ensureMaintenanceReviewFromElement(audit);
      ensureTollReviewFromElement(audit);
      try {
        save();
      } catch (error) {
        console.error('Unable to save imported Element invoice data in browser storage.', error);
        alert('The Element CSV was parsed, but its active workspace could not be saved in browser storage. Export a backup and check available storage.');
        return;
      }
      alert('Imported ' + audit.elementRecords.length + ' Element invoice records for ' + month + ' / ' + invoiceNumber + '.');
      element();
    } catch (error) {
      console.error('Unable to parse Element invoice file.', error);
      alert('Unable to parse the Element invoice file: ' + error.message);
    }
  };
  reader.readAsText(file);
}

function attachElementInvoicePdf(file) {
  if (!file) return;
  if (!/\.pdf$/i.test(file.name || '')) {
    alert('Choose the Element invoice PDF.');
    return;
  }
  const audit = currentElementAudit();
  if (!audit) {
    alert('Enter an audit month and invoice number before attaching the Element PDF.');
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    alert('The PDF is larger than the 2 MB browser-storage limit for this prototype.');
    return;
  }
  const auditId = audit.id;
  const reader = new FileReader();
  reader.onerror = () => alert('The selected Element invoice PDF could not be read.');
  reader.onload = event => {
    const target = currentElementAudit();
    if (!target) {
      alert('The active Element audit is no longer available. Select it again and attach the PDF.');
      return;
    }
    if (target.id !== auditId) {
      alert('The active Element audit changed while the PDF was being read. Attach it again.');
      return;
    }
    const previousAttachment = {
      name: target.invoicePdfName,
      size: target.invoicePdfSize,
      dataUrl: target.invoicePdfDataUrl
    };
    target.invoicePdfName = file.name;
    target.invoicePdfSize = file.size;
    target.invoicePdfDataUrl = String(event.target.result || '');
    try {
      save();
      element();
    } catch (error) {
      if (previousAttachment.name == null) delete target.invoicePdfName;
      else target.invoicePdfName = previousAttachment.name;
      if (previousAttachment.size == null) delete target.invoicePdfSize;
      else target.invoicePdfSize = previousAttachment.size;
      if (previousAttachment.dataUrl == null) delete target.invoicePdfDataUrl;
      else target.invoicePdfDataUrl = previousAttachment.dataUrl;
      console.error('Unable to save the Element invoice PDF attachment.', error);
      alert('The Element invoice PDF could not be saved in browser storage.');
    }
  };
  reader.readAsDataURL(file);
}
