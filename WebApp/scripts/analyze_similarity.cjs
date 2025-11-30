const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const cssPath = path.join(__dirname, '../domains/production/styles/production.css');
const searchDir = path.join(__dirname, '../domains/production');

// Helper: Parse CSS into objects
function parseCSS(css) {
    const classes = {};
    let currentBlock = '';
    let depth = 0;
    let inComment = false;
    let currentComment = '';
    let i = 0;

    while (i < css.length) {
        const char = css[i];

        // Skip comments
        if (inComment) {
            currentComment += char;
            if (currentComment.endsWith('*/')) { inComment = false; currentComment = ''; } 
            i++; continue;
        }
        if (char === '/' && css[i+1] === '*') {
            inComment = true;
            currentComment += '/*';
            i += 2;
            continue;
        }

        if (char === '{') {
            depth++;
            currentBlock += char;
            i++;
            continue;
        }
        if (char === '}') {
            depth--;
            currentBlock += char;
            if (depth === 0) {
                const trimmed = currentBlock.trim();
                if (trimmed) {
                    // Extract selector
                    const match = trimmed.match(/^([^{]+)\{(.*)\}$/s);
                    if (match) {
                        const selectorGroup = match[1].trim();
                        const body = match[2].trim();
                        
                        // Skip keyframes, media queries for now (focus on classes)
                        if (!selectorGroup.startsWith('@')) {
                            // Clean properties
                            const props = {};
                            body.split(';').forEach(line => {
                                const [k, v] = line.split(':').map(s => s.trim());
                                if (k && v) props[k.toLowerCase()] = v;
                            });
                            
                            // Split comma separated selectors (e.g. .btn, .btn-primary)
                            selectorGroup.split(',').forEach(sel => {
                                const className = sel.trim();
                                // Only analyze classes
                                if (className.startsWith('.')) {
                                    classes[className] = {
                                        props: props,
                                        rawBody: body,
                                        propCount: Object.keys(props).length
                                    };
                                }
                            });
                        }
                    }
                }
                currentBlock = '';
            }
            i++;
            continue;
        }

        if (char.trim() || depth > 0 || currentBlock.length > 0) {
            currentBlock += char;
        }
        i++;
    }
    return classes;
}

// Helper: Get usage count
function getUsageCount(className) {
    try {
        // Remove dot for grep
        const name = className.substring(1);
        // grep recursively, counting lines
        const cmd = `grep -r "${name}" "${searchDir}" --exclude="production.css" --exclude-dir="node_modules" | wc -l`;
        return parseInt(execSync(cmd).toString().trim(), 10);
    } catch (e) {
        return 0;
    }
}

// Helper: Calculate Similarity
function calculateSimilarity(classA, classB) {
    const propsA = classA.props;
    const propsB = classB.props;
    const keysA = Object.keys(propsA);
    const keysB = Object.keys(propsB);
    
    if (keysA.length === 0 || keysB.length === 0) return 0;

    // Find matching properties (key AND value match)
    let matches = 0;
    let differences = 0;
    
    // Check A against B
    keysA.forEach(key => {
        if (propsB[key] === propsA[key]) {
            matches++;
        } else {
            differences++;
        }
    });

    // Check B against A for extra keys in B
    keysB.forEach(key => {
        if (!propsA.hasOwnProperty(key)) {
            differences++;
        }
    });

    const totalUniqueProps = matches + differences;
    if (totalUniqueProps === 0) return 0;

    return (matches / totalUniqueProps) * 100;
}

// Main Analysis
try {
    console.log('Parsing CSS...');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    const classes = parseCSS(cssContent);
    const classNames = Object.keys(classes);
    
    console.log(`Analyzed ${classNames.length} classes. Finding similarities...`);

    const clusters = [];
    const processed = new Set();

    for (let i = 0; i < classNames.length; i++) {
        const nameA = classNames[i];
        if (processed.has(nameA)) continue;
        
        // Ignore very small utility classes (1 prop) unless identical
        if (classes[nameA].propCount < 2) continue;

        const cluster = {
            standard: nameA,
            usage: getUsageCount(nameA),
            props: classes[nameA].props,
            variants: []
        };

        processed.add(nameA);

        for (let j = i + 1; j < classNames.length; j++) {
            const nameB = classNames[j];
            if (processed.has(nameB)) continue;
            if (classes[nameB].propCount < 2) continue;

            const similarity = calculateSimilarity(classes[nameA], classes[nameB]);

            // THRESHOLD: 95% Similarity
            if (similarity >= 95) {
                const usageB = getUsageCount(nameB);
                
                cluster.variants.push({
                    name: nameB,
                    usage: usageB,
                    similarity: similarity.toFixed(1)
                });
                processed.add(nameB);
            }
        }

        if (cluster.variants.length > 0) {
            // Determine the true "Standard" based on usage
            let maxUsage = cluster.usage;
            let bestClass = cluster.standard;

            cluster.variants.forEach(v => {
                if (v.usage > maxUsage) {
                    maxUsage = v.usage;
                    bestClass = v.name;
                }
                // Tie-breaker: shorter name usually implies standard/utility
                else if (v.usage === maxUsage && v.name.length < bestClass.length) {
                    bestClass = v.name;
                }
            });

            // Re-orient cluster around the best class
            if (bestClass !== cluster.standard) {
                // Old standard becomes a variant
                cluster.variants.push({
                    name: cluster.standard,
                    usage: cluster.usage,
                    similarity: '100.0' // Approximately
                });
                cluster.standard = bestClass;
                cluster.usage = maxUsage;
                // Filter out the new standard from variants
                cluster.variants = cluster.variants.filter(v => v.name !== bestClass);
            }
            
            clusters.push(cluster);
        }
    }

    // Sort clusters by number of variants (highest impact first)
    clusters.sort((a, b) => b.variants.length - a.variants.length);

    // Generate Report
    let report = '# CSS Similarity & Standardization Report\n\n';
    report += '> Classes with ≥95% similarity grouped together. Suggested "Standard" is the most used or shortest name.\n\n';
    clusters.forEach(cluster => {
        report += `### Group: \\'${cluster.standard}\\' (Usage: ${cluster.usage})\n`;
        report += '```css\n' + JSON.stringify(cluster.props, null, 2).replace(/[{} ""]/g, '') + '\n```\n';
        report += '| Variant (Candidate for Removal) | Usage | Similarity |\n';
        report += '|---|---|---|\n';
        cluster.variants.forEach(v => {
            report += `| \'{${v.name}}\' | ${v.usage} | ${v.similarity}% |\n`;
        });
        report += '\n---\n';
    });

    const reportFile = path.join(__dirname, '../domains/production/styles/CSS_SIMILARITY_REPORT.md');
    fs.writeFileSync(reportFile, report);
    console.log(`Report generated at ${reportFile}`);
    console.log(`Found ${clusters.length} clusters containing potential duplicates.`);

} catch (e) {
    console.error('Error:', e);
}
