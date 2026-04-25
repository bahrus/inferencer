# Support for Propagator

A common requirement for working with multiple DOM elements, built in and custom, is being able to subscribe to changes of a property.

<!-- IMPLEMENTATION THOUGHTS (Kiro):

The core challenge here is creating a unified event-based interface for property changes across heterogeneous element types. The PropagatorInferencer needs to act as an adapter/facade that normalizes different change detection mechanisms into a single EventTarget interface.

Key architectural insight: We're building a "virtual propagator" - an EventTarget that emits property change events by intelligently hooking into whatever change detection mechanism is available for that specific element type.

-->

One major obstacle to doing that is there is no standard metadata that elements support in order to indicate how to do that.  So we try our best to "infer" how to do this to our best ability, hence it seems that this functionality fits in a package that focusing on inferring.

There are a number of scenarios to consider:

1.  Mostly built-in elements that have "source of truth" attributes that reflect the value of the property.

Examples are the aria attributes, the output's value property, the anchor tag href property.

Setting the property value updates the attributes, and vice versa.

2.  Properties of built-in elements with corresponding events, but the events are only user driven.  An example would be the input's value property.  If the property is set programmatically, no attribute changes, nor any event fires.  How can we listen for changes made regardless of how?  We could theoretically override the value setter, but if memory serves, that not be reliable either (We need to do some experiments on this).

3.  Other even more challenging scenarios are the iframe's src property.

4.  For custom elements, because standard setters and getters are typically generated on the prototype, overriding the setter may often be a viable solution.  Perhaps the only solution, since there is no currently available way to determine any metadata between properties and attributes, and we currently don't have a way to subscribe to custom css state changes.

