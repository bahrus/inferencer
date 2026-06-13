import { inferEventType } from './inferencer.js';
/**
 * An inferred propagator that extends EventTarget.
 * Emits property change events by intelligently hooking into
 * whatever change detection mechanism is available for the element.
 *
 * Property observation is lazy — wiring only happens when
 * addEventListener is called for a given property name.
 */
export class InferencedPropagator extends EventTarget {
    #infer;
    #watchedProperties = new Map();
    constructor(infer) {
        super();
        this.#infer = infer;
    }
    addEventListener(type, callback, options) {
        super.addEventListener(type, callback, options);
        if (!this.#watchedProperties.has(type)) {
            // Placeholder cleanup until async wiring completes
            this.#watchedProperties.set(type, () => { });
            this.#wireProperty(type);
        }
    }
    removeEventListener(type, callback, options) {
        super.removeEventListener(type, callback, options);
    }
    async #wireProperty(propName) {
        const element = this.#infer.enhancedElement;
        // Snapshot current value before async setup
        const initialValue = element[propName];
        const cleanup = await this.#setupStrategy(element, propName);
        this.#watchedProperties.set(propName, cleanup);
        // If value changed during async wiring, dispatch immediately
        const currentValue = element[propName];
        if (currentValue !== initialValue) {
            this.dispatchEvent(new Event(propName));
        }
    }
    /**
     * Determine and set up the best observation strategy for a property.
     * Returns a cleanup function.
     */
    async #setupStrategy(element, propName) {
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
    #observeAttribute(element, propName, attrName) {
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
    #observeHybrid(element, propName, eventType) {
        const ac = new AbortController();
        const { signal } = ac;
        // Listen for user-driven events
        element.addEventListener(eventType, () => {
            this.dispatchEvent(new Event(propName));
        }, { signal });
        // Also intercept setter for programmatic changes
        const descriptor = this.#getPropertyDescriptor(element, propName);
        let restoreSetter;
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
    #interceptSetter(element, propName, descriptor) {
        const originalSet = descriptor.set;
        const originalGet = descriptor.get;
        const self = this;
        Object.defineProperty(element, propName, {
            get: originalGet ? function () { return originalGet.call(this); } : undefined,
            set(newValue) {
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
            delete element[propName];
        };
    }
    /**
     * Strategy 4: Polling via requestAnimationFrame.
     */
    #observePolling(element, propName) {
        let active = true;
        let lastValue = element[propName];
        const poll = () => {
            if (!active)
                return;
            const currentValue = element[propName];
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
    #toAttributeName(propName) {
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
    #isAttributeReflected(element, propName, attrName) {
        // For form elements, 'value' attribute is only the default — property changes
        // from user input do NOT update the attribute, so it's not truly reflected.
        const { localName } = element;
        if (propName === 'value' && ['input', 'textarea', 'select', 'button'].includes(localName)) {
            return false;
        }
        // For <data>, <meter>, <output>, <progress> the value property reflects to the value attribute
        if (propName === 'value' && ['data', 'meter', 'output', 'progress'].includes(localName)) {
            return true;
        }
        // Quick check: does the attribute currently exist or is the property known to reflect?
        if (element.hasAttribute(attrName))
            return true;
        // For aria-* properties, they are spec-defined as reflecting
        if (propName.startsWith('aria'))
            return true;
        // For href, src on appropriate elements
        const reflectedProps = {
            'href': ['a', 'area', 'link', 'base'],
            'src': ['img', 'script', 'iframe', 'audio', 'video', 'source', 'embed'],
            'action': ['form'],
            'value': ['option', 'param', 'li'],
        };
        if (reflectedProps[propName]?.includes(localName))
            return true;
        return false;
    }
    /**
     * Determine the native event type that fires when a property changes (user-driven).
     * Leverages Infer's inferEventType for elements known to have input-like behavior.
     */
    #getNativeEventType(element, propName) {
        const { localName } = element;
        // Only applicable for form-like elements with value/checked properties
        if (['input', 'textarea', 'select'].includes(localName)) {
            if (propName === 'value' || propName === 'valueAsNumber' || propName === 'valueAsDate' || propName === 'checked' || propName === 'selectedIndex') {
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
    #getPropertyDescriptor(element, propName) {
        let proto = Object.getPrototypeOf(element);
        while (proto && proto !== Object.prototype) {
            const desc = Object.getOwnPropertyDescriptor(proto, propName);
            if (desc)
                return desc;
            proto = Object.getPrototypeOf(proto);
        }
        return undefined;
    }
    /**
     * Tear down all watchers and clean up resources.
     */
    destroy() {
        for (const cleanup of this.#watchedProperties.values()) {
            cleanup();
        }
        this.#watchedProperties.clear();
    }
}
