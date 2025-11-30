const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const cssPath = path.join(__dirname, '../domains/production/styles/production.css');
const searchDir = path.join(__dirname, '../domains/production');

// Define explicit class renames. oldClass and newClass are WITHOUT the leading dot.
// This map contains only simple class names. Compound selectors will be handled dynamically.
const classRenameMap = {
    // Table Standardization (Addressing the regression)
    'mes-table': 'table',
    'mes-table-container': 'table-container-mes-specific',
    'mes-table-body': 'table-body',
    'mes-table-row': 'table-row',
    'mes-table-header': 'table-header',
    'mes-code-text': 'code-text',
    'mes-tag-group': 'tag-group',
    'mes-tag': 'tag-item',

    // Text Standardization
    'detail-value-muted': 'text-muted',
    'view-text-sm': 'text-muted',
    'view-text-11-gray': 'text-muted',
    'text-muted-xs': 'text-muted',

    'view-empty-center': 'empty-message',
    'pm-empty': 'empty-message',

    'view-error-text': 'text-error',
    'modal-error-state': 'text-error',
    'pm-error': 'text-error',

    'text-primary': 'detail-value',
    'detail-value-text': 'detail-value',

    'empty-state-center': 'empty-message',

    'station-loading-text': 'loading-text',
    'loading-text-muted': 'loading-text',

    // Detail rows/labels
    'view-detail-label': 'detail-label',
    'station-detail-label': 'detail-label',

    'view-detail-value': 'detail-value',
    'station-detail-value': 'detail-value',

    'view-detail-row': 'detail-row',
    'station-detail-row': 'detail-row',

    'view-modal-title-lg': 'modal-title',

    // Card types
    'detail-section': 'section-card',
    'station-detail-section': 'section-card',
    'view-card': 'section-card',
    'worker-card': 'section-card',
    'station-card': 'section-card',

    // Flex Layouts
    'view-flex-between': 'flex-between',
    'skill-card-content': 'flex-between',
    'view-flex-center-gap': 'flex-center-gap',
    'substation-title-row': 'flex-center-gap',
};

// --- Helper Functions ---
// Robust CSS Parser to extract blocks and properties
function parseCssIntoBlocks(css) {
    const blocks = [];
    let currentBlockContent = '';
    let currentSelector = '';
    let depth = 0;
    let inComment = false;
    let commentsBeforeBlock = [];

    for (let i = 0; i < css.length; i++) {
        const char = css[i];
        const nextChar = css[i + 1];

        // Handle comments
        if (!inComment && char === '/' && nextChar === '*') {
            inComment = true;
            commentsBeforeBlock.push('/*'); // Start of comment
            i++; // Skip '*'
            continue;
        } else if (inComment && char === '*' && nextChar === '/') {
            inComment = false;
            commentsBeforeBlock[commentsBeforeBlock.length - 1] += '*/'; // End of comment
            i++; // Skip '/'
            continue;
        } else if (inComment) {
            commentsBeforeBlock[commentsBeforeBlock.length - 1] += char;
            continue;
        }

        // Handle selector and body parsing
        if (char === '{') {
            if (depth === 0) { // Start of a new rule block
                currentSelector = currentBlockContent.trim();
                currentBlockContent = ''; // Clear for body content
            }
            depth++;
            currentBlockContent += char;
        } else if (char === '}') {
            depth--;
            currentBlockContent += char;
            if (depth === 0 && currentSelector) { // End of a rule block
                const body = currentBlockContent.substring(1, currentBlockContent.length - 1).trim();
                const properties = {};
                body.split(';').forEach(decl => {
                    const [prop, val] = decl.split(':').map(s => s.trim());
                    if (prop && val) properties[prop.toLowerCase()] = val;
                });

                blocks.push({
                    selector: currentSelector,
                    properties: properties,
                    fullContent: `${currentSelector} ${currentBlockContent}`,
                    comments: commentsBeforeBlock
                });
                currentSelector = '';
                currentBlockContent = '';
                commentsBeforeBlock = [];
            }
        } else {
            currentBlockContent += char;
        }
    }
    return blocks;
}

// Helper: Normalize selector (remove whitespace, newlines, etc.)
function normalizeSelector(selector) {
    return selector.replace(/\s+/g, ' ').trim();
}

// --- Main Script Logic ---
console.log(`Starting Refactoring Process for ${Object.keys(classRenameMap).length} class renames...`);

