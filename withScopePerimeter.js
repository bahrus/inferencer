/**
 * Check if an element is outside (not inside) any ancestor matching a selector.
 * This implements "donut hole" scoping — useful for ensuring itemprop queries
 * don't reach into nested itemscopes.
 *
 * @param rootNode - The root node to stop traversal at (not checked against selector)
 * @param matchCandidate - The element to check
 * @param outside - CSS selector for excluding ancestors (e.g., '[itemscope]')
 * @returns true if element is outside all matching ancestors, false otherwise
 *
 * @example
 * // Find itemprop elements that aren't inside a nested itemscope:
 * const candidates = container.querySelectorAll('[itemprop="name"]');
 * const scoped = Array.from(candidates).filter(el =>
 *     withScopePerimeter(container, el, '[itemscope]')
 * );
 */
export function withScopePerimeter(rootNode, matchCandidate, outside) {
    let current = matchCandidate.parentElement;
    while (current && current !== rootNode) {
        if (current.matches(outside)) {
            return false; // Found an excluding ancestor
        }
        current = current.parentElement;
    }
    return true; // No excluding ancestors found
}
