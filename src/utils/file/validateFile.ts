const FILE_HEADER_BYTES = 64;

const FILE_SIGNATURES: Record<string, string[]> = {
  // images
  'image/jpeg': ['ffd8ff'],
  'image/png': ['89504e47'],
  'image/gif': ['47494638'],
  'image/bmp': ['424d'],
  'image/tiff': ['49492a00', '4d4d002a'],

  // document
  'application/pdf': ['25504446'],

  // archive
  'application/zip': ['504b0304', '504b0506', '504b0708'],
  'application/x-rar-compressed': ['526172211a0700', '526172211a070100'],
  'application/vnd.rar': ['526172211a0700', '526172211a070100'],
  'application/x-7z-compressed': ['377abcaf271c'],

  // old office format: doc / xls / ppt
  'application/msword': ['d0cf11e0'],
  'application/vnd.ms-excel': ['d0cf11e0'],
  'application/vnd.ms-powerpoint': ['d0cf11e0'],

  // office openxml: docx / xlsx / pptx, zip based
  'application/vnd.openxmlformats-officedocument': [
    '504b0304',
    '504b0506',
    '504b0708',
  ],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    '504b0304',
    '504b0506',
    '504b0708',
  ],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    '504b0304',
    '504b0506',
    '504b0708',
  ],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [
    '504b0304',
    '504b0506',
    '504b0708',
  ],
};

const FILE_SIZE_LIMITS: Record<string, number> = {
  // images
  'image/jpeg': 5,
  'image/png': 5,
  'image/gif': 5,
  'image/webp': 5,
  'image/bmp': 5,
  'image/tiff': 10,

  // document
  'application/pdf': 20,
  'application/msword': 20,
  'application/vnd.ms-excel': 20,
  'application/vnd.ms-powerpoint': 20,

  'application/vnd.openxmlformats-officedocument': 20,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 20,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 20,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 20,

  // archive
  'application/zip': 50,
  'application/x-rar-compressed': 50,
  'application/vnd.rar': 50,
  'application/x-7z-compressed': 50,

  // audio
  'audio/mp3': 20,
  'audio/mpeg': 20,
  'audio/wav': 30,
  'audio/x-wav': 30,

  // video
  'video/mp4': 100,
  'video/quicktime': 100,
};

const MIME_EQUIVALENTS: Record<string, string[]> = {
  'audio/mp3': ['audio/mpeg'],
  'audio/mpeg': ['audio/mp3'],

  'audio/wav': ['audio/x-wav', 'audio/wave'],
  'audio/x-wav': ['audio/wav', 'audio/wave'],
  'audio/wave': ['audio/wav', 'audio/x-wav'],

  'application/x-rar-compressed': ['application/vnd.rar'],
  'application/vnd.rar': ['application/x-rar-compressed'],

  'application/vnd.openxmlformats-officedocument': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
};

const EXTENSION_MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',

  pdf: 'application/pdf',

  zip: 'application/zip',
  rar: 'application/x-rar-compressed',
  '7z': 'application/x-7z-compressed',

  mp3: 'audio/mpeg',
  wav: 'audio/wav',

  mp4: 'video/mp4',
  mov: 'video/quicktime',
  qt: 'video/quicktime',

  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint',

  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export interface ValidateFileOptions {
  maxSize?: number;
  checkMagicNumber?: boolean;
  checkSize?: boolean;
}

export interface ValidateFileResult {
  valid: boolean;
  message: string;
}

interface MagicContext {
  headerHex: string;
  headerAscii: string;
  bytes: Uint8Array;
  file: File;
}

type MagicValidator = (ctx: MagicContext) => boolean;

const getFileExtension = (fileName: string): string => {
  const index = fileName.lastIndexOf('.');
  if (index === -1) return '';
  return fileName.slice(index + 1).toLowerCase();
};

