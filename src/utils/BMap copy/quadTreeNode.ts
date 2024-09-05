class QuadTreeNode {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  points: any[];
  children: QuadTreeNode[];
  maxPoints: number;
  maxDepth: number;
  depth: number;

  constructor(
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
    maxPoints = 25,
    maxDepth = 10,
    depth = 0
  ) {
    this.bounds = bounds;
    this.points = [];
    this.children = [];
    this.maxPoints = maxPoints;
    this.maxDepth = maxDepth;
    this.depth = depth;
  }

  insert(point: any) {
    if (!this.containsPoint(point)) {
      return false;
    }

    if (
      this.children.length === 0 &&
      (this.points.length < this.maxPoints || this.depth === this.maxDepth)
    ) {
      this.points.push(point);
      return true;
    }

    if (this.children.length === 0) {
      this.split();
    }

    for (const child of this.children) {
      if (child.insert(point)) {
        return true;
      }
    }

    return false;
  }

  split() {
    const midX = (this.bounds.minX + this.bounds.maxX) / 2;
    const midY = (this.bounds.minY + this.bounds.maxY) / 2;

    this.children = [
      new QuadTreeNode(
        {
          minX: this.bounds.minX,
          minY: this.bounds.minY,
          maxX: midX,
          maxY: midY,
        },
        this.maxPoints,
        this.maxDepth,
        this.depth + 1
      ),
      new QuadTreeNode(
        {
          minX: midX,
          minY: this.bounds.minY,
          maxX: this.bounds.maxX,
          maxY: midY,
        },
        this.maxPoints,
        this.maxDepth,
        this.depth + 1
      ),
      new QuadTreeNode(
        {
          minX: this.bounds.minX,
          minY: midY,
          maxX: midX,
          maxY: this.bounds.maxY,
        },
        this.maxPoints,
        this.maxDepth,
        this.depth + 1
      ),
      new QuadTreeNode(
        {
          minX: midX,
          minY: midY,
          maxX: this.bounds.maxX,
          maxY: this.bounds.maxY,
        },
        this.maxPoints,
        this.maxDepth,
        this.depth + 1
      ),
    ];

    for (const point of this.points) {
      for (const child of this.children) {
        if (child.insert(point)) {
          break;
        }
      }
    }

    this.points = [];
  }
  query(bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }): any[] {
    if (!this.intersects(bounds)) {
      return [];
    }

    let result: any[] = [];

    if (this.children.length === 0) {
      result = this.points.filter(
        p =>
          p.lng >= bounds.minX &&
          p.lng <= bounds.maxX &&
          p.lat >= bounds.minY &&
          p.lat <= bounds.maxY
      );
    } else {
      for (const child of this.children) {
        result = result.concat(child.query(bounds));
      }
    }

    return result;
  }

  intersects(bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }) {
    return !(
      bounds.minX > this.bounds.maxX ||
      bounds.maxX < this.bounds.minX ||
      bounds.minY > this.bounds.maxY ||
      bounds.maxY < this.bounds.minY
    );
  }

  containsPoint(point: { lng: number; lat: number }) {
    return (
      point.lng >= this.bounds.minX &&
      point.lng <= this.bounds.maxX &&
      point.lat >= this.bounds.minY &&
      point.lat <= this.bounds.maxY
    );
  }
}

export default QuadTreeNode;
