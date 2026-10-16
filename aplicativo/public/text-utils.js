(function (root) {
  'use strict';
  // Apenas divide o texto: nenhuma palavra e substituida ou removida.
  function splitText(text, limit = 220) {
    if (!Number.isInteger(limit) || limit < 20) throw new Error('Limite inválido.');
    const parts = [];
    for (const sentence of text.trim().split(/(?<=[.!?;])\s+|\n+/u)) {
      if (!sentence.trim()) continue;
      if (sentence.length <= limit) { parts.push(sentence.trim()); continue; }
      let chunk = '';
      const clauses = sentence.split(/(?<=,)\s+/u);
      for (const clause of clauses) {
        if (clause.length > limit) {
          if (chunk) { parts.push(chunk); chunk = ''; }
          for (const word of clause.split(/\s+/u)) {
            if (chunk && chunk.length + word.length + 1 > limit) { parts.push(chunk); chunk = ''; }
            chunk = chunk ? `${chunk} ${word}` : word;
          }
          if (chunk) { parts.push(chunk); chunk = ''; }
        } else if (chunk && chunk.length + clause.length + 1 > limit) {
          parts.push(chunk); chunk = clause;
        } else { chunk = chunk ? `${chunk} ${clause}` : clause; }
      }
      if (chunk) parts.push(chunk);
    }
    return parts;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {splitText};
  else root.LibrasText = {splitText};
})(typeof window !== 'undefined' ? window : globalThis);
