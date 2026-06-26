// ============================================================================
// image.js - Image generation (single, text-batch, image-batch) and batch CSV
//
// Functions: generateImage, handleImageUpload, handleImagePreview,
//   clearUploadedImage, toggleDimensionFields, handleBatchImagePreview,
//   clearBatchUploadedImage, toggleBatchDimensionFields, handleBatchImageUpload,
//   initializeBatchMode, updateBatchPreview, queueBatchGeneration,
//   handleCSVFileUpload, extractParameters, parseCSVLine, parseCSV,
//   replaceParameters, getVariableParameters, initializeImageBatch,
//   toggleImageBatchSizeFields, queueImageBatchGeneration,
//   showBatchInstructions, markdownToHtml, copyBatchInstructions,
//   closeBatchInstructions
// ============================================================================

// Global state for uploaded images
let uploadedImageFilename = null;
let batchUploadedImageFilename = null;

// Image Generation
async function generateImage() {
    const prompt = document.getElementById('prompt').value.trim();
    
    if (!prompt) {
        showNotification('Please enter a prompt', 'Missing Prompt', 'warning');
        return;
    }
    savePromptToHistory(prompt, 'image');
    
    // Check if image needs to be uploaded first
    const imageUpload = document.getElementById('imageUpload');
    if (imageUpload.files.length > 0 && !uploadedImageFilename) {
        showNotification('Uploading image...', 'Please wait', 'info');
        const uploadSuccess = await handleImageUpload();
        if (!uploadSuccess) {
            return;
        }
    }
    
    const data = {
        prompt: prompt,
        width: parseInt(document.getElementById('width').value),
        height: parseInt(document.getElementById('height').value),
        steps: parseInt(document.getElementById('steps').value),
        cfg: parseFloat(document.getElementById('cfg').value),
        shift: parseFloat(document.getElementById('shift').value),
        seed: document.getElementById('seed').value ? parseInt(document.getElementById('seed').value) : null,
        use_image: uploadedImageFilename ? true : false,
        use_image_size: document.getElementById('useImageSize').checked,
        image_filename: uploadedImageFilename,
        file_prefix: document.getElementById('filePrefix').value.trim() || 'velvet',
        subfolder: document.getElementById('subfolder').value.trim(),
        mcnl_lora: document.getElementById('mcnlLora').checked,
        snofs_lora: document.getElementById('snofsLora').checked,
        male_lora: document.getElementById('maleLora').checked
    };
    
    try {
        const response = await fetch('/api/queue', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('Job queued:', result.job_id);
            
            // Update queue immediately
            updateQueue();
            
            // Reload gallery after a delay to show new image
            setTimeout(() => browseFolder(currentPath), 3000);
            showNotification('Image added to queue', 'Queued', 'success', 3000);
        }
    } catch (error) {
        console.error('Error queueing job:', error);
        showNotification('Error queueing job. Make sure the backend is running.', 'Error', 'error');
    }
}

// Handle image upload
async function handleImageUpload() {
    const imageUpload = document.getElementById('imageUpload');
    const file = imageUpload.files[0];
    
    if (!file) {
        return false;
    }
    
    const formData = new FormData();
    formData.append('image', file);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            uploadedImageFilename = result.filename;
            showNotification('Image uploaded successfully', 'Success', 'success', 2000);
            return true;
        } else {
            showNotification(result.error || 'Upload failed', 'Error', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error uploading image:', error);
        showNotification('Error uploading image', 'Error', 'error');
        return false;
    }
}

// Handle image upload preview
function handleImagePreview() {
    const imageUpload = document.getElementById('imageUpload');
    const imagePreview = document.getElementById('imagePreview');
    const imagePreviewImg = document.getElementById('imagePreviewImg');
    const clearImageBtn = document.getElementById('clearImageBtn');
    const useImageSizeGroup = document.getElementById('useImageSizeGroup');
    
    const file = imageUpload.files[0];
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            imagePreviewImg.src = e.target.result;
            imagePreview.style.display = 'block';
            clearImageBtn.style.display = 'inline-flex';
            useImageSizeGroup.style.display = 'block';
        };
        reader.readAsDataURL(file);
        
        // Reset uploaded filename so it uploads again
        uploadedImageFilename = null;
    } else {
        imagePreview.style.display = 'none';
        clearImageBtn.style.display = 'none';
        useImageSizeGroup.style.display = 'none';
        uploadedImageFilename = null;
    }
}