const bytesToHex = (bytes: Uint8Array): string => {
  let header = '';

  for (let i = 0; i < bytes.length; i++) {
    header += bytes[i].toString(16).padStart(2, '0');
  }

  return header;
};

const bytesToAscii = (bytes: Uint8Array): string => {
  let result = '';

  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i]);
  }

  return result;
};

const startsWithAny = (headerHex: string, signatures: string[]): boolean => {
  return signatures.some(signature => headerHex.startsWith(signature));
};

const getEquivalentMimeTypes = (type: string): string[] => {
  const result = new Set<string>();

  result.add(type);

  const directEquivalents = MIME_EQUIVALENTS[type];
  if (directEquivalents) {
    directEquivalents.forEach(item => result.add(item));
  }

  Object.entries(MIME_EQUIVALENTS).forEach(([key, values]) => {
    if (values.includes(type)) {
      result.add(key);
      values.forEach(item => result.add(item));
    }
  });

  return Array.from(result);
};

const getExpandedAcceptedTypes = (acceptedTypes: string[]): string[] => {
  const result = new Set<string>();

  acceptedTypes.forEach(type => {
    getEquivalentMimeTypes(type).forEach(item => result.add(item));
  });

  return Array.from(result);
};

const getCandidateMimeTypes = (file: File): string[] => {
  const result = new Set<string>();

  if (file.type) {
    getEquivalentMimeTypes(file.type).forEach(item => result.add(item));
  }

  const extension = getFileExtension(file.name);
  const mimeFromExtension = EXTENSION_MIME_MAP[extension];

  if (mimeFromExtension) {
    getEquivalentMimeTypes(mimeFromExtension).forEach(item => result.add(item));
  }

  return Array.from(result);
};

const isAcceptedFileType = (file: File, acceptedTypes: string[]): boolean => {
  const expandedAcceptedTypes = getExpandedAcceptedTypes(acceptedTypes);
  const candidateMimeTypes = getCandidateMimeTypes(file);

  return candidateMimeTypes.some(type => expandedAcceptedTypes.includes(type));
};

const getFileTypeForSizeLimit = (file: File): string => {
  if (file.type && FILE_SIZE_LIMITS[file.type]) {
    return file.type;
  }

  const candidateMimeTypes = getCandidateMimeTypes(file);

  return (
    candidateMimeTypes.find(type => FILE_SIZE_LIMITS[type]) || file.type || ''
  );
};

const readFileHeader = (file: File): Promise<Uint8Array> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const blob = file.slice(0, FILE_HEADER_BYTES);

    reader.onload = () => {
      const result = reader.result;

      if (!(result instanceof ArrayBuffer)) {
        reject(new Error('文件读取结果异常'));
        return;
      }

      resolve(new Uint8Array(result));
    };

    reader.onerror = () => {
      reject(new Error('文件读取失败'));
    };

    reader.onabort = () => {
      reject(new Error('文件读取已取消'));
    };

    reader.readAsArrayBuffer(blob);
  });
};

const isZipLike = ({ headerHex }: MagicContext): boolean => {
  return startsWithAny(headerHex, ['504b0304', '504b0506', '504b0708']);
};

const isWebp = ({ headerAscii }: MagicContext): boolean => {
  return headerAscii.startsWith('RIFF') && headerAscii.slice(8, 12) === 'WEBP';
};

const isWav = ({ headerAscii }: MagicContext): boolean => {
  return headerAscii.startsWith('RIFF') && headerAscii.slice(8, 12) === 'WAVE';
};

const isMp3 = ({ headerHex, bytes }: MagicContext): boolean => {
  if (headerHex.startsWith('494433')) {
    return true;
  }

  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
};

const isMp4 = ({ headerAscii }: MagicContext): boolean => {
  if (headerAscii.slice(4, 8) !== 'ftyp') {
    return false;
  }

  const brand = headerAscii.slice(8, 12);
  const mp4Brands = [
    'isom',
    'iso2',
    'mp41',
    'mp42',
    'avc1',
    'M4V ',
    'M4A ',
    'dash',
  ];

  return mp4Brands.includes(brand);
};