5.  For custom elements that adopt a [roundabout property](https://github.com/bahrus/roundabout), such custom elements will have a propagator property that emits events with the name of the property when that property changes.  That's really what we need.

So this addendum to the Infer class should have a new method:

```TypeScript
export class Infer<TValue = any, TDisplay = any> {
    async getPropagator(){
        const {elementEnhancement} = this;
        const {localName} = elementEnhancement;
        if(localName.includes('-')){
            await (enhancedElement.customElementRegistry || customElements).whenDefined(localName);
            const {propagator} = elementEnhancement;
            if(propagator instanceof EventTarget) return propagator;
        }
        //no built in propagator.  Implement a virtual propagator as best we can using our
        //best inferring abilities
        const {PropagatorInferencer} = await import('./PropagatorInferencer.js');
        await propagatorInference = new PropagatorInferencer(elementEnhancement);
        return await propagatorInference.getPropagator();
    }
}
```


---

## Implementation Thoughts (Kiro)

### Architectural Approach

The PropagatorInferencer should create a **virtual propagator** - an EventTarget that emits property change events by intelligently detecting changes through whatever mechanism is available for each element type.

### Core Design Principles

1. **Lazy Initialization**: Don't set up watchers until `getPropagator()` is called
2. **Property-Specific Watching**: Each property being watched may need different strategies
3. **Memory Safety**: Use WeakRefs and proper cleanup to avoid memory leaks
4. **Fallback Chain**: Try the most reliable method first, fall back to less ideal approaches

### Strategy Pattern by Element Type

#### Strategy 1: Attribute-Reflected Properties (aria-*, href, etc.)
- **Detection**: Check if setting property updates corresponding attribute
- **Implementation**: Use MutationObserver on attributes
- **Pros**: Reliable, no prototype pollution
- **Cons**: Only works for reflected properties
- **Example**: `aria-valuenow`, `href`, `src` (for some elements)

#### Strategy 2: Native Event-Driven Properties (input.value, etc.)
- **Detection**: Check if element fires native events (input, change)
- **Implementation**: Listen to native events, but this only catches user-driven changes
- **Challenge**: Programmatic changes don't fire events
- **Hybrid Solution**: Combine event listening with setter interception

#### Strategy 3: Setter Interception (Custom Elements)
- **Detection**: Check if property descriptor exists on prototype
- **Implementation**: Create a proxy or override setter on the instance
- **Pros**: Catches all changes (user and programmatic)
- **Cons**: Can be fragile, may conflict with frameworks
- **Best for**: Custom elements with standard getters/setters

#### Strategy 4: Polling (Last Resort)
- **Detection**: When no other method works
- **Implementation**: requestAnimationFrame-based polling with dirty checking
- **Pros**: Always works
- **Cons**: Performance overhead, delayed detection
- **Use case**: iframe.src and other problematic properties

### Proposed Class Structure

```typescript
export class PropagatorInferencer {
    #element: Element;
    #propagator: EventTarget;
    #watchers: Map<string, WatcherStrategy>;
    #abortController: AbortController;
    
    constructor(element: Element) {
        this.#element = element;
        this.#propagator = new EventTarget();
        this.#watchers = new Map();
        this.#abortController = new AbortController();
    }
    
    async getPropagator(): Promise<EventTarget> {
        // Return the virtual propagator that will emit events
        // when properties change
        return this.#propagator;
    }
    
    async watchProperty(propName: string): Promise<void> {
        // Determine best strategy for this property
        // Set up the appropriate watcher
        // Store cleanup logic in #watchers
    }
    
    #selectStrategy(propName: string): WatcherStrategy {
        // 1. Check if attribute-reflected
        // 2. Check if has native events
        // 3. Check if has setter on prototype
        // 4. Fall back to polling
    }
    
    destroy(): void {
        // Clean up all watchers
        this.#abortController.abort();
    }
}
```

### Strategy Detection Algorithm

```typescript
async #selectStrategy(propName: string): Promise<WatcherStrategy> {
    const element = this.#element;
    
    // Strategy 1: Check for attribute reflection
    const attrName = this.#getAttributeName(propName);
    if (attrName && this.#isAttributeReflected(propName, attrName)) {
        return new AttributeWatcher(element, propName, attrName);
    }
    
    // Strategy 2: Check for native events
    const eventType = this.#getNativeEventType(propName);
    if (eventType) {
        // Hybrid: event + setter interception for programmatic changes
        return new HybridEventWatcher(element, propName, eventType);
    }
    
    // Strategy 3: Setter interception (custom elements)
    if (element.localName.includes('-')) {
        const descriptor = this.#getPropertyDescriptor(propName);
        if (descriptor?.set) {
            return new SetterInterceptor(element, propName, descriptor);
        }
    }
    
    // Strategy 4: Polling fallback
    return new PollingWatcher(element, propName);
}
```

### Key Implementation Challenges

1. **Setter Interception Reliability**: 
   - Need to test if we can reliably override setters on instances
   - May need to use Proxy instead of direct override
   - Must preserve original setter behavior

2. **Attribute Name Mapping**:
   - `aria-valuenow` ↔ `ariaValueNow`
   - Need bidirectional mapping logic
   - Handle edge cases (data-*, custom attributes)

3. **Memory Leaks**:
   - MutationObservers must be disconnected
   - Event listeners must be removed
   - Polling must be stopped
   - Use AbortController for cleanup

4. **Race Conditions**:
   - Custom element may not be defined yet
   - Properties may change during setup
   - Need to handle async initialization

### Testing Strategy

1. Test each strategy independently with known element types
2. Test fallback chain works correctly
3. Test memory cleanup (no leaks)
4. Test with custom elements that have propagator property
5. Test edge cases (iframe.src, programmatic input.value changes)

### Integration with Existing Infer Class

The `getPropagator()` method should:
1. First check if element has native `propagator` property (roundabout elements)
2. If not, create PropagatorInferencer instance
3. Cache the inferencer to avoid recreating
4. Return the EventTarget that emits property change events

### Open Questions

1. Should we auto-detect which properties to watch, or require explicit registration?
2. How do we handle properties that don't exist yet (lazy initialization)?
3. Should we support watching nested properties (e.g., `style.color`)?
4. What's the event detail format? `{property: string, oldValue: any, newValue: any}`?

### Recommended First Implementation

Start with the simplest cases and expand:
1. Attribute-reflected properties (MutationObserver)
2. Custom elements with roundabout propagator (already works)
3. Input elements with hybrid event + setter approach
4. Then tackle harder cases (iframe.src, etc.)
