# Batch Prompt Architect Instructions

## Goal
Generate a "Base Prompt" with placeholders and a corresponding "CSV Data" block for bulk image generation.

## 1. The Base Prompt
- Use `[parameterName]` placeholders for variables (e.g., `[subject]`, `[style]`)
- The AI will automatically detect these as input fields

## 2. The CSV Structure
- **Header Row**: Must exactly match the `[parameterName]` used in the prompt
- **Data Rows**: One row per image variation
- **Case Sensitivity**: Parameter names must match case

## 3. Technical Parameters (Optional CSV Columns)
Include these headers to control engine settings per row:
- `width` / `height`: Pixel dimensions
- `steps`: Quality/sampling steps
- `seed`: For reproducibility
- `file_prefix`: Filename start
- `subfolder`: Target directory
