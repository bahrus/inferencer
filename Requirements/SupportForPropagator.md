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

---

## Human Response I

What are your thoughts on making class PropagatorInferencer the inferenced propagator?  First, maybe it should be renamed InferencedPropagator.  Second, it should extend EventTarget, and dispatch the events.  I think the constructor should be passed in the Infer class, so that it already has access the existing infer methods, like default event type, etc.

It is true that some of the logic depends on which property is being observed.  I'm thinking the InferencedPropagor could override the addEventListener instead of the watchProperty method.  There is a tricky aspect as far as asynchronous logic in that method.  I'm thinking make the addEventListenr get a snapshot of the initial value, then do whatever asynchronous wiring is needed, then if the value changed, already dispatch an event with the property name.  Would this work?

---

## Kiro Response I

Both suggestions are strong improvements over the original design.

### Renaming to InferencedPropagator + Extending EventTarget

This is cleaner. The class *is* the propagator—it shouldn't contain one. Extending EventTarget directly means consumers interact with it exactly like they would with a native propagator from a roundabout element. No wrapper indirection, no `.getPropagator()` method on the inferencer itself. The `Infer.getPropagator()` just returns `this` (the InferencedPropagator) or the native propagator—same interface either way.

Passing the `Infer` instance into the constructor is the right call. The `Infer` class already knows the element, has `inferEventType`, `inferValueProperty`, etc. No need to duplicate that logic or re-derive it.

### Overriding `addEventListener` as the Wiring Entry Point

This is elegant and solves the "which properties to watch" open question naturally—you only wire up observation for properties that someone actually subscribes to. Lazy by design.

The async concern is real though, and your proposed solution handles it well. Here's how I'd refine the flow:

```typescript
export class InferencedPropagator extends EventTarget {
    #infer: Infer;
    #watchedProperties: Set<string> = new Set();
    #abortController: AbortController = new AbortController();

    constructor(infer: Infer) {
        super();
        this.#infer = infer;
    }

    override addEventListener(
        type: string,
        callback: EventListenerOrEventListenerObject | null,
        options?: AddEventListenerOptions | boolean
    ): void {
        // Register the listener immediately so it's ready to receive
        super.addEventListener(type, callback, options);

        // Only wire up observation once per property
        if (!this.#watchedProperties.has(type)) {
            this.#watchedProperties.add(type);
            this.#wireProperty(type);
        }
    }

    async #wireProperty(propName: string): Promise<void> {
        const element = this.#infer.enhancedElement;

        // Snapshot current value before async work
        const initialValue = (element as any)[propName];

        // Do async wiring (MutationObserver setup, setter interception, etc.)
        await this.#setupStrategy(propName);

        // Check if value changed during setup—if so, dispatch immediately
        const currentValue = (element as any)[propName];
        if (currentValue !== initialValue) {
            this.dispatchEvent(new Event(propName));
        }
    }

    async #setupStrategy(propName: string): Promise<void> {
        const element = this.#infer.enhancedElement;
        const signal = this.#abortController.signal;

        // Strategy 1: Attribute-reflected properties
        // Use Infer's knowledge to check reflection...
        
        // Strategy 2: Native events (use infer.eventType)
        // For input/textarea/select, the Infer class already 
        // knows the relevant event type
        
        // Strategy 3: Setter interception for custom elements
        
        // Strategy 4: Polling fallback
    }
}
```

### Why This Works

1. **`addEventListener` is synchronous** — the listener is registered immediately via `super.addEventListener()`, so it won't miss events.
2. **Wiring is async but safe** — the snapshot/compare pattern catches changes that happen during setup. The only gap is a very brief window where a change might happen *and then revert* during async wiring, but that's an extreme edge case.
3. **Event name = property name** — this mirrors the roundabout propagator convention. Consumers do `propagator.addEventListener('value', handler)` and it just works regardless of whether it's native or inferred.

### One Consideration: Multiple `addEventListener` Calls for Same Property

The `#watchedProperties` set prevents re-wiring, which is correct. But we should think about `removeEventListener` — if *all* listeners for a property are removed, should we tear down the watcher? This could matter for memory/performance. An option:

- Track listener count per property
- On `removeEventListener`, decrement and tear down if zero
- Or: just keep watchers alive until `destroy()` is called (simpler, probably fine for most use cases)

### Revised `Infer.getPropagator()`

With this design, the integration simplifies to:

```typescript
export class Infer<TValue = any, TDisplay = any> {
    #propagator: EventTarget | undefined;

    async getPropagator(): Promise<EventTarget> {
        if (this.#propagator) return this.#propagator;
        
        const {enhancedElement} = this;
        const {localName} = enhancedElement;
        
        if (localName.includes('-')) {
            await (
                (enhancedElement as any).customElementRegistry || customElements
            ).whenDefined(localName);
            const {propagator} = enhancedElement as any;
            if (propagator instanceof EventTarget) {
                this.#propagator = propagator;
                return propagator;
            }
        }
        
        // No native propagator — create an inferred one
        const {InferencedPropagator} = await import('./InferencedPropagator.js');
        this.#propagator = new InferencedPropagator(this);
        return this.#propagator;
    }
}
```

Caching via `#propagator` ensures we don't create multiple instances for the same element.

### Strategy Selection Leveraging Infer

Since the constructor receives the `Infer` instance, the strategy selection can lean on existing inference logic:

- `inferEventType(element)` tells us if there's a native event to listen to (Strategy 2)
- `inferValueProperty(element)` tells us what property the element considers its "value" — useful for knowing which properties are likely attribute-reflected
- The `localName` check for `-` (custom element detection) is already a pattern in the codebase

This avoids duplicating element-type knowledge across two classes.
