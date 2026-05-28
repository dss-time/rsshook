import type { TreeBaseOptions, TreeNode } from './flattenTree';

export type { TreeBaseOptions, TreeNode } from './flattenTree';

/**
 * Options for finding a path in a tree.
 */
export interface FindPathInTreeOptions extends TreeBaseOptions {}

/**
 * Find the full path from a root node to the first matched node.
 *
 * @template T Tree node type.
 * @param tree Tree nodes.
 * @param predicate Matcher used to find the target node.
 * @param options Find options.
 * @returns Path from root to target node, or an empty array when not found.
 */
export function findPathInTree<T extends TreeNode>(
  tree: T[],
  predicate: (node: T) => boolean,
  options: FindPathInTreeOptions = {}
): T[] {
  const { childrenKey = 'children' } = options;

  const walk = (nodes: T[], path: T[]): T[] => {
    for (const node of nodes) {
      const nextPath = [...path, node];

      if (predicate(node)) {
        return nextPath;
      }

      const children = node[childrenKey];
      if (Array.isArray(children)) {
        const matchedPath = walk(children as T[], nextPath);

        if (matchedPath.length > 0) {
          return matchedPath;
        }
      }
    }

    return [];
  };

  return walk(tree, []);
}

/**
 * @example
 * const path = findPathInTree(menuTree, node => node.id === 12);
 *
 * // [
 * //   { id: 1, name: '系统管理' },
 * //   { id: 12, name: '角色管理' },
 * // ]
 */