// Clear uploaded image
function clearUploadedImage() {
    const imageUpload = document.getElementById('imageUpload');
    const imagePreview = document.getElementById('imagePreview');
    const clearImageBtn = document.getElementById('clearImageBtn');
    const useImageSizeGroup = document.getElementById('useImageSizeGroup');
    const useImageSize = document.getElementById('useImageSize');
    
    imageUpload.value = '';
    imagePreview.style.display = 'none';
    clearImageBtn.style.display = 'none';
    useImageSizeGroup.style.display = 'none';
    useImageSize.checked = false;
    uploadedImageFilename = null;
    
    // Show width/height again
    toggleDimensionFields();
}

// Toggle width/height visibility based on useImageSize checkbox
function toggleDimensionFields() {
    const useImageSize = document.getElementById('useImageSize');
    const widthGroup = document.getElementById('widthGroup');
    const heightGroup = document.getElementById('heightGroup');
    
    if (useImageSize.checked) {
        widthGroup.style.display = 'none';
        heightGroup.style.display = 'none';
    } else {
        widthGroup.style.display = 'block';
        heightGroup.style.display = 'block';
    }
}

// Batch image upload handlers
function handleBatchImagePreview() {
    const imageUpload = document.getElementById('batchImageUpload');
    const imagePreview = document.getElementById('batchImagePreview');
    const imagePreviewImg = document.getElementById('batchImagePreviewImg');
    const clearImageBtn = document.getElementById('clearBatchImageBtn');
    const useImageSizeGroup = document.getElementById('batchUseImageSizeGroup');
    
    const file = imageUpload.files[0];
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            imagePreviewImg.src = e.target.result;
            imagePreview.style.display = 'block';
            clearImageBtn.style.display = 'inline-flex';
            useImageSizeGroup.style.display = 'block';
        };
        reader.readAsDataURL(file);
        
        // Reset uploaded filename so it uploads again
        batchUploadedImageFilename = null;
    } else {
        imagePreview.style.display = 'none';
        clearImageBtn.style.display = 'none';
        useImageSizeGroup.style.display = 'none';
        batchUploadedImageFilename = null;
    }
}

function clearBatchUploadedImage() {
    const imageUpload = document.getElementById('batchImageUpload');
    const imagePreview = document.getElementById('batchImagePreview');
    const clearImageBtn = document.getElementById('clearBatchImageBtn');
    const useImageSizeGroup = document.getElementById('batchUseImageSizeGroup');
    const useImageSize = document.getElementById('batchUseImageSize');
    
    imageUpload.value = '';
    imagePreview.style.display = 'none';
    clearImageBtn.style.display = 'none';
    useImageSizeGroup.style.display = 'none';
    useImageSize.checked = false;
    batchUploadedImageFilename = null;
    
    // Re-enable width/height CSV checkboxes if they were disabled
    toggleBatchDimensionFields();
}

function toggleBatchDimensionFields() {
    const useImageSize = document.getElementById('batchUseImageSize');
    const widthVariable = document.getElementById('batchWidthVariable');
    const heightVariable = document.getElementById('batchHeightVariable');
    
    if (useImageSize.checked) {
        // Disable and uncheck width/height CSV options
        widthVariable.checked = false;
        widthVariable.disabled = true;
        heightVariable.checked = false;
        heightVariable.disabled = true;
    } else {
        // Re-enable width/height CSV options
        widthVariable.disabled = false;
        heightVariable.disabled = false;
    }
}

async function handleBatchImageUpload() {
    const imageUpload = document.getElementById('batchImageUpload');
    const file = imageUpload.files[0];
    
    if (!file) {
        return false;
    }
    
    const formData = new FormData();
    formData.append('image', file);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            batchUploadedImageFilename = result.filename;
            return true;
        } else {
            showNotification(result.error || 'Upload failed', 'Error', 'error');
            return false;
        }
    } catch (error) {
        console.error('Error uploading batch image:', error);
        showNotification('Error uploading image', 'Error', 'error');
        return false;
    }
}

