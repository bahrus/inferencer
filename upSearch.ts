export async function upSearch(element: Element, id?: string){
    if(id){
        const target = (element.getRootNode() as DocumentFragment).getElementById(id);
        if(!target) throw 404;
        return await waitForIt(target);
    }
    const itemscope = element.closest('[itemscope]');
    if(!itemscope) {
        const host = (element.getRootNode() as ShadowRoot).host;
        if(!host) throw 404;
        return await waitForIt(host);
    }
    if(element.getAttribute('itemscope')){
        //has actual value, need to work with itemscope manager
        throw 'NI';
    }
    return waitForIt(itemscope);
}

async function waitForIt(element: Element){
    const {localName} = element;
    if(localName.includes('-')){
        await (element.customElementRegistry || customElements).whenDefined(localName);
    }
    return element;
}