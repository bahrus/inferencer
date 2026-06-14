# inferencer

DOM Element Enhancement that makes commonly used inferences for value, display, and event type properties.

[![NPM version](https://badge.fury.io/js/inferencer.png)](http://badge.fury.io/js/inferencer)

## Installation

```bash
npm install inferencer assign-gingerly
```

## Overview

The `inferencer` enhancement provides an attribute-less [element enhancement](https://github.com/bahrus/assign-gingerly#object-and-element-enhancements-via-assign-gingerly) API for smart value and display property assignment. Instead of manually determining which property to set on different element types (e.g., `value` for inputs, `checked` for checkboxes, `textContent` for divs), *inferencer* automatically infers the correct property based on the element type.

### Why inferencer?

Different HTML elements use different properties to represent their value:
- Input text fields use `value`
- Checkboxes and radio buttons use `checked`
- Time elements use `dateTime`
- Divs and spans use `textContent`
- Progress and meter elements use `value` but display with `ariaValueText`

The inferencer enhancement eliminates the need to remember these differences by providing symbols that automatically map to the correct property:

- `value` symbol - Sets the element's data value
- `display` symbol - Sets the element's display/presentation value
- `eventType` getter - Returns the most appropriate event type for the element

## Basic Usage

```TypeScript
import { value, display, registryItem } from 'inferencer/inferencer.js';
import 'assign-gingerly/object-extension.js';

// Use the value symbol - automatically sets the right property
const input = document.createElement('input');
input.type = 'text';
input.set[value] = 'hello';
console.log(input.value); // 'hello'

// alternatively:

const inputInference = input.enh.get(registryItem);
inputInference.value = 'goodbye';

console.log(input.value); // 'goodbye'

const checkbox = document.createElement('input');
checkbox.type = 'checkbox';
checkbox.set[value] = true;
console.log(checkbox.checked); // true

const div = document.createElement('div');
div.set[value] = 'content';
console.log(div.textContent); // 'content'

const time = document.createElement('time');
time.set[value] = '2024-01-01T00:00:00Z';
console.log(time.dateTime); // '2024-01-01T00:00:00Z'
```

## Value Property Inference

The `value` symbol automatically maps to the most appropriate property for each element type:

| Element Type | Property Set | Example |
|-------------|-------------|---------|
| `<input type="text">` | `value` | Text input value |
| `<input type="checkbox">` | `checked` | Checkbox state |
| `<input type="radio">` | `checked` | Radio button state |
| `<textarea>` | `value` | Textarea content |
| `<select>` | `value` | Selected option |
| `<time>` | `dateTime` | ISO datetime string |
| `<data>` | `value` | Machine-readable value |
| `<meter>` | `value` | Numeric value |
| `<progress>` | `value` | Progress value |
| `<output>` | `value` | Output value |
| Elements with `itemprop` | `itemprop` value | Custom property name |
| Other elements | `textContent` | Text content |

## Display Property Inference

The `display` symbol sets the human-readable display value:

```TypeScript
// Time element - display formatted time
const time = document.createElement('time');
time.set[value] = '2024-01-01T00:00:00Z';  // Machine-readable
time.set[display] = 'January 1, 2024';      // Human-readable
console.log(time.dateTime);    // '2024-01-01T00:00:00Z'
console.log(time.textContent); // 'January 1, 2024'

// Meter element - display with ARIA
const meter = document.createElement('meter');
meter.min = 0;
meter.max = 100;
meter.set[value] = 75;                    // Numeric value
meter.set[display] = '75 percent';        // Screen reader text
console.log(meter.value);          // 75
console.log(meter.ariaValueText);  // '75 percent'
```

| Element Type | Property Set | Example |
|-------------|-------------|---------|
| `<input>`, `<textarea>`, `<select>` | `value` | Form control value |
| `<time>` | `textContent` | Formatted time string |
| `<data>` | `textContent` | Human-readable content |
| `<meter>`, `<progress>` | `ariaValueText` | Screen reader text |
| Other elements | `textContent` | Text content |

## Event Type Inference

The `inferEventType` function returns the most appropriate event type for different element types:

```TypeScript
import { inferEventType } from 'inferencer';

const input = document.createElement('input');
console.log(inferEventType(input)); // 'input'

const form = document.createElement('form');
console.log(inferEventType(form)); // 'submit'

const button = document.createElement('button');
console.log(inferEventType(button)); // 'click'
```

| Element Type | Event Type | Use Case |
|-------------|-----------|----------|
| `<input>`, `<textarea>`, `<select>` | `input` | Form control value changes |
| `<form>` | `submit` | Form submission |
| `<details>` | `toggle` | Details element open/close |
| `<dialog>` | `close` | Dialog dismissal |
| Other elements | `click` | Default interactive event |

**Accessing via Enhancement Instance:**

```TypeScript
const input = document.createElement('input');
input.set[value] = 'test';

console.log(input.enh.infer.eventType); // 'input'

const form = document.createElement('form');
form.set[value] = 'test';

console.log(form.enh.infer.eventType); // 'submit'
```

This is particularly useful when building enhancements that need to attach event listeners but don't know the element type in advance.

## Propagator Support

The inferencer provides a `getPropagator()` method that returns an `EventTarget` which emits events when element properties change. This solves a common challenge: subscribing to property changes across different element types, whether the change is user-driven or programmatic.

### Basic Usage

```TypeScript
import { Infer } from 'inferencer/inferencer.js';

const input = document.createElement('input');
const infer = new Infer(input);
const propagator = await infer.getPropagator();

// Listen for value changes — works for both user input and programmatic sets
propagator.addEventListener('value', () => {
    console.log('value changed to:', input.value);
});

input.value = 'programmatic change'; // fires the listener
```

The event name matches the property name being observed. Observation is lazy — wiring only happens for properties you actually subscribe to.

### How It Works

For **custom elements with a [roundabout](https://github.com/bahrus/roundabout) propagator**, `getPropagator()` returns the element's native propagator directly — no inference needed.

For all other elements, it creates an `InferencedPropagator` that uses the best available strategy to detect changes:

| Strategy | When Used | Mechanism |
|----------|-----------|-----------|
| Attribute observation | Properties that reflect to attributes (aria-*, href, src) | MutationObserver |
| Hybrid event + setter | Form controls (input, textarea, select) | Native event + setter interception |
| Setter interception | Custom elements with prototype setters | Instance property override |
| Polling | Everything else (last resort) | requestAnimationFrame dirty check |

### Attribute-Reflected Properties

Properties like `ariaLabel`, `href`, and `src` that reflect to DOM attributes are observed via MutationObserver:

```TypeScript
const anchor = document.createElement('a');
const infer = new Infer(anchor);
const propagator = await infer.getPropagator();

propagator.addEventListener('href', () => {
    console.log('href changed to:', anchor.href);
});

anchor.href = 'https://example.com'; // fires the listener
```

### Form Controls (Hybrid Strategy)

For `<input>`, `<textarea>`, and `<select>`, changes can come from user interaction (which fires native events) or programmatic assignment (which doesn't). The propagator handles both:

```TypeScript
const input = document.createElement('input');
const infer = new Infer(input);
const propagator = await infer.getPropagator();

propagator.addEventListener('value', () => {
    console.log('value is now:', input.value);
});

// User types → native 'input' event → propagator fires
// Programmatic: input.value = 'hello' → setter intercept → propagator fires
```

### Custom Elements

For custom elements with standard getters/setters on the prototype, setter interception catches all programmatic changes:

```TypeScript
class MyCounter extends HTMLElement {
    #count = 0;
    get count() { return this.#count; }
    set count(v) { this.#count = v; }
}
customElements.define('my-counter', MyCounter);

const el = document.createElement('my-counter');
const infer = new Infer(el);
const propagator = await infer.getPropagator();

propagator.addEventListener('count', () => {
    console.log('count changed to:', el.count);
});

el.count = 5; // fires the listener
```

### Roundabout Elements

Custom elements that implement a [roundabout property](https://github.com/bahrus/roundabout) already have a native propagator. `getPropagator()` detects this and returns it directly:

```TypeScript
// Element with native propagator — no inference needed
const el = document.createElement('my-roundabout-element');
const infer = new Infer(el);
const propagator = await infer.getPropagator();

// This IS the element's own propagator, not an inferred one
propagator.addEventListener('someProperty', handler);
```

### Cleanup

Call `destroy()` to tear down all watchers when you're done:

```TypeScript
const propagator = await infer.getPropagator();
propagator.addEventListener('value', handler);

// Later, when no longer needed:
propagator.destroy();
```

### Using InferencedPropagator Directly

You can also import and use `InferencedPropagator` directly if you already have an `Infer` instance:

```TypeScript
import { InferencedPropagator } from 'inferencer/InferencedPropagator.js';
import { Infer } from 'inferencer/inferencer.js';

const element = document.createElement('input');
const infer = new Infer(element);
const propagator = new InferencedPropagator(infer);

propagator.addEventListener('value', () => {
    console.log('changed:', element.value);
});
```

## Accessing the Enhancement Instance

The inferencer enhancement is accessible via `element.enh.infer`:

```TypeScript
const input = document.createElement('input');
input.set[value] = 'test';

// Access the enhancement instance
console.log(input.enh.infer.value); // 'test' (cached value)

// The instance maintains references to both value and display
input.set[display] = 'Test Display';
console.log(input.enh.infer.value);   // 'test'
console.log(input.enh.infer.display); // 'Test Display'
console.log(input.enh.infer.eventType); // 'input'
```

## Using with assignGingerly

The inferencer enhancement integrates seamlessly with `assignGingerly`:

```TypeScript
import { value, display } from 'inferencer';
import 'assign-gingerly/object-extension.js';

const element = document.createElement('input');
element.type = 'text';

// Use symbols in assignGingerly
element.assignGingerly({
  [value]: 'hello world',
  style: {
    color: 'blue'
  }
});

console.log(element.value);       // 'hello world'
console.log(element.style.color); // 'blue'
```

## Itemprop Support

Elements with an `itemprop` attribute use that attribute's value as the property name:

```html
<span itemprop="title"></span>
```

```TypeScript
const span = document.querySelector('[itemprop="title"]');
span.set[value] = 'My Title';
console.log(span.title); // 'My Title'
```

## Helper Functions

The inferencer module exports helper functions for manual property and event type inference:

```TypeScript
import { inferValueProperty, inferDisplayProperty, inferEventType } from 'inferencer';

const input = document.createElement('input');
input.type = 'checkbox';

const valueProp = inferValueProperty(input);
console.log(valueProp); // 'checked'

const displayProp = inferDisplayProperty(input);
console.log(displayProp); // 'value'

const eventType = inferEventType(input);
console.log(eventType); // 'input'
```

These functions can be useful when you need to determine the property or event type name without actually setting a value or attaching a listener.

## Implementation Details

The inferencer enhancement is implemented as a standard enhancement class:

```TypeScript
class Infer<TValue = any, TDisplay = any> {
  #weakRef: WeakRef<Element>;
  
  constructor(enhancedElement?: Element) {
    this.#weakRef = new WeakRef(enhancedElement!);
  }
  
  get value(): TValue | undefined { /* ... */ }
  set value(nv: TValue) {
    const element = this.#weakRef.deref()!;
    element[inferValueProperty(element)] = nv;
  }
  
  get display(): TDisplay | undefined { /* ... */ }
  set display(nv: TDisplay) {
    const element = this.#weakRef.deref()!;
    element[inferDisplayProperty(element)] = nv;
  }
  
  get eventType(): string {
    return inferEventType(this.enhancedElement);
  }
}
```

**Registry Configuration:**

```TypeScript
export const registryItem: EnhancementConfig = {
  spawn: Infer,
  enhKey: 'infer',
  symlinks: {
    [value]: 'value',
    [display]: 'display'
  }
};
```

The `symlinks` mapping connects the symbols to the enhancement's properties, enabling the `element.set[symbol]` syntax.

## Benefits

1. **Type-agnostic code**: Write code that works with any element type without conditionals
2. **Cleaner syntax**: No need to remember which property each element type uses
3. **Accessibility**: Separate value and display properties support screen readers
4. **Framework-friendly**: Symbols work well with reactive frameworks and data binding
5. **Extensible**: Based on the enhancement registry system, can be customized or extended
6. **Event inference**: Automatically determine the most appropriate event type for any element

## Complete Example

```html
<!DOCTYPE html>
<html>
<head>
  <script type="module">
    import { value, display, registryItem } from 'inferencer';
    import 'assign-gingerly/object-extension.js';
    
    // Register the enhancement
    customElements.enhancementRegistry.push(registryItem);
    
    // Create various elements
    const input = document.createElement('input');
    input.type = 'text';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    
    const time = document.createElement('time');
    
    const meter = document.createElement('meter');
    meter.min = 0;
    meter.max = 100;
    
    // Set values using the same symbol - each element handles it correctly
    input.set[value] = 'Hello World';
    checkbox.set[value] = true;
    time.set[value] = '2024-01-01T00:00:00Z';
    time.set[display] = 'January 1, 2024';
    meter.set[value] = 75;
    meter.set[display] = '75 percent';
    
    // Add to document
    document.body.append(input, checkbox, time, meter);
    
    console.log('Input value:', input.value);           // 'Hello World'
    console.log('Checkbox checked:', checkbox.checked); // true
    console.log('Time dateTime:', time.dateTime);       // '2024-01-01T00:00:00Z'
    console.log('Time display:', time.textContent);     // 'January 1, 2024'
    console.log('Meter value:', meter.value);           // 75
    console.log('Meter display:', meter.ariaValueText); // '75 percent'
    
    // Event type inference
    console.log('Input event:', input.enh.infer.eventType);   // 'input'
    console.log('Meter event:', meter.enh.infer.eventType);   // 'click'
  </script>
</head>
<body>
  <h1>Inferencer Enhancement Demo</h1>
</body>
</html>
```

## Browser Support

The inferencer enhancement requires:
- Chrome 146+ (for scoped custom element registries)
- Modern browsers with Symbol support
- WeakRef support (all modern browsers)

For browsers without scoped registry support, the enhancement falls back to the global `customElements.enhancementRegistry`.

## API Reference

### Exports

- `value: symbol` - Symbol for smart value assignment
- `display: symbol` - Symbol for smart display assignment
- `registryItem: EnhancementConfig` - Registry configuration for the enhancement
- `Infer: class` - The enhancement class
- `inferValueProperty(element: Element): string` - Helper function to infer value property name
- `inferDisplayProperty(element: Element): string` - Helper function to infer display property name
- `inferEventType(element: Element): string` - Helper function to infer event type name
- `InferencedPropagator: class` - (from `inferencer/InferencedPropagator.js`) EventTarget that infers property change detection

## License

MIT

## Related Packages

- [assign-gingerly](https://www.npmjs.com/package/assign-gingerly) - Required dependency for enhancement registry support

## Viewing Locally

Any web server that serves static files with server-side includes will do but...

1. Install git
2. Fork/clone this repo
3. Install node.js
4. Open command window to folder where you cloned this repo
5. > git submodule add https://github.com/bahrus/types.git types
6. > git submodule update --init --recursive
7. > npm install
8. > npm run serve
9. Open http://localhost:8000/demo/ in a modern browser

## Running Tests

```
> npm run test
```
