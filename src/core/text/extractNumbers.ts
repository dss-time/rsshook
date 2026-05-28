/**
 * Extracted number category.
 */
export type ExtractNumberType = 'number' | 'money' | 'percent';

/**
 * Number item extracted from text.
 */
export interface ExtractNumberItem {
  /**
   * Original matched text.
   */
  raw: string;
  /**
   * Parsed numeric value.
   */
  value: number;
  /**
   * Number category.
   */
  type: ExtractNumberType;
  /**
   * Start index of the match in the source text.
   */
  index: number;
  /**
   * Currency symbol for money values.
   */
  currency?: string;
}

/**
 * Options for extracting numbers from text.
 */
export interface ExtractNumbersOptions {
  /**
   * Extract money values.
   *
   * @default true
   */
  money?: boolean;
  /**
   * Extract percent values.
   *
   * @default true
   */
  percent?: boolean;
  /**
   * Extract plain numbers.
   *
   * @default true
   */
  number?: boolean;
  /**
   * Currency symbols used to identify money values.
   *
   * @default ["¥", "$", "€", "£"]
   */
  currencies?: string[];
}

const DEFAULT_CURRENCIES = ['¥', '$', '€', '£'];
const NUMBER_SOURCE = '[+-]?(?:(?:\\d{1,3}(?:,\\d{3})+)|\\d+)(?:\\.\\d+)?';

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseNumber = (value: string) => Number(value.replace(/,/g, ''));

const isOverlapped = (
  start: number,
  end: number,
  ranges: Array<[number, number]>
) => ranges.some(([rangeStart, rangeEnd]) => start < rangeEnd && end > rangeStart);

const addRange = (ranges: Array<[number, number]>, start: number, end: number) => {
  ranges.push([start, end]);
};

/**
 * Extract plain numbers, money values, and percentages from complex text.
 *
 * Money and percent matches are processed before plain numbers, so their inner
 * numeric parts are not duplicated as plain number results.
 *
 * @param text Source text.
 * @param options Extraction options.
 * @returns Extracted number items sorted by source index.
 */
export function extractNumbers(
  text: string,
  options: ExtractNumbersOptions = {}
): ExtractNumberItem[] {
  const {
    money = true,
    percent = true,
    number = true,
    currencies = DEFAULT_CURRENCIES,
  } = options;
  const result: ExtractNumberItem[] = [];
  const usedRanges: Array<[number, number]> = [];
  const currencySource = currencies.map(escapeRegExp).join('|');

  if (money && currencySource) {
    const moneyRegExp = new RegExp(
      `([+-]?)\\s*(${currencySource})\\s*(${NUMBER_SOURCE})`,
      'g'
    );

    for (const match of text.matchAll(moneyRegExp)) {
      const raw = match[0];
      const index = match.index ?? 0;
      const end = index + raw.length;

      if (isOverlapped(index, end, usedRanges)) continue;

      const sign = match[1] === '-' ? -1 : 1;
      const currency = match[2];
      const numericText = match[3];
      const value = parseNumber(numericText) * sign;

      result.push({
        raw,
        value,
        type: 'money',
        index,
        currency,
      });
      addRange(usedRanges, index, end);
    }
  }

  if (percent) {
    const percentRegExp = new RegExp(`(${NUMBER_SOURCE})\\s*%`, 'g');

    for (const match of text.matchAll(percentRegExp)) {
      const raw = match[0];
      const index = match.index ?? 0;
      const end = index + raw.length;

      if (isOverlapped(index, end, usedRanges)) continue;

      result.push({
        raw,
        value: parseNumber(match[1]),
        type: 'percent',
        index,
      });
      addRange(usedRanges, index, end);
    }
  }

  if (number) {
    const numberRegExp = new RegExp(NUMBER_SOURCE, 'g');

    for (const match of text.matchAll(numberRegExp)) {
      const raw = match[0];
      const index = match.index ?? 0;
      const end = index + raw.length;

      if (isOverlapped(index, end, usedRanges)) continue;

      result.push({
        raw,
        value: parseNumber(raw),
        type: 'number',
        index,
      });
      addRange(usedRanges, index, end);
    }
  }

  return result.sort((prev, next) => prev.index - next.index);
}

/**
 * @example
 * const result = extractNumbers('价格为 ¥1,299.00，折扣 15%，同比 -3.5%');
 *
 * // [
 * //   {
 * //     raw: '¥1,299.00',
 * //     value: 1299,
 * //     type: 'money',
 * //     currency: '¥',
 * //     index: 4,
 * //   },
 * //   {
 * //     raw: '15%',
 * //     value: 15,
 * //     type: 'percent',
 * //     index: 17,
 * //   },
 * //   {
 * //     raw: '-3.5%',
 * //     value: -3.5,
 * //     type: 'percent',
 * //     index: 24,
 * //   },
 * // ]
 */
