/**
 * Check if an element is outside (not inside) any ancestor matching a selector.
 * This implements "donut hole" scoping.
 * 
 * @param {Node} rootNode - The root node to stop traversal at
 * @param {Element} matchCandidate - The element to check
 * @param {string} outside - CSS selector for excluding ancestors
 * @returns {boolean} true if element is outside all matching ancestors
 */
export function withScopePerimeter(rootNode, matchCandidate, outside) {
    let current = matchCandidate.parentElement;
    
    while (current && current !== rootNode) {
        if (current.matches(outside)) {
            return false;
        }
        current = current.parentElement;
    }
    
    return true;
}
