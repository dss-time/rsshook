import { writeTextToClipboard } from '../../shared/clipboard';

/**
 * Rich text content copied to clipboard.
 */
export interface CopyRichTextOptions {
  /**
   * Plain text fallback content.
   */
  text: string;
  /**
   * HTML rich text content.
   */
  html: string;
}

/**
 * Copy rich text to clipboard with both text/html and text/plain payloads.
 *
 * Falls back to copying plain text when ClipboardItem is unavailable or blocked.
 *
 * @param options Rich text copy options.
 * @returns Whether the copy operation succeeded.
 */
export async function copyRichText(
  options: CopyRichTextOptions
): Promise<boolean> {
  if (typeof window === 'undefined') {
    return false;
  }

  const { text, html } = options;

  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.write === 'function' &&
      typeof ClipboardItem !== 'undefined'
    ) {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      });

      await navigator.clipboard.write([item]);
      return true;
    }
  } catch {
    // Fall back to plain text copy below.
  }

  return writeTextToClipboard(text);
}

/**
 * @example
 * await copyRichText({
 *   text: '加粗文本',
 *   html: '<strong>加粗文本</strong>',
 * });
 */
