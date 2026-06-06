/**
 * Symbol for smart value assignment
 * When used with element.set[value], it infers and sets the appropriate value property
 */
export const value = Symbol.for('inferencer:value');
/**
 * Symbol for smart display assignment
 * When used with element.set[display], it infers and sets the appropriate display property
 */
export const display = Symbol.for('inferencer:display');
/**
 * Enhancement class that provides smart value and display property inference
 * Automatically determines the correct property to set based on element type
 */
export class Infer {
    #weakRef;
    #propName;
    #propagator;
    get enhancedElement() {
        return this.#weakRef.deref();
    }
    constructor(enhancedElement, propName) {
        this.#weakRef = new WeakRef(enhancedElement);
        this.#propName = propName;
    }
    /**
     * Get a propagator (EventTarget) that emits events when properties change.
     * For custom elements with a native propagator (roundabout), returns that directly.
     * Otherwise, creates an InferencedPropagator that uses best-effort strategies
     * to detect property changes.
     */
    async getPropagator() {
        if (this.#propagator)
            return this.#propagator;
        const { enhancedElement } = this;
        const { localName } = enhancedElement;
        if (localName.includes('-')) {
            await (enhancedElement.customElementRegistry || customElements).whenDefined(localName);
            const { propagator } = enhancedElement;
            if (propagator instanceof EventTarget) {
                this.#propagator = propagator;
                return propagator;
            }
        }
        // No native propagator — create an inferred one
        const { InferencedPropagator } = await import('./InferencedPropagator.js');
        this.#propagator = new InferencedPropagator(this);
        return this.#propagator;
    }
    #value;
    get value() {
        return this.#value;
    }
    set value(nv) {
        this.#value = nv;
        const { enhancedElement } = this;
        enhancedElement[inferValueProperty(enhancedElement)] = nv;
    }
    #display;
    get display() {
        return this.#display;
    }
    set display(nv) {
        this.#display = nv;
        const { enhancedElement } = this;
        enhancedElement[inferDisplayProperty(enhancedElement)] = nv;
    }
    /**
     * Get the inferred event type for the element
     * @returns The most appropriate event type for this element
     */
    get eventType() {
        return inferEventType(this.enhancedElement);
    }
    ['|'](itempropAttr) {
        return Array.from(this.enhancedElement.querySelectorAll(`[itemprop="${itempropAttr}"]`))
            .map(x => new Infer(x, itempropAttr));
    }
    ['@'](nameAttr) {
        return Array.from(this.enhancedElement.querySelectorAll(`[itemprop="${nameAttr}"]`))
            .map(x => new Infer(x, nameAttr));
    }
    ['%'](partAttr) {
        return Array.from(this.enhancedElement.querySelectorAll(`[part~]="${partAttr}"]`))
            .map(x => new Infer(x, partAttr));
    }
    ['#'](id) {
        return Array.from(this.enhancedElement.querySelectorAll(`#${id}`))
            .map(x => new Infer(x, id));
    }
    ['.'](className) {
        return Array.from(this.enhancedElement.querySelectorAll(`.${className}`))
            .map(x => new Infer(x, className));
    }
    setDisplay(vm) {
        const val = this.#propName ? vm[this.#propName] : inferBindingProperty(this.enhancedElement);
        this.display = val;
    }
}
/**
 * Registry item for the Infer enhancement
 * Register this with customElements.enhancementRegistry to enable smart value/display assignment
 */
export const registryItem = {
    spawn: Infer,
    enhKey: 'inferencer',
    symlinks: {
        [value]: 'value',
        [display]: 'display'
    }
};
/**
 * Infer the most appropriate value property for an element
 * @param element - The element to infer the property for
 * @returns The property name to use for value assignment
 */
export function inferValueProperty(element) {
    const { localName } = element;
    switch (localName) {
        case 'input': {
            const type = element.getAttribute('type')?.toLowerCase();
            switch (type) {
                case 'checkbox':
                case 'radio':
                    return 'checked';
                default:
                    return 'value';
            }
        }
        case 'textarea':
        case 'select':
        case 'data':
        case 'meter':
        case 'progress':
        case 'output':
            return 'value';
        case 'time':
            return 'dateTime';
        default: {
            // Check for itemprop attribute as a hint
            const itemprop = element.getAttribute('itemprop');
            if (itemprop) {
                //[TODO] this is wrong
                return itemprop;
            }
            return 'textContent';
        }
    }
}
/**
 * Infer the most appropriate display property for an element
 * @param element - The element to infer the property for
 * @returns The property name to use for display assignment
 */
export function inferDisplayProperty(element) {
    const { localName } = element;
    switch (localName) {
        case 'input':
        case 'textarea':
        case 'select':
            return 'value';
        case 'meter':
        case 'progress':
            return 'ariaValueText';
        case 'time':
        case 'data':
        default:
            return 'textContent';
    }
}
/**
 * Infer the most appropriate event type for an element
 * Used when no explicit event type is provided
 * @param element - The element to infer the event type for
 * @returns The event type name like 'input', 'change', 'click', 'submit'
 */
export function inferEventType(element) {
    const { localName } = element;
    switch (localName) {
        case 'input':
        case 'textarea':
        case 'select':
            return 'input';
        case 'form':
            return 'submit';
        case 'details':
            return 'toggle';
        case 'dialog':
            return 'close';
        default:
            return 'click';
    }
}
export function inferBindingProperty(element) {
    return element.getAttribute('itemprop') || element.getAttribute('name') || element.getAttribute('id') || 'value';
}
export default registryItem;
