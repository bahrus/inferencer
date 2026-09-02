import type { EnhancementConfig } from "./types/assign-gingerly/types";
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
export class Infer<TValue = any, TDisplay = any> {
    #weakRef: WeakRef<Element>;

    #propName: string | undefined;

    #propagator: EventTarget | undefined;

    get enhancedElement(){
        return this.#weakRef.deref()!;
    }
    
    constructor(enhancedElement?: Element, propName?: string){
        this.#weakRef = new WeakRef(enhancedElement!);
        this.#propName = propName;
    }

    /**
     * Get a propagator (EventTarget) that emits events when properties change.
     * For custom elements with a native propagator (roundabout), returns that directly.
     * Otherwise, creates an InferencedPropagator that uses best-effort strategies
     * to detect property changes.
     */
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

    #value: TValue | undefined;
    
    get value(): TValue | undefined {
        const element = this.#weakRef.deref();
        if (element === undefined) return this.#value;
        const propName = typeof this.#propName === 'string'
            ? this.#propName
            : inferValueProperty(element);
        return coerceElementValue(element, propName) as TValue | undefined;
    }

    set value(nv: TValue){
        this.#value = nv;
        const {enhancedElement} = this;
        const propName = typeof this.#propName === 'string'
            ? this.#propName
            : inferValueProperty(enhancedElement);
        (enhancedElement as any)[propName] = serializeForProperty(propName, nv);
    }

    #display: TDisplay | undefined;
    
    get display(): TDisplay | undefined {
        return this.#display;
    }
    
    set display(nv: TDisplay){
        this.#display = nv;
        const {enhancedElement} = this;
        (enhancedElement as any)[inferDisplayProperty(enhancedElement)] = nv;
    }

    /**
     * Get the inferred event type for the element
     * @returns The most appropriate event type for this element
     */
    get eventType(): string {
        return inferEventType(this.enhancedElement);
    }

    /**
     * Get the inferred value property name for the element
     * @returns The property name used for value assignment (e.g. 'value', 'checked', 'dateTime')
     */
    get valueProperty(): string {
        return inferValueProperty(this.enhancedElement);
    }

    ['|'](itempropAttr: string, scopeBoundary: string = '[itemscope]'){
        return this.#queryScoped(`[itemprop="${itempropAttr}"]`, itempropAttr, scopeBoundary);
    }

    ['@'](nameAttr: string, scopeBoundary?: string){
        return this.#queryScoped(`[name="${nameAttr}"]`, nameAttr, scopeBoundary);
    }

    ['%'](partAttr: string, scopeBoundary?: string){
        return this.#queryScoped(`[part~="${partAttr}"]`, partAttr, scopeBoundary);
    }

    ['#'](id: string, scopeBoundary?: string){
        return this.#queryScoped(`#${id}`, id, scopeBoundary);
    }

    ['.'](className: string, scopeBoundary?: string){
        return this.#queryScoped(`.${className}`, className, scopeBoundary);
    }

    #queryScoped(selector: string, propName: string, scopeBoundary?: string): Infer[] {
        const candidates = this.enhancedElement.querySelectorAll(selector);
        const filtered = scopeBoundary
            ? Array.from(candidates).filter(el => withScopePerimeter(this.enhancedElement, el, scopeBoundary))
            : Array.from(candidates);
        return filtered.map(x => new Infer(x, propName));
    }

    setDisplay(vm: any){
        const val = this.#propName ? vm[this.#propName] : inferBindingProperty(this.enhancedElement);
        this.display = val;
    }

    get defaultRemoteBindingPropName(){
        const {enhancedElement} = this;
        return enhancedElement.getAttribute('itemprop') || enhancedElement.getAttribute('name') || enhancedElement.getAttribute('id') || 'value'
    }
}

/**
 * Registry item for the Infer enhancement
 * Register this with customElements.enhancementRegistry to enable smart value/display assignment
 */