// ============================================================================
// BATCH GENERATION FEATURES
// ============================================================================
function initializeBatchMode() {
    // Batch prompt and CSV inputs
    const batchBasePrompt = document.getElementById('batchBasePrompt');
    const batchCSV = document.getElementById('batchCSV');
    
    if (batchBasePrompt) {
        batchBasePrompt.addEventListener('input', updateBatchPreview);
        batchBasePrompt.addEventListener('paste', () => setTimeout(updateBatchPreview, 0));
        batchBasePrompt.addEventListener('change', updateBatchPreview);
    }
    
    if (batchCSV) {
        batchCSV.addEventListener('input', updateBatchPreview);
        batchCSV.addEventListener('paste', () => setTimeout(updateBatchPreview, 0));
        batchCSV.addEventListener('change', updateBatchPreview);
    }
    
    // Batch buttons
    const loadCSVFileBtn = document.getElementById('loadCSVFile');
    const csvFileInput = document.getElementById('csvFileInput');
    
    if (loadCSVFileBtn && csvFileInput) {
        loadCSVFileBtn.addEventListener('click', () => csvFileInput.click());
        csvFileInput.addEventListener('change', handleCSVFileUpload);
    }
    
    // Add event listeners to variable parameter checkboxes
    const variableCheckboxes = document.querySelectorAll('.batch-param-variable');
    variableCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateBatchPreview);
    });
}

function extractParameters(basePrompt) {
    // Extract [parameter] placeholders
    const regex = /\[([^\]]+)\]/g;
    const parameters = [];
    let match;
    
    while ((match = regex.exec(basePrompt)) !== null) {
        if (!parameters.includes(match[1])) {
            parameters.push(match[1]);
        }
    }
    
    return parameters;
}

/**
 * Split a single CSV line into fields, respecting RFC 4180 quoting:
 *  - Fields may be wrapped in double-quotes.
 *  - A literal double-quote inside a quoted field is escaped as "".
 *  - Commas inside quoted fields are not treated as delimiters.
 *  - Leading/trailing whitespace outside quotes is trimmed.
 */
function parseCSVLine(line) {
    const fields = [];
    let i = 0;
    while (i < line.length) {
        // Skip leading whitespace before field
        while (i < line.length && line[i] === ' ') i++;

        if (line[i] === '"') {
            // Quoted field
            i++; // skip opening quote
            let field = '';
            while (i < line.length) {
                if (line[i] === '"') {
                    if (line[i + 1] === '"') {
                        // Escaped double-quote ("") → literal "
                        field += '"';
                        i += 2;
                    } else {
                        // Closing quote
                        i++;
                        break;
                    }
                } else {
                    field += line[i];
                    i++;
                }
            }
            fields.push(field);
            // Skip whitespace and then expect comma or end
            while (i < line.length && line[i] === ' ') i++;
            if (line[i] === ',') i++;
        } else {
            // Unquoted field — read until next comma
            let start = i;
            while (i < line.length && line[i] !== ',') i++;
            fields.push(line.slice(start, i).trim());
            if (line[i] === ',') i++;
        }
    }
    // Handle trailing comma → empty last field
    if (line.trimEnd().endsWith(',')) fields.push('');
    return fields;
}

function parseCSV(csvText) {
    const lines = csvText.trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) return null;

    const headers = parseCSVLine(lines[0]).map(h => h.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === headers.length) {
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index];
            });
            rows.push(row);
        }
    }

    return { headers, rows };
}

function replaceParameters(basePrompt, paramValues) {
    let result = basePrompt;
    for (const [param, value] of Object.entries(paramValues)) {
        result = result.replace(new RegExp(`\\[${param}\\]`, 'g'), value);
    }
    return result;
}

function getVariableParameters() {
    // Returns list of parameter names that should come from CSV
    const variableParams = [];
    
    if (document.getElementById('batchWidthVariable').checked) variableParams.push('width');
    if (document.getElementById('batchHeightVariable').checked) variableParams.push('height');
    if (document.getElementById('batchStepsVariable').checked) variableParams.push('steps');
    if (document.getElementById('batchCfgVariable').checked) variableParams.push('cfg');
    if (document.getElementById('batchShiftVariable').checked) variableParams.push('shift');
    if (document.getElementById('batchSeedVariable').checked) variableParams.push('seed');
    if (document.getElementById('batchFilePrefixVariable').checked) variableParams.push('file_prefix');
    if (document.getElementById('batchSubfolderVariable').checked) variableParams.push('subfolder');
    if (document.getElementById('batchMcnlLoraVariable').checked) variableParams.push('mcnl_lora');
    if (document.getElementById('batchSnofsLoraVariable').checked) variableParams.push('snofs_lora');
    if (document.getElementById('batchMaleLoraVariable').checked) variableParams.push('male_lora');
    
    return variableParams;
}

