// Turns the stored legal text into safe, structured blocks. The text is NEVER inserted as HTML:
// the page builds React elements from these blocks, so nothing an editor types can run as code.
// Tokens such as {{name}} or {{returnDays}} are filled from the shop's saved settings (see lib/settings-core.js).
export { tokenValues, fillTokens } from './settings-core.js';

/** "# H", "## H", "- item", paragraphs separated by blank lines  ->  [{ t: 'h2'|'h3'|'p'|'ul', ... }] */
export function parseBlocks(text) {
  const blocks = [];
  let para = [], list = null;
  const flushPara = () => { if (para.length) { blocks.push({ t: 'p', text: para.join('\n') }); para = []; } };
  const flushList = () => { if (list) { blocks.push({ t: 'ul', items: list }); list = null; } };
  for (const raw of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); flushList(); continue; }
    let m;
    if ((m = /^##\s+(.+)$/.exec(line))) { flushPara(); flushList(); blocks.push({ t: 'h3', text: m[1] }); }
    else if ((m = /^#\s+(.+)$/.exec(line))) { flushPara(); flushList(); blocks.push({ t: 'h2', text: m[1] }); }
    else if ((m = /^-\s+(.+)$/.exec(line))) { flushPara(); (list ||= []).push(m[1]); }
    else { flushList(); para.push(line); }
  }
  flushPara(); flushList();
  return blocks;
}
