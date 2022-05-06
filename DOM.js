// JavaScript HTML DOM overwrite

// global variables
const CROS_SERVER_ENDPOINT = window.location.origin + '/'
const injects = {
    ws: '<script src="/local/ws.js"></script>',
    dom: '<script src="/local/DOM.js"></script>',
    redirEndPoint: CROS_SERVER_ENDPOINT + 'sw-signal/navigate/', //'sw-signal/anchor-navigate/',
    winLocation: 'win.location',
}
const old = { // references to origional functions
    createElement:  document.createElement,
}

document.createElement = function (tagName, options) {
    let element = old.createElement.call(this, tagName, options);
    element.__CROS_PROPERTIES = {}
    element.__CROS_PROPERTIES.integrity = '';
    if (element.integrity != undefined) { // integrity override
        element.__defineSetter__('integrity', function (value) { return this.__CROS_PROPERTIES.integrity = value; });
        element.__defineGetter__('integrity', function () { return this.__CROS_PROPERTIES.integrity; });
    }

    return element;
}
Document.prototype.createElement = document.createElement;






// DOM Observer is used as a daynamic interceptor for all the links in the page
// it's also used to modify some attributes that got somehow added bypassing html createlement (which normally don't work, but why not)

function redirect(targetAttr, node, endpoint) {
    const protocol = node[targetAttr].substring(0, 7)
    if (protocol === 'http://' || protocol === 'https:/') {
        node[targetAttr] = endpoint + node[targetAttr];
    }else if (protocol[0] + protocol[1] == '//') { // relative protocol
        node[targetAttr] = 'https:' + endpoint + node[targetAttr];
    }// do nothing if it's relative
}

// litertly copying mdn :)
// Select the node that will be observed for mutations
const targetNode = document

// Options for the observer (which mutations to observe)
const config = {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ['integrity', 'src', 'href', 'action', 'data', 'cite', 'srcset']
};

// Callback function to execute when mutations are observed
/**
 * 
 * @param {MutationRecord} mutationsList 
 * @param {MutationObserver} observer 
 * @constant {MutationRecord} mutation
 */
const callback = function (mutationsList, observer) {
    // Use traditional 'for loops' for IE 11
    for (const mutation of mutationsList) {
        if (mutation.type === 'attributes') {
            // console.log('The ' + mutation.attributeName + ' attribute was modified.');
            const targetAttr = mutation.attributeName; 
            const node = mutation.target;
            const nodeName = node.nodeName;
            if (!node[targetAttr].startsWith(CROS_SERVER_ENDPOINT)) {
                if (nodeName == 'A' || nodeName == 'IFRAME') {
                    redirect(targetAttr, node, injects.redirEndPoint);
                } else {
                    redirect(targetAttr, node, CROS_SERVER_ENDPOINT);
                }
            }
        }else if (mutation.type === 'childList') {
            let nodeList = mutation.addedNodes
            for (let i = 0; i < nodeList.length; i++) {
                const node = nodeList[i];
                const nodeName = node.nodeName;
                const targetAttr = node.src && 'src' 
                    || node.href && 'href' 
                    || node.action && 'action'
                    || node.data && 'data'
                    || node.cite && 'cite'
                    || node.srcset && 'srcset' 
                    || null
                if (targetAttr) {
                    if (node['integrity']) node.removeAttribute('integrity');
                    if (!node[targetAttr].startsWith(CROS_SERVER_ENDPOINT)) {
                        if (nodeName == 'A' || nodeName == 'IFRAME') {
                            redirect(targetAttr, node, injects.redirEndPoint);
                        } else {
                            redirect(targetAttr, node, CROS_SERVER_ENDPOINT);
                        }
                    } 
                }
            }
        }
    }
};

// Create an observer instance linked to the callback function
const observer = new MutationObserver(callback);

// Start observing the target node for configured mutations
observer.observe(targetNode, config);
console.log('DOM observer started');

// Later, you can stop observing
