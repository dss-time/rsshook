/**
 * Path to a changed value in an object.
 */
export type ObjectPath = Array<string | number>;

/**
 * Diff detail for a changed path.
 */
export interface DiffObjectChange {
  /**
   * Value from the old object.
   */
  oldValue: unknown;
  /**
   * Value from the new object.
   */
  newValue: unknown;
  /**
   * Changed value path.
   */
  path: ObjectPath;
}

/**
 * Options for diffing two objects.
 */
export interface DiffObjectOptions {
  /**
   * Path segments to ignore while comparing.
   */
  ignoreKeys?: Array<string | number>;
  /**
   * Custom equality comparator. Return true for equal and false for changed.
   */
  compare?: (
    oldValue: unknown,
    newValue: unknown,
    path: ObjectPath
  ) => boolean;
}

const isDate = (value: unknown): value is Date => value instanceof Date;

const isObjectLike = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !isDate(value);

const isEqualValue = (oldValue: unknown, newValue: unknown) => {
  if (isDate(oldValue) && isDate(newValue)) {
    return Object.is(oldValue.getTime(), newValue.getTime());
  }

  return Object.is(oldValue, newValue);
};

const stringifyPath = (path: ObjectPath) => path.join('.');

/**
 * Compare two values and return changed paths.
 *
 * Supports nested objects, arrays, Date values, NaN equality, ignored keys, and
 * custom comparison logic.
 *
 * @param oldObject Previous value.
 * @param newObject Next value.
 * @param options Diff options.
 * @returns Changed paths keyed by path.join(".").
 */
export function diffObject(
  oldObject: unknown,
  newObject: unknown,
  options: DiffObjectOptions = {}
): Record<string, DiffObjectChange> {
  const { ignoreKeys = [], compare } = options;
  const ignoredKeys = new Set<string | number>(ignoreKeys);
  const changes: Record<string, DiffObjectChange> = {};

  const setChange = (
    oldValue: unknown,
    newValue: unknown,
    path: ObjectPath
  ) => {
    changes[stringifyPath(path)] = {
      oldValue,
      newValue,
      path,
    };
  };

  const walk = (oldValue: unknown, newValue: unknown, path: ObjectPath) => {
    if (path.some(segment => ignoredKeys.has(segment))) {
      return;
    }

    if (compare) {
      const isEqual = compare(oldValue, newValue, path);

      if (isEqual) {
        return;
      }

      setChange(oldValue, newValue, path);
      return;
    }

    if (isEqualValue(oldValue, newValue)) {
      return;
    }

    const oldIsObject = isObjectLike(oldValue);
    const newIsObject = isObjectLike(newValue);

    if (!oldIsObject || !newIsObject) {
      setChange(oldValue, newValue, path);
      return;
    }

    const oldKeys = Array.isArray(oldValue)
      ? oldValue.map((_, index) => index)
      : Object.keys(oldValue);
    const newKeys = Array.isArray(newValue)
      ? newValue.map((_, index) => index)
      : Object.keys(newValue);
    const keys = Array.from(new Set<string | number>(oldKeys.concat(newKeys)));

    keys.forEach(key => {
      if (ignoredKeys.has(key)) {
        return;
      }

      walk(
        (oldValue as Record<string | number, unknown>)[key],
        (newValue as Record<string | number, unknown>)[key],
        path.concat(key)
      );
    });
  };

  walk(oldObject, newObject, []);

  return changes;
}

/**
 * @example
 * const diff = diffObject(
 *   { name: '张三', age: 20 },
 *   { name: '李四', age: 20 }
 * );
 *
 * // {
 * //   name: {
 * //     oldValue: '张三',
 * //     newValue: '李四',
 * //     path: ['name'],
 * //   },
 * // }
 */
