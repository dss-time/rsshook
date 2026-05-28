/**
 * Options for smart text splitting.
 */
export interface SplitTextSmartOptions {
  /**
   * Trim each split item.
   *
   * @default true
   */
  trim?: boolean;
  /**
   * Remove duplicated items while preserving order.
   *
   * @default false
   */
  unique?: boolean;
  /**
   * Remove empty items from the result.
   *
   * @default true
   */
  filterEmpty?: boolean;
  /**
   * Additional separators used to split text.
   */
  extraSeparators?: string[];
}

const DEFAULT_SEPARATORS = [',', '，', '\n', ' ', '\t', ';', '；', '、'];

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Split text by common separators used in forms, imports, and copy-paste data.
 *
 * @param text Source text.
 * @param options Split options.
 * @returns Split text items.
 */
export function splitTextSmart(
  text: string,
  options: SplitTextSmartOptions = {}
): string[] {
  const {
    trim = true,
    unique = false,
    filterEmpty = true,
    extraSeparators = [],
  } = options;
  const separators = DEFAULT_SEPARATORS.concat(extraSeparators).filter(Boolean);
  const separatorRegExp = new RegExp(
    `(?:${separators.map(escapeRegExp).join('|')})+`
  );
  const items = text.split(separatorRegExp).map(item => (trim ? item.trim() : item));
  const filteredItems = filterEmpty ? items.filter(Boolean) : items;

  if (!unique) {
    return filteredItems;
  }

  const seen = new Set<string>();

  return filteredItems.filter(item => {
    if (seen.has(item)) {
      return false;
    }

    seen.add(item);
    return true;
  });
}

/**
 * @example
 * const result = splitTextSmart('a,b，c\nd e；f、g');
 *
 * // ['a', 'b', 'c', 'd', 'e', 'f', 'g']
 */
