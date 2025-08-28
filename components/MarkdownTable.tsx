import React from 'react';
import { renderFormattedText } from './utils';

interface MarkdownTableProps {
  markdownContent: string;
}

/**
 * A robust function to parse a single line of a markdown table.
 * It handles optional leading/trailing pipes and correctly splits cells
 * even if they contain an escaped pipe character (\|).
 */
const parseTableRow = (line: string): string[] => {
    // 1. Trim the line and remove optional leading/trailing pipes
    let processedLine = line.trim();
    if (processedLine.startsWith('|')) processedLine = processedLine.substring(1);
    if (processedLine.endsWith('|')) processedLine = processedLine.slice(0, -1);

    // 2. Split by unescaped pipes. This is more robust.
    // The regex splits on a pipe '|' that is NOT preceded by a backslash '\'.
    // The negative lookbehind `(?<!\\)` achieves this.
    const cells = processedLine.split(/(?<!\\)\|/).map(cell => 
        // 3. Trim the cell content and unescape any pipes that were intentionally included.
        cell.trim().replace(/\\\|/g, '|')
    );
    return cells;
};


export const MarkdownTable: React.FC<MarkdownTableProps> = ({ markdownContent }) => {
  const lines = markdownContent.trim().split('\n').filter(line => line.trim() && line.includes('|'));
  if (lines.length < 2) return <pre>{markdownContent}</pre>; // Not enough lines for a header and separator

  const headers = parseTableRow(lines[0]);
  const separatorCells = parseTableRow(lines[1]);
  const bodyLines = lines.slice(2);

  // --- Strict GFM Validation ---
  // 1. The number of columns in the separator must match the header.
  if (headers.length !== separatorCells.length) {
    return <pre>{markdownContent}</pre>; // Fallback if column counts mismatch
  }
  // 2. The content of each separator cell must be valid (dashes and optional colons).
  const isSeparatorValid = separatorCells.every(cell => /^\s*:?-+:?\s*$/.test(cell));
  if (!isSeparatorValid) {
    return <pre>{markdownContent}</pre>; // Fallback if separator format is invalid
  }

  const rows = bodyLines.map(parseTableRow);

  return (
    <div className="overflow-x-auto my-2 rounded-lg border border-slate-300 dark:border-slate-600">
        {/* Added `table-fixed` for stable column widths */}
        <table className="min-w-full border-collapse text-sm text-slate-800 dark:text-slate-200 table-fixed">
            <thead className="bg-slate-100 dark:bg-white/5">
                <tr>
                    {headers.map((header, index) => (
                        <th key={index} className="p-2 border-b border-slate-300 dark:border-slate-600 text-left font-semibold break-words">
                            {renderFormattedText(header)}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="bg-white dark:bg-transparent even:bg-slate-50 dark:even:bg-white/[.03]">
                        {row.slice(0, headers.length).map((cell, cellIndex) => (
                            <td key={cellIndex} className="p-2 border-t border-slate-200 dark:border-slate-700 align-top break-words">
                                {renderFormattedText(cell)}
                            </td>
                        ))}
                        {/* Pad with empty cells if the row is shorter than the header */}
                        {Array.from({ length: Math.max(0, headers.length - row.length) }).map((_, i) => (
                            <td key={`pad-${i}`} className="p-2 border-t border-slate-200 dark:border-slate-700 align-top"></td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
  );
};
