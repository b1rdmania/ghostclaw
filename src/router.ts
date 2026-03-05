import { Channel, NewMessage } from './types.js';

export function escapeXml(s: string): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatMessages(messages: NewMessage[]): string {
  const lines = messages.map(
    (m) =>
      `<message sender="${escapeXml(m.sender_name)}" time="${m.timestamp}">${escapeXml(m.content)}</message>`,
  );
  return `<messages>\n${lines.join('\n')}\n</messages>`;
}

export function stripInternalTags(text: string): string {
  return text.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
}

export function formatOutbound(rawText: string): string {
  const text = stripInternalTags(rawText);
  if (!text) return '';
  return text;
}

/**
 * Convert markdown to Telegram HTML.
 * Handles code blocks, inline code, bold, italic, strikethrough, and links.
 * Escapes HTML entities in non-code text so parse_mode: 'HTML' works safely.
 */
export function markdownToTelegramHtml(md: string): string {
  // Extract code blocks and inline code first to protect them from other transforms
  const placeholders: string[] = [];
  const ph = (s: string) => {
    placeholders.push(s);
    return `\x00${placeholders.length - 1}\x00`;
  };

  // Strip raw HTML tags the agent may have produced — we convert from markdown only.
  // Keep &amp; &lt; &gt; entities but remove actual tags like <b>, <pre>, <code>, etc.
  let text = md.replace(/<\/?[a-zA-Z][^>]*>/g, '');

  // Fenced code blocks: ```lang\n...\n```
  text = text.replace(/```[\w]*\n([\s\S]*?)```/g, (_m, code) =>
    ph(`<pre>${escapeHtml(code.replace(/\n$/, ''))}</pre>`),
  );
  // Fenced code blocks without language: ```...```
  text = text.replace(/```([\s\S]*?)```/g, (_m, code) =>
    ph(`<pre>${escapeHtml(code.replace(/\n$/, ''))}</pre>`),
  );

  // Inline code: `...`
  text = text.replace(/`([^`\n]+)`/g, (_m, code) =>
    ph(`<code>${escapeHtml(code)}</code>`),
  );

  // Escape HTML in remaining text (but not inside placeholders)
  text = text
    .split(/(\x00\d+\x00)/)
    .map((part) => {
      if (/^\x00\d+\x00$/.test(part)) return part;
      return escapeHtml(part);
    })
    .join('');

  // Bold: **text** or __text__
  text = text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  text = text.replace(/__(.+?)__/g, '<b>$1</b>');

  // Italic: *text* or _text_ (but not inside words like file_name)
  text = text.replace(/(?<!\w)\*([^*\n]+?)\*(?!\w)/g, '<i>$1</i>');
  text = text.replace(/(?<!\w)_([^_\n]+?)_(?!\w)/g, '<i>$1</i>');

  // Strikethrough: ~~text~~
  text = text.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // Links: [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Restore placeholders
  text = text.replace(
    /\x00(\d+)\x00/g,
    (_m, idx) => placeholders[parseInt(idx)],
  );

  return text;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function routeOutbound(
  channels: Channel[],
  jid: string,
  text: string,
): Promise<void> {
  const channel = channels.find((c) => c.ownsJid(jid) && c.isConnected());
  if (!channel) throw new Error(`No channel for JID: ${jid}`);
  return channel.sendMessage(jid, text);
}

export function findChannel(
  channels: Channel[],
  jid: string,
): Channel | undefined {
  return channels.find((c) => c.ownsJid(jid));
}
