import {Infer, inferEventType} from './inferencer.js';

/**
 * An inferred propagator that extends EventTarget.
 * Emits property change events by intelligently hooking into
 * whatever change detection mechanism is available for the element.
 * 
 * Property observation is lazy — wiring only happens when
 * addEventListener is called for a given property name.
 */
export class InferencedPropagator extends EventTarget {
    #infer: Infer;
    #watchedProperties: Map<string, () => void> = new Map();

    constructor(infer: Infer) {
        super();
        this.#infer = infer;
    }

    override addEventListener(
        type: string,
        callback: EventListenerOrEventListenerObject | null,
        options?: AddEventListenerOptions | boolean
    ): void {
        super.addEventListener(type, callback, options);

        if (!this.#watchedProperties.has(type)) {
            // Placeholder cleanup until async wiring completes
            this.#watchedProperties.set(type, () => {});
            this.#wireProperty(type);
        }
    }

    override removeEventListener(
        type: string,
        callback: EventListenerOrEventListenerObject | null,
        options?: EventListenerOptions | boolean
    ): void {
        super.removeEventListener(type, callback, options);
    }

    async #wireProperty(propName: string): Promise<void> {
        const element = this.#infer.enhancedElement;

        // Snapshot current value before async setup
        const initialValue = (element as any)[propName];

        const cleanup = await this.#setupStrategy(element, propName);
        this.#watchedProperties.set(propName, cleanup);