function updateBatchPreview() {
    const basePrompt = document.getElementById('batchBasePrompt').value.trim();
    const csvText = document.getElementById('batchCSV').value.trim();
    const detectedParams = document.getElementById('detectedParameters');
    const batchPreview = document.getElementById('batchPreview');
    const queueBatchBtn = document.getElementById('queueBatchBtn');
    const batchCount = document.getElementById('batchCount');
    
    // Extract parameters from base prompt
    detectedBatchParameters = extractParameters(basePrompt);
    const variableParams = getVariableParameters();
    const allRequiredParams = [...detectedBatchParameters, ...variableParams];
    
    if (detectedParams) {
        const displayParts = [];
        if (detectedBatchParameters.length > 0) {
            displayParts.push(detectedBatchParameters.join(', '));
        }
        if (variableParams.length > 0) {
            displayParts.push(`+ ${variableParams.length} variable param(s)`);
        }
        
        if (displayParts.length > 0) {
            detectedParams.textContent = displayParts.join(' ');
            detectedParams.style.color = 'var(--primary)';
        } else {
            detectedParams.textContent = 'None';
            detectedParams.style.color = 'var(--text-muted)';
        }
    }
    
    // Parse CSV / simple list
    if (!csvText) {
        batchPreview.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">Enter prompts or CSV data above to preview the batch</div>';
        queueBatchBtn.disabled = true;
        batchCount.textContent = '0';
        batchPreviewData = [];
        return;
    }

    // ── Simple mode: no base prompt ──────────────────────────────────────────
    // Each non-empty line is treated as a complete prompt for one image.
    if (!basePrompt) {
        const lines = csvText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) {
            batchPreview.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">Enter prompts or CSV data above to preview the batch</div>';
            queueBatchBtn.disabled = true;
            batchCount.textContent = '0';
            batchPreviewData = [];
            return;
        }
        batchPreviewData = lines.map(line => ({ prompt: line, params: {} }));
        let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';
        batchPreviewData.forEach((item, index) => {
            html += `
                <div style="padding: 0.75rem; background: var(--bg-secondary); border-radius: 4px; border-left: 3px solid var(--primary);">
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.25rem;">Image ${index + 1}</div>
                    <div style="font-size: 0.95rem; color: var(--text);">${escapeHtml(item.prompt)}</div>
                </div>
            `;
        });
        html += '</div>';
        batchPreview.innerHTML = html;
        queueBatchBtn.disabled = false;
        batchCount.textContent = batchPreviewData.length.toString();
        return;
    }

    // ── Template mode: base prompt has [param] placeholders ──────────────────
    const csvData = parseCSV(csvText);
    if (!csvData) {
        batchPreview.innerHTML = '<div style="text-align: center; color: var(--warning); padding: 2rem;">Invalid CSV format. First row should be parameter names, followed by value rows.</div>';
        queueBatchBtn.disabled = true;
        batchCount.textContent = '0';
        batchPreviewData = [];
        return;
    }
    
    // Check if CSV headers match parameters (both prompt and variable params)
    const missingParams = allRequiredParams.filter(p => !csvData.headers.includes(p));
    const extraHeaders = csvData.headers.filter(h => !allRequiredParams.includes(h));
    
    if (missingParams.length > 0) {
        batchPreview.innerHTML = `<div style="text-align: center; color: var(--warning); padding: 2rem;">Missing CSV columns: ${missingParams.join(', ')}<br><small style="color: var(--text-muted);">Add these columns to your CSV header row, or leave the base prompt empty to generate one image per line.</small></div>`;
        queueBatchBtn.disabled = true;
        batchCount.textContent = '0';
        batchPreviewData = [];
        return;
    }

    if (csvData.rows.length === 0) {
        batchPreview.innerHTML = '<div style="text-align: center; color: var(--warning); padding: 2rem;">No valid data rows found. Check that your CSV rows have the same number of columns as the header.</div>';
        queueBatchBtn.disabled = true;
        batchCount.textContent = '0';
        batchPreviewData = [];
        return;
    }
    
    // Generate preview
    batchPreviewData = csvData.rows.map(row => {
        const prompt = replaceParameters(basePrompt, row);
        return { prompt, params: row };
    });
    
    let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';
    batchPreviewData.forEach((item, index) => {
        // Build parameter info display
        const paramInfo = [];
        variableParams.forEach(param => {
            if (item.params[param] !== undefined) {
                paramInfo.push(`${param}: ${item.params[param]}`);
            }
        });
        const paramDisplay = paramInfo.length > 0 ? `<div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">${escapeHtml(paramInfo.join(', '))}</div>` : '';
        
        html += `
            <div style="padding: 0.75rem; background: var(--bg-secondary); border-radius: 4px; border-left: 3px solid var(--primary);">
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.25rem;">Image ${index + 1}</div>
                <div style="font-size: 0.95rem; color: var(--text);">${escapeHtml(item.prompt)}</div>
                ${paramDisplay}
            </div>
        `;
    });
    html += '</div>';
    
    if (extraHeaders.length > 0) {
        html = `<div style="color: var(--warning); font-size: 0.9rem; margin-bottom: 0.75rem; padding: 0.5rem; background: var(--bg-secondary); border-radius: 4px;">
            ⚠️ Extra CSV columns (will be ignored): ${extraHeaders.join(', ')}
        </div>` + html;
    }
    
    batchPreview.innerHTML = html;
    queueBatchBtn.disabled = false;
    batchCount.textContent = batchPreviewData.length.toString();
}

