import { withScopePerimeter } from './withScopePerimeter.js';
/**
 * Symbol for smart value assignment
 */
export const value = Symbol.for('inferencer:value');
/**
 * Symbol for smart display assignment
 */
export const display = Symbol.for('inferencer:display');
/**
 * Enhancement class that provides smart value and display property inference
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
    get eventType() {
        return inferEventType(this.enhancedElement);
    }
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
 * Check if an element requires propagator-based observation
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
            if (localName.includes('-'))
                return true;
            return inferEventType(element) === 'click';
    }
}
export function inferBindingProperty(element) {
    return element.getAttribute('itemprop') || element.getAttribute('name') || element.getAttribute('id') || 'value';
}
export default registryItem;