export const registryItem: EnhancementConfig<any> = {
    spawn: Infer as any,
    enhKey: 'inferencer',
    symlinks: {
        [value]: 'value',
        [display]: 'display'
    }
}

/**
 * Infer the most appropriate value property for an element
 * @param element - The element to infer the property for
 * @returns The property name to use for value assignment
 */
export function inferValueProperty(element: Element): string {
    // Non-empty itemscope → route through ish (itemscope manager)
    const itemscope = element.getAttribute('itemscope');
    if (itemscope !== null && itemscope !== '') {
        return 'ish';
    }

    const {localName} = element;
    
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
 * Read the inferred value property off an element and coerce it to a natural
 * JavaScript type, mirroring the legacy be-value-added parsing rules:
 * - `<time>` (dateTime) -> Date (or undefined when empty)
 * - `<input type=number|range>` (valueAsNumber) -> number (undefined when NaN)
 * - `<input type=checkbox|radio>` (checked) -> boolean
 * - schema.org `itemtype` hints (Number/Integer/Float/Boolean/Date/DateTime) are honored
 * - `textContent` is returned verbatim
 * - everything else is JSON-parsed when possible (so `<data value="123">` -> 123,
 *   `<data value="true">` -> true), falling back to the raw string
 */
export function coerceElementValue(element: Element, propName: string = inferValueProperty(element)): any {
    const raw = (element as any)[propName];

    switch (propName) {
        case 'valueAsNumber':
            return Number.isNaN(raw) ? undefined : raw;
        case 'valueAsDate':
            return raw ?? undefined;
        case 'checked':
        case 'selectedIndex':
            return raw;
        case 'dateTime': {
            const s = raw == null ? '' : String(raw);
            return s === '' ? undefined : new Date(s);
        }
    }

    if (raw == null) return undefined;
    if (typeof raw !== 'string') return raw;

    switch (element.getAttribute('itemtype')) {
        case 'https://schema.org/Number': return Number(raw);
        case 'https://schema.org/Integer': return parseInt(raw, 10);
        case 'https://schema.org/Float': return parseFloat(raw);
        case 'https://schema.org/Boolean': return raw === 'true' || raw === 'True';
        case 'https://schema.org/Date':
        case 'https://schema.org/DateTime': return new Date(raw);
    }

    if (propName === 'textContent') return raw;
    if (raw === '') return undefined;

    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}

/**
 * Serialize a JS value for assignment to a (usually string-typed) DOM value
 * property, mirroring legacy be-value-added write-back:
 * - DOM-typed properties (`checked`, `valueAsNumber`, `valueAsDate`) take the raw value
 * - a `Date` is written as an ISO string (so `<time>.dateTime` round-trips)
 * - plain objects / arrays are JSON-stringified
 */
export function serializeForProperty(propName: string, nv: any): any {
    switch (propName) {
        case 'checked':
        case 'valueAsNumber':
        case 'valueAsDate':
            return nv;
    }
    if (nv instanceof Date) return nv.toISOString();
    if (nv !== null && typeof nv === 'object') return JSON.stringify(nv);
    return nv;
}

/**
 * Infer the most appropriate display property for an element
 * @param element - The element to infer the property for
 * @returns The property name to use for display assignment
 */
export function inferDisplayProperty(element: Element): string {
    const {localName} = element;
    
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
export function inferEventType(element: Element): string {
    const {localName} = element;
    
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
export function needsPropagator(element: Element): boolean {
    const {localName} = element;
    switch (localName) {
        case 'data':
        case 'meter':
        case 'output':
        case 'time':
            return true;
        default:
            // Custom elements should use propagator path — Infer.getPropagator()
            // will check for a native propagator or fall back to InferencedPropagator
            if (localName.includes('-')) return true;
            return inferEventType(element) === 'click';
    }
}

export function inferBindingProperty(element: Element): string {
    return element.getAttribute('itemprop') || element.getAttribute('name') || element.getAttribute('id') || 'value';
}

export default registryItem;
