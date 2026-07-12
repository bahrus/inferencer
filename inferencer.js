import { withScopePerimeter } from "./withScopePerimeter.js";
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
    /**
     * Get the inferred value property name for the element
     * @returns The property name used for value assignment (e.g. 'value', 'checked', 'dateTime')
     */
    get valueProperty() {
        return inferValueProperty(this.enhancedElement);
    }
    ['|'](itempropAttr, scopeBoundary = '[itemscope]') {
        const candidates = this.enhancedElement.querySelectorAll(`[itemprop="${itempropAttr}"]`);
        return Array.from(candidates)
            .filter(el => withScopePerimeter(this.enhancedElement, el, scopeBoundary))
            .map(x => new Infer(x, itempropAttr));
    }
    ['@'](nameAttr, scopeBoundary) {
        const candidates = this.enhancedElement.querySelectorAll(`[name="${nameAttr}"]`);
        const filtered = scopeBoundary
            ? Array.from(candidates).filter(el => withScopePerimeter(this.enhancedElement, el, scopeBoundary))
            : Array.from(candidates);
        return filtered.map(x => new Infer(x, nameAttr));
    }
    ['%'](partAttr, scopeBoundary) {
        const candidates = this.enhancedElement.querySelectorAll(`[part~="${partAttr}"]`);
        const filtered = scopeBoundary
            ? Array.from(candidates).filter(el => withScopePerimeter(this.enhancedElement, el, scopeBoundary))
            : Array.from(candidates);
        return filtered.map(x => new Infer(x, partAttr));
    }
    ['#'](id, scopeBoundary) {
        const candidates = this.enhancedElement.querySelectorAll(`#${id}`);
        const filtered = scopeBoundary
            ? Array.from(candidates).filter(el => withScopePerimeter(this.enhancedElement, el, scopeBoundary))
            : Array.from(candidates);
        return filtered.map(x => new Infer(x, id));
    }
    ['.'](className, scopeBoundary) {
        const candidates = this.enhancedElement.querySelectorAll(`.${className}`);
        const filtered = scopeBoundary
            ? Array.from(candidates).filter(el => withScopePerimeter(this.enhancedElement, el, scopeBoundary))
            : Array.from(candidates);
        return filtered.map(x => new Infer(x, className));
    }
    setDisplay(vm) {
        const val = this.#propName ? vm[this.#propName] : inferBindingProperty(this.enhancedElement);
        this.display = val;
    }
    get defaultRemoteBindingPropName() {
        const { enhancedElement } = this;
        return enhancedElement.getAttribute('itemprop') || enhancedElement.getAttribute('name') || enhancedElement.getAttribute('id') || 'value';
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
    // Non-empty itemscope → route through ish (itemscope manager)
    const itemscope = element.getAttribute('itemscope');
    if (itemscope !== null && itemscope !== '') {
        return 'ish';
    }
    const { localName } = element;
    switch (localName) {
        case 'input': {
            const type = element.getAttribute('type')?.toLowerCase();
            switch (type) {
                case 'checkbox':
                case 'radio':
                    return 'checked';
                case 'number':
                case 'range':
                    return 'valueAsNumber';
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
        case 'a':
        case 'area':
            return 'href';
        default: {
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
/**
 * Check if an element requires propagator-based observation for value changes.
 * Elements like <data>, <meter>, <output>, <time> have no meaningful user-driven
 * event for value changes — their values change programmatically and reflect to attributes.
 * Custom elements (names containing '-') should also use the propagator path, since they
 * may expose a native propagator (EventTarget) for property change notification.
 * For these elements, consumers should use InferencedPropagator rather than raw addEventListener.
 * @param element - The element to check
 * @returns true if the element needs propagator-based observation
 */
export function needsPropagator(element) {
    const { localName } = element;
    switch (localName) {
        case 'data':
        case 'meter':
        case 'output':
        case 'time':
            return true;
        default:
            // Custom elements should use propagator path — Infer.getPropagator()
            // will check for a native propagator or fall back to InferencedPropagator
            if (localName.includes('-'))
                return true;
            return inferEventType(element) === 'click';
    }
}
export function inferBindingProperty(element) {
    return element.getAttribute('itemprop') || element.getAttribute('name') || element.getAttribute('id') || 'value';
}
export default registryItem;