async function queueBatchGeneration() {
    if (batchPreviewData.length === 0) {
        showNotification('No valid batch data to queue', 'Empty Batch', 'warning');
        return;
    }
    // Save each unique prompt from the batch preview to image history
    if (Array.isArray(batchPreviewData)) {
        batchPreviewData.forEach(item => { if (item.prompt) savePromptToHistory(item.prompt, 'image'); });
    }
    
    // Check if batch image needs to be uploaded first
    const batchImageUpload = document.getElementById('batchImageUpload');
    if (batchImageUpload.files.length > 0 && !batchUploadedImageFilename) {
        showNotification('Uploading image...', 'Please wait', 'info');
        const uploadSuccess = await handleBatchImageUpload();
        if (!uploadSuccess) {
            return;
        }
    }
    
    // Get default parameters
    const useImageSize = document.getElementById('batchUseImageSize').checked;
    const defaults = {
        width: parseInt(document.getElementById('batchWidth').value),
        height: parseInt(document.getElementById('batchHeight').value),
        steps: parseInt(document.getElementById('batchSteps').value),
        cfg: parseFloat(document.getElementById('batchCfg').value),
        shift: parseFloat(document.getElementById('batchShift').value),
        seed: document.getElementById('batchSeed').value ? parseInt(document.getElementById('batchSeed').value) : null,
        file_prefix: document.getElementById('batchFilePrefix').value.trim() || 'batch',
        subfolder: document.getElementById('batchSubfolder').value.trim(),
        mcnl_lora: document.getElementById('batchMcnlLora').checked,
        snofs_lora: document.getElementById('batchSnofsLora').checked,
        male_lora: document.getElementById('batchMaleLora').checked,
        use_image: batchUploadedImageFilename ? true : false,
        use_image_size: useImageSize,
        image_filename: batchUploadedImageFilename
    };
    
    const variableParams = getVariableParameters();
    
    // Prepare batch jobs
    const jobs = batchPreviewData.map(item => {
        const job = {
            prompt: item.prompt,
            width: defaults.width,
            height: defaults.height,
            steps: defaults.steps,
            cfg: defaults.cfg,
            shift: defaults.shift,
            seed: defaults.seed,
            file_prefix: defaults.file_prefix,
            subfolder: defaults.subfolder,
            mcnl_lora: defaults.mcnl_lora,
            snofs_lora: defaults.snofs_lora,
            male_lora: defaults.male_lora,
            use_image: defaults.use_image,
            use_image_size: defaults.use_image_size,
            image_filename: defaults.image_filename
        };
        
        // Override with CSV values for variable parameters
        // Skip width/height from CSV if use_image_size is enabled
        variableParams.forEach(param => {
            // Skip width/height if using image size
            if (defaults.use_image_size && (param === 'width' || param === 'height')) {
                return;
            }
            
            if (item.params[param] !== undefined) {
                const value = item.params[param];
                
                // Convert types appropriately
                if (param === 'width' || param === 'height' || param === 'steps' || param === 'seed') {
                    job[param] = value ? parseInt(value) : (param === 'seed' ? null : job[param]);
                } else if (param === 'cfg' || param === 'shift') {
                    job[param] = value ? parseFloat(value) : job[param];
                } else if (param === 'mcnl_lora' || param === 'snofs_lora' || param === 'male_lora') {
                    // Convert to boolean (true/false, yes/no, 1/0)
                    const lowerValue = String(value).toLowerCase().trim();
                    job[param] = lowerValue === 'true' || lowerValue === 'yes' || lowerValue === '1';
                } else {
                    job[param] = value;
                }
            }
        });
        
        return job;
    });
    
    try {
        const response = await fetch('/api/queue/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobs: jobs })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(`Queued ${result.queued_count} images successfully`, 'Batch Queued', 'success', 3000);
            updateQueue();
        } else {
            showNotification('Error: ' + result.error, 'Queue Failed', 'error');
        }
    } catch (error) {
        console.error('Error queueing batch:', error);
        showNotification('Error queueing batch', 'Error', 'error');
    }
}

