import type { TreeBaseOptions, TreeNode } from './flattenTree';

export type { TreeBaseOptions, TreeNode } from './flattenTree';

/**
 * Options for filtering a tree by user permissions.
 *
 * @template T Tree node type.
 */
export interface FilterTreeByPermissionOptions<T extends TreeNode>
  extends TreeBaseOptions {
  /**
   * Field name used to read node permissions.
   *
   * @default "permission"
   */
  permissionKey?: string;
  /**
   * Keep nodes that do not declare a permission.
   *
   * @default true
   */
  allowNoPermission?: boolean;
  /**
   * Keep a parent node when at least one child remains visible.
   *
   * @default true
   */
  keepParentIfChildrenVisible?: boolean;
  /**
   * Remove the children field when all children are filtered out.
   *
   * @default false
   */
  removeEmptyChildren?: boolean;
  /**
   * Custom permission matcher.
   */
  checkPermission?: (
    nodePermission: string | string[] | unknown,
    userPermissions: Set<string>,
    node: T
  ) => boolean;
}

const hasPermission = (
  nodePermission: string | string[] | unknown,
  userPermissions: Set<string>
) => {
  if (typeof nodePermission === 'string') {
    return userPermissions.has(nodePermission);
  }

  if (Array.isArray(nodePermission)) {
    return nodePermission.some(permission => userPermissions.has(permission));
  }

  return false;
};

/**
 * Filter a menu tree or permission tree by user permissions.
 *
 * The source tree is not mutated. Returned nodes are shallow copies with their
 * children recursively filtered.
 *
 * @template T Tree node type.
 * @param tree Tree nodes.
 * @param permissions User permissions.
 * @param options Filter options.
 * @returns Filtered tree nodes.
 */
export function filterTreeByPermission<T extends TreeNode>(
  tree: T[],
  permissions: string[] | Set<string>,
  options: FilterTreeByPermissionOptions<T> = {}
): T[] {
  const {
    childrenKey = 'children',
    permissionKey = 'permission',
    allowNoPermission = true,
    keepParentIfChildrenVisible = true,
    removeEmptyChildren = false,
    checkPermission = hasPermission,
  } = options;
  const userPermissions =
    permissions instanceof Set ? permissions : new Set(permissions);

  const walk = (nodes: T[]): T[] => {
    return nodes.reduce<T[]>((result, node) => {
      const children = node[childrenKey];
      const filteredChildren = Array.isArray(children)
        ? walk(children as T[])
        : [];
      const nodePermission = node[permissionKey];
      const hasNodePermission =
        nodePermission === undefined || nodePermission === null
          ? allowNoPermission
          : checkPermission(nodePermission, userPermissions, node);
      const shouldKeepByChildren =
        keepParentIfChildrenVisible && filteredChildren.length > 0;

      if (!hasNodePermission && !shouldKeepByChildren) {
        return result;
      }

      const nextNode: Record<string, unknown> = { ...node };

      if (Array.isArray(children)) {
        if (filteredChildren.length > 0 || !removeEmptyChildren) {
          nextNode[childrenKey] = filteredChildren;
        } else {
          delete nextNode[childrenKey];
        }
      }

      result.push(nextNode as T);
      return result;
    }, []);
  };

  return walk(tree);
}

/**
 * @example
 * const visibleMenu = filterTreeByPermission(menuTree, ['system:user:list']);
 */
