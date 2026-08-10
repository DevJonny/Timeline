/**
 * Lane packing.
 *
 * Both problems this solves are the same problem: things that overlap in time
 * must not overlap on screen. Ages genuinely overlap (Iron Age and Classical
 * Antiquity share c. 800–550 BCE; empires and reigns overlap constantly), and
 * so do marker labels once several entries fall within a label's height of
 * each other.
 *
 * Pure functions over plain arrays — no DOM, no reactivity, fully testable.
 */

export interface Extent {
  y0: number;
  y1: number;
}

export interface Placement<T> {
  item: T;
  lane: number;
  y0: number;
  y1: number;
}

export interface PackResult<T> {
  placed: Placement<T>[];
  /** Number of lanes actually used. */
  lanes: number;
  /** Items that could not be placed within `maxLanes`. */
  overflow: T[];
}

/**
 * Assign items to lanes so that no two items in a lane overlap.
 *
 * Items are considered in the order given, and each takes the first lane it
 * fits in — so **callers should pass items in priority order** (most important
 * first). When lanes run out the leftovers are returned as `overflow` rather
 * than being drawn on top of something else; the caller decides whether to
 * cluster or drop them.
 */
export function packLanes<T>(
  items: readonly T[],
  extentOf: (item: T) => Extent,
  maxLanes: number,
  gap = 2,
): PackResult<T> {
  const lanes: Extent[][] = [];
  const placed: Placement<T>[] = [];
  const overflow: T[] = [];

  for (const item of items) {
    const { y0, y1 } = extentOf(item);
    let assigned = -1;

    for (let lane = 0; lane < lanes.length; lane++) {
      const occupants = lanes[lane]!;
      const clashes = occupants.some((o) => y0 < o.y1 + gap && o.y0 < y1 + gap);
      if (!clashes) {
        assigned = lane;
        break;
      }
    }

    if (assigned === -1) {
      if (lanes.length >= maxLanes) {
        overflow.push(item);
        continue;
      }
      lanes.push([]);
      assigned = lanes.length - 1;
    }

    lanes[assigned]!.push({ y0, y1 });
    placed.push({ item, lane: assigned, y0, y1 });
  }

  return { placed, lanes: lanes.length, overflow };
}

/**
 * The pixel box a marker's label occupies, centred on its position.
 * Clamped to a minimum height so a zero-length instant still reserves space.
 */
export function labelExtent(y: number, labelHeight: number): Extent {
  const half = labelHeight / 2;
  return { y0: y - half, y1: y + half };
}

/**
 * The pixel box a span occupies, with a floor so that a span too short to see
 * at the current zoom is still tall enough to be tappable.
 */
export function spanExtent(y0: number, y1: number, minHeight: number): Extent {
  const height = y1 - y0;
  if (height >= minHeight) return { y0, y1 };
  const centre = (y0 + y1) / 2;
  return { y0: centre - minHeight / 2, y1: centre + minHeight / 2 };
}

/** Drop anything entirely outside the viewport, with a buffer for smooth panning. */
export function cullToViewport<T>(
  items: readonly T[],
  extentOf: (item: T) => Extent,
  height: number,
  buffer = 200,
): T[] {
  return items.filter((item) => {
    const { y0, y1 } = extentOf(item);
    return y1 >= -buffer && y0 <= height + buffer;
  });
}