async function handleCSVFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        const text = await file.text();
        document.getElementById('batchCSV').value = text;
        updateBatchPreview();
        showNotification('CSV file loaded successfully', 'Loaded', 'success', 2000);
    } catch (error) {
        console.error('Error reading CSV file:', error);
        showNotification('Error reading CSV file', 'Error', 'error');
    }
    
    // Reset file input
    event.target.value = '';
}

// ============================================================================
// IMAGE BATCH FEATURES
// ============================================================================

function initializeImageBatch() {
    const chooseBtn = document.getElementById('chooseImageBatchFolderBtn');
    const queueBtn = document.getElementById('queueImageBatchBtn');
    const useOriginalSize = document.getElementById('imageBatchUseOriginalSize');
    const useCustomSize = document.getElementById('imageBatchUseCustomSize');
    
    if (chooseBtn) {
        chooseBtn.addEventListener('click', () => {
            selectedImageBatchFolder = '';
            openImageBrowser('image-batch');
        });
    }
    if (queueBtn) {
        queueBtn.addEventListener('click', queueImageBatchGeneration);
    }
    
    // Add event listeners for size mode radio buttons
    if (useOriginalSize) {
        useOriginalSize.addEventListener('change', toggleImageBatchSizeFields);
    }
    if (useCustomSize) {
        useCustomSize.addEventListener('change', toggleImageBatchSizeFields);
    }
}

function toggleImageBatchSizeFields() {
    const useCustomSize = document.getElementById('imageBatchUseCustomSize');
    const widthField = document.getElementById('imageBatchWidth');
    const heightField = document.getElementById('imageBatchHeight');
    
    if (useCustomSize && useCustomSize.checked) {
        widthField.disabled = false;
        heightField.disabled = false;
    } else {
        widthField.disabled = true;
        heightField.disabled = true;
    }
}

async function queueImageBatchGeneration() {
    const prompt = document.getElementById('imageBatchPrompt').value.trim();
    if (!prompt) {
        showNotification('Please enter a prompt', 'Missing Prompt', 'warning');
        return;
    }
    savePromptToHistory(prompt, 'image');
    const folderPath = selectedImageBatchFolder || currentBrowserSubpath || '';
    const useOriginalSize = document.getElementById('imageBatchUseOriginalSize').checked;
    const width = parseInt(document.getElementById('imageBatchWidth').value);
    const height = parseInt(document.getElementById('imageBatchHeight').value);
    const steps = parseInt(document.getElementById('imageBatchSteps').value);
    const cfg = parseFloat(document.getElementById('imageBatchCfg').value);
    const shift = parseFloat(document.getElementById('imageBatchShift').value);
    const seedVal = document.getElementById('imageBatchSeed').value.trim();
    const seed = seedVal ? parseInt(seedVal) : null;
    const file_prefix = document.getElementById('imageBatchFilePrefix').value.trim() || 'image_batch';
    const subfolder = document.getElementById('imageBatchSubfolder').value.trim();
    const mcnl_lora = document.getElementById('imageBatchMcnlLora').checked;
    const snofs_lora = document.getElementById('imageBatchSnofsLora').checked;
    const male_lora = document.getElementById('imageBatchMaleLora').checked;

    try {
        const response = await fetch('/api/queue/image-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt,
                folder: folderPath,
                use_original_size: useOriginalSize,
                width,
                height,
                steps,
                cfg,
                shift,
                seed,
                file_prefix,
                subfolder,
                mcnl_lora,
                snofs_lora,
                male_lora
            })
        });
        const result = await response.json();
        if (result.success) {
            showNotification(`Queued ${result.queued_count} image(s) from folder`, 'Image Batch Queued', 'success', 3000);
            updateQueue();
        } else {
            showNotification('Error: ' + (result.error || 'Failed to queue image batch'), 'Error', 'error');
        }
    } catch (error) {
        console.error('Error queueing image batch:', error);
        showNotification('Error queueing image batch', 'Error', 'error');
    }
}