const isQuickTime = ({ headerAscii }: MagicContext): boolean => {
  return (
    headerAscii.slice(4, 8) === 'ftyp' && headerAscii.slice(8, 12) === 'qt  '
  );
};

const MAGIC_VALIDATORS: Record<string, MagicValidator> = {
  'image/webp': isWebp,

  'audio/mp3': isMp3,
  'audio/mpeg': isMp3,
  'audio/wav': isWav,
  'audio/x-wav': isWav,
  'audio/wave': isWav,

  'video/mp4': isMp4,
  'video/quicktime': isQuickTime,

  'application/zip': isZipLike,

  'application/vnd.openxmlformats-officedocument': isZipLike,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    isZipLike,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    isZipLike,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    isZipLike,
};

const validateMagicNumber = async (
  file: File,
  acceptedTypes: string[]
): Promise<boolean> => {
  const bytes = await readFileHeader(file);
  const headerHex = bytesToHex(bytes);
  const headerAscii = bytesToAscii(bytes);

  const ctx: MagicContext = {
    headerHex,
    headerAscii,
    bytes,
    file,
  };

  const expandedAcceptedTypes = getExpandedAcceptedTypes(acceptedTypes);

  return expandedAcceptedTypes.some(type => {
    const customValidator = MAGIC_VALIDATORS[type];

    if (customValidator) {
      return customValidator(ctx);
    }

    const signatures = FILE_SIGNATURES[type];

    if (!signatures) {
      return false;
    }

    return startsWithAny(headerHex, signatures);
  });
};

const formatFileSize = (size: number): string => {
  const mb = size / 1024 / 1024;

  if (mb >= 1) {
    return `${mb.toFixed(2)}MB`;
  }

  const kb = size / 1024;
  return `${kb.toFixed(2)}KB`;
};

export const validateFile = async (
  file: File,
  acceptedTypes: string[],
  options: ValidateFileOptions = {}
): Promise<ValidateFileResult> => {
  const { maxSize, checkMagicNumber = true, checkSize = true } = options;

  if (!isAcceptedFileType(file, acceptedTypes)) {
    return {
      valid: false,
      message: `不支持的文件类型: ${
        file.type || '未知类型'
      }. 支持的类型: ${acceptedTypes.join(', ')}`,
    };
  }

  if (checkSize) {
    const fileTypeForSizeLimit = getFileTypeForSizeLimit(file);
    const defaultMaxSize = FILE_SIZE_LIMITS[fileTypeForSizeLimit] || 5;
    const sizeLimit = maxSize ?? defaultMaxSize;
    const fileSize = file.size / 1024 / 1024;

    if (fileSize > sizeLimit) {
      return {
        valid: false,
        message: `文件大小不能超过 ${sizeLimit}MB，当前文件大小为 ${formatFileSize(
          file.size
        )}`,
      };
    }
  }

  if (checkMagicNumber) {
    try {
      const isValidMagicNumber = await validateMagicNumber(file, acceptedTypes);

      if (!isValidMagicNumber) {
        return {
          valid: false,
          message: '文件格式无效、文件内容与扩展名不一致或文件已损坏',
        };
      }
    } catch (error) {
      return {
        valid: false,
        message:
          error instanceof Error ? error.message : '文件读取失败，请重新选择文件',
      };
    }
  }

  return { valid: true, message: '文件验证通过' };
};

export const FileTypes = {
  IMAGE: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],

  DOCUMENT: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],

  OFFICE: [
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],

  ARCHIVE: [
    'application/zip',
    'application/x-rar-compressed',
    'application/vnd.rar',
    'application/x-7z-compressed',
  ],

  AUDIO: ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/x-wav'],

  VIDEO: ['video/mp4', 'video/quicktime'],
};