        // If value changed during async wiring, dispatch immediately
        const currentValue = (element as any)[propName];
        if (currentValue !== initialValue) {
            this.dispatchEvent(new Event(propName));
        }
    }

    /**
     * Determine and set up the best observation strategy for a property.
     * Returns a cleanup function.
     */
    async #setupStrategy(element: Element, propName: string): Promise<() => void> {
        // Strategy 1: Attribute-reflected properties
        const attrName = this.#toAttributeName(propName);
        if (this.#isAttributeReflected(element, propName, attrName)) {
            return this.#observeAttribute(element, propName, attrName);
        }

        // Strategy 2: Native event (user-driven) + setter interception (programmatic)
        const eventType = this.#getNativeEventType(element, propName);
        if (eventType) {
            return this.#observeHybrid(element, propName, eventType);
        }

        // Strategy 3: Setter interception (custom elements or known prototypes)
        const descriptor = this.#getPropertyDescriptor(element, propName);
        if (descriptor?.set) {
            return this.#interceptSetter(element, propName, descriptor);
        }

        // Strategy 4: Polling fallback
        return this.#observePolling(element, propName);
    }

    // ─── Strategy Implementations ────────────────────────────────────────

    /**
     * Strategy 1: Use MutationObserver on the corresponding attribute.
     */
    #observeAttribute(element: Element, propName: string, attrName: string): () => void {
        const observer = new MutationObserver(() => {
            this.dispatchEvent(new Event(propName));
        });
        observer.observe(element, {
            attributes: true,
            attributeFilter: [attrName],
        });
        return () => observer.disconnect();
    }

    /**
     * Strategy 2: Listen for native events AND intercept setter for programmatic changes.
     */
    #observeHybrid(element: Element, propName: string, eventType: string): () => void {
        const ac = new AbortController();
        const {signal} = ac;

        // Listen for user-driven events
        element.addEventListener(eventType, () => {
            this.dispatchEvent(new Event(propName));
        }, {signal});

        // Also intercept setter for programmatic changes
        const descriptor = this.#getPropertyDescriptor(element, propName);
        let restoreSetter: (() => void) | undefined;
        if (descriptor?.set) {
            restoreSetter = this.#interceptSetter(element, propName, descriptor);
        }

        return () => {
            ac.abort();
            restoreSetter?.();
        };
    }

    /**
     * Strategy 3: Override the property setter on the instance to detect programmatic writes.
     */
    #interceptSetter(element: Element, propName: string, descriptor: PropertyDescriptor): () => void {
        const originalSet = descriptor.set!;
        const originalGet = descriptor.get;
        const self = this;

        Object.defineProperty(element, propName, {
            get: originalGet ? function(this: any) { return originalGet.call(this); } : undefined,
            set(this: any, newValue: any) {
                const oldValue = originalGet ? originalGet.call(this) : undefined;
                originalSet.call(this, newValue);
                if (newValue !== oldValue) {
                    self.dispatchEvent(new Event(propName));
                }
            },
            configurable: true,
            enumerable: descriptor.enumerable,
        });

        return () => {
            // Restore by deleting instance property — prototype descriptor takes over again
            delete (element as any)[propName];
        };
    }

    /**
     * Strategy 4: Polling via requestAnimationFrame.
     */
    #observePolling(element: Element, propName: string): () => void {
        let active = true;
        let lastValue = (element as any)[propName];

        const poll = () => {
            if (!active) return;
            const currentValue = (element as any)[propName];
            if (currentValue !== lastValue) {
                lastValue = currentValue;
                this.dispatchEvent(new Event(propName));
            }
            requestAnimationFrame(poll);
        };
        requestAnimationFrame(poll);

        return () => { active = false; };
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    /**
     * Convert a camelCase property name to its kebab-case attribute equivalent.
     * e.g. ariaValueNow -> aria-valuenow
     */
    #toAttributeName(propName: string): string {
        // aria properties have a direct mapping
        if (propName.startsWith('aria')) {
            return propName.replace(/([A-Z])/g, '-$1').toLowerCase();
        }
        // General camelCase to kebab-case
        return propName.replace(/([A-Z])/g, '-$1').toLowerCase();
    }

    /**
     * Check if setting a property updates the corresponding attribute.
     */
    #isAttributeReflected(element: Element, propName: string, attrName: string): boolean {
        // Quick check: does the attribute currently exist or is the property known to reflect?
        if (element.hasAttribute(attrName)) return true;

        // For aria-* properties, they are spec-defined as reflecting
        if (propName.startsWith('aria')) return true;

        // For href, src on appropriate elements
        const reflectedProps: Record<string, string[]> = {
            'href': ['a', 'area', 'link', 'base'],
            'src': ['img', 'script', 'iframe', 'audio', 'video', 'source', 'embed'],
            'action': ['form'],
            'value': ['option', 'param', 'li'],
        };
        const localName = element.localName;
        if (reflectedProps[propName]?.includes(localName)) return true;

        return false;
    }

    /**
     * Determine the native event type that fires when a property changes (user-driven).
     * Leverages Infer's inferEventType for elements known to have input-like behavior.
     */
    #getNativeEventType(element: Element, propName: string): string | undefined {
        const {localName} = element;
        // Only applicable for form-like elements with value/checked properties
        if (['input', 'textarea', 'select'].includes(localName)) {
            if (propName === 'value' || propName === 'checked' || propName === 'selectedIndex') {
                return inferEventType(element);
            }
        }
        if (localName === 'details' && propName === 'open') {
            return 'toggle';
        }
        // contentEditable elements fire 'input' events on user edits
        if (element instanceof HTMLElement && element.isContentEditable) {
            if (propName === 'textContent' || propName === 'innerHTML' || propName === 'innerText') {
                return 'input';
            }
        }
        return undefined;
    }

    /**
     * Walk the prototype chain to find a property descriptor.
     */
    #getPropertyDescriptor(element: Element, propName: string): PropertyDescriptor | undefined {
        let proto: any = Object.getPrototypeOf(element);
        while (proto && proto !== Object.prototype) {
            const desc = Object.getOwnPropertyDescriptor(proto, propName);
            if (desc) return desc;
            proto = Object.getPrototypeOf(proto);
        }
        return undefined;
    }

    /**
     * Tear down all watchers and clean up resources.
     */
    destroy(): void {
        for (const cleanup of this.#watchedProperties.values()) {
            cleanup();
        }
        this.#watchedProperties.clear();
    }
}
