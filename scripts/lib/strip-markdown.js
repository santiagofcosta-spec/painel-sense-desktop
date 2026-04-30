'use strict';

/**
 * Converts Markdown to plain text for .txt export.
 * Removes bold/italic markers, headings, table pipes, and horizontal rules.
 */
function stripMarkdownForTxt(md) {
  if (!md || typeof md !== 'string') return '';

  const hasPipes = md.includes('|');

  let result = md
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    // Handle pipes: ` | ` → 3 spaces (interior), `| ` → 2 spaces (start), ` |` → 2 spaces (end)
    .replace(/ \| /g, '   ')
    .replace(/^\| /, '  ')
    .replace(/ \|$/, '  ')
    .replace(/^-{3,}$/gm, '')
    .replace(/\n{3,}/g, '\n\n');

  // Only trim if there are no pipes (which add meaningful spaces)
  if (!hasPipes) {
    result = result.trim();
  }

  return result;
}

module.exports = { stripMarkdownForTxt };
