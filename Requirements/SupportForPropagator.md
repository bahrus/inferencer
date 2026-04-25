# Support for Propagator

A common requirement for working with multiple DOM elements, built in and custom, is being able to subscribe to changes of a property.

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