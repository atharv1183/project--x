const fs = require('fs');
const path = require('path');

const blogsDir = 'D:/ADS Internship/blogs';
const indexFile = 'src/data/content/index.ts';

async function main() {
  let indexContent = fs.readFileSync(indexFile, 'utf8');
  
  // First fix the 6 mistakes
  indexContent = indexContent.replace(/category: 'City',/g, "category: 'City Pages',");

  const files = fs.readdirSync(blogsDir).filter(f => f.endsWith('.md'));
  
  let newEntries = [];

  for (const file of files) {
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
    let content = text.replace(/.*\*\*Meta Title:\*\*.*(\r?\n)+/i, '')
                      .replace(/.*Meta Title:.*(\r?\n)+/i, '')
                      .replace(/.*\*\*Meta Description:\*\*.*(\r?\n)+/i, '')
                      .replace(/.*Meta Description:.*(\r?\n)+/i, '')
                      .trim();
    
    // Ensure content starts cleanly (sometimes there are markdown dividers '---')
    if (content.startsWith('---')) {
      content = content.replace(/^---\s*(\r?\n)+/, '').trim();
    }

    const slug = file.replace(/\.md$/, '');

    // Format content inside template literals. Need to escape backticks and ${}
    const escapedContent = content.replace(/`/g, '\\`').replace(/\$/g, '\\$');

    const entry = `  {
    slug: '${slug}',
    type: 'city',
    title: '${title.replace(/'/g, "\\'")}',
    category: 'City Pages',
    date: '23 July 2026',
    description: '${description.replace(/'/g, "\\'")}',
    featured: false,
    content: \`${escapedContent}\`
  }`;

    newEntries.push(entry);
  }

  // Insert before the last `];`
  const lastBracketIndex = indexContent.lastIndexOf('];');
  if (lastBracketIndex === -1) {
    throw new Error('Could not find closing bracket in index.ts');
  }

  const before = indexContent.slice(0, lastBracketIndex).trimEnd();
  // if the array ended with a comma, great. If not, we might need one.
  const hasComma = before.endsWith(',');
  
  const separator = hasComma ? '\n' : ',\n';
  
  const finalContent = before + separator + newEntries.join(',\n') + '\n];\n';
  
  fs.writeFileSync(indexFile, finalContent);
  console.log(`Successfully added ${newEntries.length} blogs to index.ts!`);
}

main().catch(console.error);
