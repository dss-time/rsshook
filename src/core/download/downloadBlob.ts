/**
 * Data supported by downloadBlob.
 */
export type DownloadData =
  | Blob
  | File
  | string
  | Record<string, unknown>
  | unknown[];

/**
 * Options for downloading blob-like data.
 */
export interface DownloadBlobOptions {
  /**
   * Fallback filename.
   */
  filename?: string;
  /**
   * MIME type used when creating a Blob from plain data.
   */
  mimeType?: string;
  /**
   * Content-Disposition response header used to infer filename.
   */
  contentDisposition?: string;
  /**
   * Delay before revoking generated object URLs, in milliseconds.
   *
   * @default 1000
   */
  revokeDelay?: number;
  /**
   * Called when a Blob is actually a JSON error payload.
   */
  onBlobJsonError?: (json: unknown) => void;
}

const DEFAULT_FILENAME = 'download';
const DEFAULT_MIME_TYPE = 'application/json;charset=utf-8';
const DEFAULT_REVOKE_DELAY = 1000;

const isBrowser = () =>
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  typeof URL !== 'undefined';

const decodeFilename = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const parseContentDispositionFilename = (contentDisposition?: string) => {
  if (!contentDisposition) {
    return undefined;
  }

  const utf8Filename = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Filename?.[1]) {
    return decodeFilename(utf8Filename[1].trim().replace(/^"|"$/g, ''));
  }

  const filename = contentDisposition.match(/filename=([^;]+)/i);
  if (filename?.[1]) {
    return decodeFilename(filename[1].trim().replace(/^"|"$/g, ''));
  }

  return undefined;
};

const isJsonBlob = (blob: Blob) =>
  blob.type.toLowerCase().includes('application/json');

const readJsonBlob = async (blob: Blob) => {
  const text = await blob.text();
  return JSON.parse(text);
};

const toBlob = (data: DownloadData, mimeType: string) => {
  if (data instanceof Blob) {
    return data;
  }

  if (typeof data === 'string') {
    return data;
  }

  return new Blob([JSON.stringify(data)], {
    type: mimeType,
  });
};

/**
 * Download Blob, File, URL, object, or array data in the browser.
 *
 * Returns false in SSR, when a JSON error Blob is detected, or when browser
 * download APIs fail.
 *
 * @param data Data to download.
 * @param filename Fallback filename.
 * @param options Download options.
 * @returns Whether the download was triggered.
 */
export async function downloadBlob(
  data: DownloadData,
  filename?: string,
  options: DownloadBlobOptions = {}
): Promise<boolean> {
  if (!isBrowser()) {
    return false;
  }

  const {
    filename: optionFilename,
    mimeType = DEFAULT_MIME_TYPE,
    contentDisposition,
    revokeDelay = DEFAULT_REVOKE_DELAY,
    onBlobJsonError,
  } = options;

  try {
    const blobOrUrl = toBlob(data, mimeType);
    const inferredFilename =
      parseContentDispositionFilename(contentDisposition) ||
      filename ||
      optionFilename ||
      (data instanceof File ? data.name : undefined) ||
      DEFAULT_FILENAME;

    if (blobOrUrl instanceof Blob && isJsonBlob(blobOrUrl)) {
      try {
        const json = await readJsonBlob(blobOrUrl);
        onBlobJsonError?.(json);
        return false;
      } catch {
        // If the JSON Blob cannot be parsed, continue downloading it.
      }
    }

    const href =
      typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
    const link = document.createElement('a');

    link.href = href;
    link.download = inferredFilename;
    link.style.display = 'none';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (typeof blobOrUrl !== 'string') {
      window.setTimeout(() => {
        URL.revokeObjectURL(href);
      }, revokeDelay);
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * @example
 * await downloadBlob(blob, '订单列表.xlsx');
 *
 * await downloadBlob(
 *   blob,
 *   undefined,
 *   {
 *     contentDisposition: response.headers['content-disposition'],
 *     onBlobJsonError: json => {
 *       console.error('导出失败', json);
 *     },
 *   }
 * );
 */
