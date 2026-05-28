import { diffObject, type DiffObjectOptions, type ObjectPath } from './diffObject';

/**
 * Options for picking changed fields from edited form values.
 */
export interface PickChangedFieldsOptions extends DiffObjectOptions {
  /**
   * Pick changed top-level fields or build a deep patch object.
   *
   * @default "top-level"
   */
  mode?: 'top-level' | 'deep-patch';
}

const createContainer = (nextKey: string | number | undefined) =>
  typeof nextKey === 'number' ? [] : {};

const setDeepValue = (
  target: Record<string | number, unknown>,
  path: ObjectPath,
  value: unknown
) => {
  let current: Record<string | number, unknown> = target;

  path.forEach((key, index) => {
    const isLast = index === path.length - 1;

    if (isLast) {
      current[key] = value;
      return;
    }

    const nextKey = path[index + 1];
    const currentValue = current[key];

    if (
      typeof currentValue !== 'object' ||
      currentValue === null ||
      currentValue instanceof Date
    ) {
      current[key] = createContainer(nextKey);
    }

    current = current[key] as Record<string | number, unknown>;
  });
};

/**
 * Pick only changed fields from edited form values.
 *
 * In top-level mode, any deep change returns the changed top-level field from
 * the new object. In deep-patch mode, only changed deep paths are returned.
 *
 * @template T Object type.
 * @param oldObject Original form values.
 * @param newObject Current form values.
 * @param options Pick options.
 * @returns Partial payload containing changed fields.
 */
export function pickChangedFields<T extends Record<string, unknown>>(
  oldObject: T,
  newObject: T,
  options: PickChangedFieldsOptions = {}
): Partial<T> {
  const { mode = 'top-level', ...diffOptions } = options;
  const diff = diffObject(oldObject, newObject, diffOptions);

  if (mode === 'top-level') {
    const result: Partial<T> = {};

    Object.values(diff).forEach(change => {
      const [topLevelKey] = change.path;

      if (topLevelKey !== undefined) {
        result[topLevelKey as keyof T] = newObject[topLevelKey as keyof T];
      }
    });

    return result;
  }

  const result: Record<string | number, unknown> = {};

  Object.values(diff).forEach(change => {
    if (change.path.length > 0) {
      setDeepValue(result, change.path, change.newValue);
    }
  });

  return result as Partial<T>;
}

/**
 * @example
 * const payload = pickChangedFields(
 *   {
 *     username: '张三',
 *     phone: '13800000000',
 *     age: 20,
 *   },
 *   {
 *     username: '张三',
 *     phone: '13900000000',
 *     age: 20,
 *   }
 * );
 *
 * // {
 * //   phone: '13900000000',
 * // }
 */
