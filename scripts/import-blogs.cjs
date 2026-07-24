const fs = require('fs');
const path = require('path');

const blogsDir = 'D:/ADS Internship/blogs';
const indexFile = 'src/data/content/index.ts';

function getTodayDate() {
  const d = new Date();
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

async function main() {
  let indexContent = fs.readFileSync(indexFile, 'utf8');
  
  // Fix any leftover 'City' categories
  indexContent = indexContent.replace(/category: 'City',/g, "category: 'City Pages',");

  // Extract existing slugs to avoid duplicates
  const existingSlugs = new Set();
  const slugMatches = indexContent.matchAll(/slug:\s*'([^']+)'/g);
  for (const match of slugMatches) {
    existingSlugs.add(match[1]);
  }

  const files = fs.readdirSync(blogsDir).filter(f => f.endsWith('.md'));
  
  let newEntries = [];
  let skipped = 0;

  for (const file of files) {
    const slug = file.replace(/\.md$/, '');

    // Skip if already imported
    if (existingSlugs.has(slug)) {
      skipped++;
      continue;
    }

    const fullPath = path.join(blogsDir, file);
    const text = fs.readFileSync(fullPath, 'utf8');

    // Parse Meta Title
    const titleMatch = text.match(/\*\*Meta Title:\*\*\s*(.+)/i) || text.match(/Meta Title:\s*(.+)/i);
    let title = titleMatch ? titleMatch[1].trim() : 'Title Not Found';
    
    // Remove " | EstatePlusCRM" or similar if present
    if (title.includes(' | ')) {
      title = title.split(' | ')[0].trim();
    }
    
    // Parse Meta Description
    const descMatch = text.match(/\*\*Meta Description:\*\*\s*(.+)/i) || text.match(/Meta Description:\s*(.+)/i);
    let description = descMatch ? descMatch[1].trim() : '';

    // Extract actual content (remove meta parts)
    let content = text.replace(/.*\*\*Meta Title:\*\*.*/i, '')
                      .replace(/.*Meta Title:.*/i, '')
                      .replace(/.*\*\*Meta Description:\*\*.*/i, '')
                      .replace(/.*Meta Description:.*/i, '')
                      .replace(/^\s*---\s*/m, '')
                      .trim();

    // Escape backticks and ${} for template literal safety
    const escapedContent = content.replace(/`/g, '\\`').replace(/\$/g, '\\$');

    const entry = `  {
    slug: '${slug}',
    type: 'city',
    title: '${title.replace(/'/g, "\\'")}',
    category: 'City Pages',
    date: '${getTodayDate()}',
    description: '${description.replace(/'/g, "\\'")}',
    featured: false,
    content: \`${escapedContent}\`
  }`;

    newEntries.push(entry);
  }

  if (newEntries.length === 0) {
    console.log(`No new blogs to add. Skipped ${skipped} already-imported file(s).`);
    fs.writeFileSync(indexFile, indexContent);
    return;
  }

  // Insert before the last `];`
  const lastBracketIndex = indexContent.lastIndexOf('];');
  if (lastBracketIndex === -1) {
    throw new Error('Could not find closing bracket in index.ts');
  }

  const before = indexContent.slice(0, lastBracketIndex).trimEnd();
  const hasComma = before.endsWith(',');
  const separator = hasComma ? '\n' : ',\n';
  
  const finalContent = before + separator + newEntries.join(',\n') + '\n];\n';
  
  fs.writeFileSync(indexFile, finalContent);
  console.log(`✓ Added ${newEntries.length} new blog(s). Skipped ${skipped} already-imported file(s).`);
}

main().catch(console.error);