// 1. Update Codebase (HTML/JS/JSX files)
function replaceInCodebase(oldClass, newClass) {
    const escapedOld = oldClass.replace(/[-\/\\^$*+?.()|[\\]{}]/g, '\\$&');
    
    // This regex targets class="..." or className="..." attributes
    // It uses (\s|^) and (\s|$) to ensure whole word replacement within the attribute value
    const classAttrPattern = new RegExp(`((?:class|className)=["'][^"']*)(\b${escapedOld}\b)([^"']*["'])`, 'g');
    
    // This regex targets JS string literals (e.g., classList.add('old-class'), 'old-class' in template literals)
    // It replaces 'old-class' only if it's a whole word.
    const jsStringPattern = new RegExp(`(['"\][^'\]*?)(\b${escapedOld}\b)([^'\]*['"\])`, 'g');


    console.log(`Refactoring in codebase: .${oldClass} -> .${newClass}`);

    try {
        // Broad grep to find files that MIGHT contain the old class name
        const findCmd = `grep -r -l "${escapedOld}" "${searchDir}" --exclude="production.css" --exclude-dir="node_modules"`;
        const files = execSync(findCmd).toString().trim().split('\n').filter(f => f);

        if (files.length === 0) {
            console.log(`  No usage found for .${oldClass} in codebase (excluding CSS).`);
            return;
        }

        console.log(`  Found usage in ${files.length} files.`);

        files.forEach(file => {
            let content = fs.readFileSync(file, 'utf8');
            let originalContent = content;

            // Apply replacements using robust patterns
            content = content.replace(classAttrPattern, `$1${newClass}$3`);
            content = content.replace(jsStringPattern, `$1${newClass}$3`);

            if (content !== originalContent) {
                fs.writeFileSync(file, content);
                console.log(`    Updated ${path.basename(file)}`);
            }
        });

    } catch (e) {
        // grep returns exit code 1 if not found, which throws error in execSync
        if (e.status !== 1) console.error(`  Error searching for .${oldClass}:`, e.message);
        else console.log(`  No usage found for .${oldClass} in codebase (grep exit 1).`);
    }
}

for (const oldClass in classRenameMap) {
    replaceInCodebase(oldClass, classRenameMap[oldClass]);
}


// 2. Refactor production.css (Rename and Merge Styles)
console.log('\nRefactoring production.css: Renaming and Merging Styles...');

let cssContent = fs.readFileSync(cssPath, 'utf8');
const originalBlocks = parseCssIntoBlocks(cssContent); // Use a distinct name for original blocks
const uniqueBlocksToOutput = new Map(); // Map: normalizedSelector -> blockObject

// First, populate with all original blocks
originalBlocks.forEach(block => {
    uniqueBlocksToOutput.set(normalizeSelector(block.selector), block);
});

// Now, process renames and merges
for (const oldClass in classRenameMap) {
    const newClass = classRenameMap[oldClass];
    const oldSelector = `.${oldClass}`;
    const newSelector = `.${newClass}`;

    const oldBlock = uniqueBlocksToOutput.get(normalizeSelector(oldSelector));
    
    if (oldBlock) {
        // Remove the old block from the map (it will be replaced or merged)
        uniqueBlocksToOutput.delete(normalizeSelector(oldSelector));

        let targetBlock = uniqueBlocksToOutput.get(normalizeSelector(newSelector));

        if (targetBlock) {
            // New class exists, merge old class's properties into new class
            console.log(`  Merging styles from .${oldClass} into .${newClass}`);
            Object.assign(targetBlock.properties, oldBlock.properties); // Last one wins for conflicts
            // Regenerate fullContent for the target block
            targetBlock.fullContent = `${targetBlock.selector} { ${Object.entries(targetBlock.properties).map(([p, v]) => `${p}: ${v}`).join('; ')} }`;
            uniqueBlocksToOutput.set(normalizeSelector(newSelector), targetBlock); // Update map entry
        } else {
            // New class does not exist, simply rename the selector of the old block
            console.log(`  Renaming .${oldClass} to .${newClass} in CSS.`);
            oldBlock.selector = newSelector;
            // Regenerate fullContent for the renamed block
            oldBlock.fullContent = `${newSelector} { ${Object.entries(oldBlock.properties).map(([p, v]) => `${p}: ${v}`).join('; ')} }`;
            uniqueBlocksToOutput.set(normalizeSelector(newSelector), oldBlock); // Add renamed block to map
        }
    }
}

// Final reconstruction of CSS content from the map (which has unique, merged/renamed blocks)
let outputCss = '';
uniqueBlocksToOutput.forEach(block => {
    // Add comments
    if (block.comments && block.comments.length > 0) {
        // Filter out comments that are just '/*' and '*/' due to parsing
        const cleanComments = block.comments.filter(c => c.length > 3 || c.includes('\n'));
        if (cleanComments.length > 0) {
            outputCss += cleanComments.join('\n') + '\n';
        }
    }
    outputCss += block.fullContent + '\n\n';
});


fs.writeFileSync(cssPath, outputCss);

console.log(`Done! Standardized CSS written to ${cssPath}.`);