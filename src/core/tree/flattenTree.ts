/**
 * Generic tree node object.
 */
export type TreeNode = Record<string, unknown>;

/**
 * Base options shared by tree helpers.
 */
export interface TreeBaseOptions {
  /**
   * Field name used to read child nodes.
   *
   * @default "children"
   */
  childrenKey?: string;
}

/**
 * Options for flattening a tree.
 */
export interface FlattenTreeOptions extends TreeBaseOptions {
  /**
   * Keep the children field on flattened nodes.
   *
   * @default false
   */
  keepChildren?: boolean;
  /**
   * Attach metadata to each flattened node.
   *
   * @default false
   */
  withMeta?: boolean;
}

/**
 * Metadata attached to flattened tree nodes when withMeta is enabled.
 *
 * @template T Tree node type.
 */
export interface FlattenTreeMeta<T extends TreeNode> {
  /**
   * Node level in the tree. Root nodes start at 0.
   */
  __level: number;
  /**
   * Parent node of the current node.
   */
  __parent?: T;
  /**
   * Path from root to the current node.
   */
  __path: T[];
}

/**
 * Convert a tree into a flat depth-first list without mutating the source tree.
 *
 * @template T Tree node type.
 * @param tree Tree nodes.
 * @param options Flatten options.
 * @returns Flattened node list.
 */
export function flattenTree<T extends TreeNode>(
  tree: T[],
  options: FlattenTreeOptions = {}
): Array<T & Partial<FlattenTreeMeta<T>>> {
  const {
    childrenKey = 'children',
    keepChildren = false,
    withMeta = false,
  } = options;
  const result: Array<T & Partial<FlattenTreeMeta<T>>> = [];

  const walk = (nodes: T[], level: number, parent?: T, path: T[] = []) => {
    nodes.forEach(node => {
      const children = node[childrenKey];
      const nextPath = [...path, node];
      const currentNode = {
        ...node,
      } as T & Partial<FlattenTreeMeta<T>>;

      if (!keepChildren) {
        delete (currentNode as Record<string, unknown>)[childrenKey];
      }

      if (withMeta) {
        currentNode.__level = level;
        currentNode.__parent = parent;
        currentNode.__path = nextPath;
      }

      result.push(currentNode);

      if (Array.isArray(children)) {
        walk(children as T[], level + 1, node, nextPath);
      }
    });
  };

  walk(tree, 0);

  return result;
}

/**
 * @example
 * const list = flattenTree(menuTree, {
 *   childrenKey: 'children',
 *   keepChildren: false,
 *   withMeta: true,
 * });
 */
