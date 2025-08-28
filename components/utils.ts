import React from 'react';

// Helper to parse text for simple markdown like bold/italics
export const renderFormattedText = (text: string) => {
  if (!text) return null;
  // Regex to find **bold** or *italic* text
  const markdownRegex = /(\*\*[\s\S]+?\*\*|\*[\s\S]+?\*)/g;
  const parts = text.split(markdownRegex);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      // FIX: Replaced JSX `<strong>` with React.createElement to be valid in a .ts file.
      return React.createElement('strong', { key: index }, part.slice(2, -2));
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      // FIX: Replaced JSX `<em>` with React.createElement to be valid in a .ts file.
      return React.createElement('em', { key: index }, part.slice(1, -1));
    }
    // FIX: Replaced JSX `<React.Fragment>` with React.createElement to be valid in a .ts file and assign a key.
    return React.createElement(React.Fragment, { key: index }, part);
  });
};
