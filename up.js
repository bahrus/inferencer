export async function up(element, id) {
    if (id) {
        const target = element.getRootNode().getElementById(id);
        if (!target)
            throw 404;
        return await waitForIt(target);
    }
    const itemscope = element.closest('[itemscope]');
    if (!itemscope) {
        const host = element.getRootNode().host;
        if (!host)
            throw 404;
        return await waitForIt(host);
    }
    if (element.getAttribute('itemscope')) {
        //has actual value, need to work with itemscope manager
        throw 'NI';
    }
    return waitForIt(itemscope);
}
async function waitForIt(element) {
    const { localName } = element;
    if (localName.includes('-')) {
        await (element.customElementRegistry || customElements).whenDefined(localName);
    }
    return element;
}