// ===== Text Batch Instructions =====

async function showBatchInstructions() {
    const modal = document.getElementById('batchInstructionsModal');
    const content = document.getElementById('batchInstructionsContent');
    
    if (!modal || !content) return;
    
    // Show modal with loading state
    modal.style.display = 'flex';
    content.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">Loading instructions...</div>';
    
    try {
        const response = await fetch('/api/batch-instructions');
        const data = await response.json();
        
        if (data.success && data.content) {
            // Convert markdown to HTML (simple implementation)
            const htmlContent = markdownToHtml(data.content);
            content.innerHTML = htmlContent;
        } else {
            content.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--warning);">Failed to load instructions</div>';
        }
    } catch (error) {
        console.error('Error loading instructions:', error);
        content.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--warning);">Error loading instructions</div>';
    }
}

function markdownToHtml(markdown) {
    let html = markdown;
    
    // Code blocks
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h4>$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^# (.*$)/gim, '<h2>$1</h2>');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code style="background: var(--bg); padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 0.9em;">$1</code>');
    
    // Horizontal rules
    html = html.replace(/^---$/gim, '<hr style="border: none; border-top: 2px solid var(--border); margin: 1.5rem 0;">');
    
    // Tables
    html = html.replace(/\|(.+)\|\n\|[-:\s|]+\|\n((?:\|.+\|\n?)*)/g, function(match, header, rows) {
        const headerCells = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
        const rowsHtml = rows.trim().split('\n').map(row => {
            const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
            return `<tr>${cells}</tr>`;
        }).join('');
        return `<table style="width: 100%; border-collapse: collapse; margin: 1rem 0;"><thead><tr>${headerCells}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
    });
    
    // Lists
    html = html.replace(/^\d+\.\s+(.+)$/gim, '<li>$1</li>');
    html = html.replace(/^[-*]\s+(.+)$/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul style="margin: 0.5rem 0; padding-left: 1.5rem;">$1</ul>');
    
    // Paragraphs
    html = html.split('\n\n').map(para => {
        if (para.startsWith('<h') || para.startsWith('<pre') || para.startsWith('<ul') || 
            para.startsWith('<ol') || para.startsWith('<hr') || para.startsWith('<table') ||
            para.trim() === '') {
            return para;
        }
        return `<p style="margin: 0.75rem 0;">${para}</p>`;
    }).join('\n');
    
    return html;
}

async function copyBatchInstructions() {
    const button = document.getElementById('copyInstructionsBtn');
    try {
        const response = await fetch('/api/batch-instructions');
        const data = await response.json();
        
        if (data.success && data.content) {
            copyChatMessage(data.content, button);
            setTimeout(() => {
                showNotification('Instructions copied to clipboard', 'Success', 'success');
            }, 100);
        } else {
            showNotification('Failed to copy instructions', 'Error', 'error');
        }
    } catch (error) {
        console.error('Error copying instructions:', error);
        showNotification('Failed to copy instructions', 'Error', 'error');
    }
}

function closeBatchInstructions() {
    const modal = document.getElementById('batchInstructionsModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Add event listeners for batch instructions
document.addEventListener('DOMContentLoaded', function() {
    const showBtn = document.getElementById('showBatchInstructionsBtn');
    const copyBtn = document.getElementById('copyInstructionsBtn');
    const closeBtn = document.getElementById('closeBatchInstructionsBtn');
    const modal = document.getElementById('batchInstructionsModal');
    const overlay = modal?.querySelector('.custom-modal-overlay');
    
    if (showBtn) {
        showBtn.addEventListener('click', showBatchInstructions);
    }
    
    if (copyBtn) {
        copyBtn.addEventListener('click', copyBatchInstructions);
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeBatchInstructions);
    }
    
    if (overlay) {
        overlay.addEventListener('click', closeBatchInstructions);
    }
    
    // ESC key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
            closeBatchInstructions();
        }
    });
});
