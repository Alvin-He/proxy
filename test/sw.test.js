const CROS_SERVER_ENDPOINT = serviceWorker.scriptURL.substring(0, serviceWorker.scriptURL.length - 10); //'https://cros-proxy-testing.glitch.me/'
let CURRENT_URL = "";
const clientUUID = 'undefined!undefined!undefined!undefined!'; 

let webSockets = {};


// Escaping a string into a regexp, https://stackoverflow.com/a/494122
RegExp.escape = function (str) {
    return str.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
};

const REGEXP_CROS_SERVER_ENDPOINT = new RegExp(RegExp.escape(CROS_SERVER_ENDPOINT));

self.addEventListener('install', function (event) {
    console.log('Service worker installed.');
    self.skipWaiting();
});

self.addEventListener("message", async function (event){
    if (event.data){
        const client = event.source; 
        const id = event.data.id; 
        if (event.data.type == 'WEB_SOCKET_INIT') {
            console.log('WEB_SOCKET_INIT')
            try {
                if (webSockets[id] != undefined) { throw 'Web socket with id: ' + id + 'already exist.'}
                // generate the identifier
                let {host, origin, href} = new URL(event.data.url);
                const identifier = await generateIdentifier(host, origin);
                // set the target url pointing to our endpoint and send the websocket
                const targetUrl = (CROS_SERVER_ENDPOINT + 'LCPP/' + identifier).replace(/https?:\/\//, 'wss://');
                if (await notifyServer(identifier, event.data.url)) {
                    const socket = webSockets[id] = new WebSocket(targetUrl, event.data.protocols);
                    // listeners
                    socket.onopen = () => {
                        client.postMessage({
                            type: 'WEB_SOCKET_open',
                            id: id
                        })
                    }

                    socket.onmessage = (event) => {
                        client.postMessage({
                            type: 'WEB_SOCKET_message',
                            id: id,
                            event: {
                                data: event.data,
                                origin: event.origin, // API rewrite required
                                lastEventId: event.lastEventId,
                                source: undefined, //event.source // API rewrite required
                                ports: event.ports
                            }
                        })
                    }

                    socket.onclose = (event) => {
                        client.postMessage({
                            type: 'WEB_SOCKET_close',
                            id: id,
                            event: {
                                code: event.code,
                                reason: event.reason,
                                wasClean: event.wasClean
                            }
                        })
                    }

                    socket.onerror = () => {
                        client.postMessage({
                            type: 'WEB_SOCKET_error',
                            id: id
                        })
                    }

                    client.postMessage({
                        type: 'WEB_SOCKET_INIT',
                        status: 'ok',
                        socket: {
                            binaryType: socket.binaryType,
                            bufferedAmount: socket.bufferedAmount,
                            extensions: socket.extensions,
                            protocol: socket.protocol,
                            readyState: socket.readyState,
                            url: event.data.url
                        }
                    });
                }else{
                    throw 'Server rejected the request.';
                }
            } catch (error) {
                console.log(error);
                client.postMessage({
                    type: 'WEB_SOCKET_INIT',
                    status: 'failed',
                    error: error.toString()
                });
            }

        }else if (event.data.type == 'WEB_SOCKET_send') {
            webSockets[event.data.id].send(event.data.data);
            
        }else if (event.data.type == 'WEB_SOCKET_close') {
            webSockets[event.data.id].close(event.data.code, event.data.reason);
        }else if (event.data.type == 'FETCH_DOCUMENT'){
            // console.log(event.data.url)
            const url = event.data.url
            let response, status
            try {
                // fetch and parse 
                response = await parseHTML(await fetchDocument(url), url);
                status = 'ok';
            } catch (error) {
                response = error
                status = 'error'
            }
            event.source.postMessage({
                type : event.data.type,  
                url : url,
                status : status,
                response : response
            })
            
        }
        if (event.data.type == 'UPDATE_CURRENT_URL') {
            if (/\/$/.test(event.data.url)) {
                CURRENT_URL = event.data.url;
            }else{
                CURRENT_URL = event.data.url + '/';
            }
        };
    }
     
})

// generates an identifier in the form of LCPP-[host + origin hex hash]-[unix time stamp]-[client UUID]-CROS
async function generateIdentifier(host, origin) {
    // conbine host and origin into a single byte array, so we can hash them 
    const data = new TextEncoder().encode(host + origin); 
    // the hash in SHA-1 (you could use SHA-256, but it's just a UUID, so no need to make it too secure)
    const hash = await crypto.subtle.digest('SHA-1', data) 
    const hashArray = Array.from(new Uint8Array(hash)); // converts into Uint8Array 
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); // converts to hex 

    return 'LCPP-' + hashHex + '-' + Number(new Date) + '-' + clientUUID + '-CROS'
}

// ya, we're definely gonna switch to socket io afterwards .......
async function notifyServer(identifier, target) {
    const req = new Request(CROS_SERVER_ENDPOINT + 'LCPP', {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            identifier: identifier,
            origin: CURRENT_URL,
            target: target
        })
    })

    let res = await fetch(req)
    if (res.status == 201) { // if the server accepted the request
        return true;
    }else{ // if the server rejected the request, signal error to the client
        throw 'internal service worker error'
    }

}

/**
 * 
 * @param {String} htmlDocument 
 * @param {String} url 
 * @returns 
 */
async function parseHTML(htmlDocument) {
    const buffer = new Array(6); 
    const bufferLength = buffer.length - 1;
    for (let i = 0; i < 6; i++) {
        buffer[i] = htmlDocument[i];
    }// fill the buffer

    for (let i = 0; i < htmlDocument.length; i++) {
        if (buffer.join('') == '<head>') { // check if we found the header we wanted
            // insert at the next length 
            htmlDocument = htmlDocument.slice(0, i) + 
            '<script src="/ws.js"></script>' +
            htmlDocument.slice(i); 
            break;
        }
        buffer.shift(); // remove the previous char
        buffer[bufferLength] = htmlDocument[i]; // insert the new char
    }
    return htmlDocument
}

// Fetch a document from server
async function fetchDocument (url) {
    if (/https?:\/\/.*\..*/gi.test(url)) {
        const req = new Request(CROS_SERVER_ENDPOINT, {
            method: 'GET',
            headers: {
                'P-DOCUMENT-GET': url
            }
        }); 
        const res = await fetch(req); 
        if (res.ok) {
            return await res.text()
        }else{
            throw 'Request Failed.'
        }
    }else{
        throw 'URL must start with either http or https. Domain name or postfix is missing can also cause this error.'
    }
    
} 

// loads the old request data to a new one
function newReq(request,url) {
    // let Jstring = '{ { "request-url":"' + url.toString() + '"}'
    //     ',/n{ "' + key.toString() + '":"' + value.toString() + '" }'
    // console.log(Jstring + '}')
    return new Request(url ? url : request.url, {
        method: request.method, // probably the most important thing, don't want to have GET sent when we POST
        body: request.body ? request.body : null,
        // mode: request.mode == 'navigate' ?  : request.mode,
        headers: request.headers,
        mode: request.mode == 'navigate' ? 'cors' : request.mode,
        credentials: request.credentials,
        redirect: request.redirect
    });
}

const localResource = [ // local resource that the client can access
    'ws.js',
    'index.test.js',
    'test.html',
    'sw.test.js'
]
// request handler
async function handler(request) {
    // console.log(request.url)
    // if the server's endpoint is detected in the url
    if (REGEXP_CROS_SERVER_ENDPOINT.test(request.url)){
        // if we are asking for a local resource 
        let reqUrl = request.url.replace(REGEXP_CROS_SERVER_ENDPOINT, '')
        for (const path of localResource) {
            if (path == reqUrl) {
                return await fetch(request)
            }
        }
        // we might be handling a redirect passed from the server, so just pass it to the browser to handle it
        if (!CURRENT_URL) {
            return await fetch(request)
        }
    }
    
    // let url // for some dammn reason, eslint.org used absolute urls when they could have just used relative. Blame them for this if statement

    // if (
    //     request.url.substring(
    //         CROS_SERVER_ENDPOINT.length, 
    //         CROS_SERVER_ENDPOINT.length + CURRENT_URL ) == CURRENT_URL){
    //     url = request.url
    // }
    const url = request.url.replace(REGEXP_CROS_SERVER_ENDPOINT, CURRENT_URL)
    
    let response
    if (url.match(/https?:\/\//g).length > 2) {
        response = await fetch(newReq(
            request,
            request.url
        ));
    }else {
        response = await fetch(newReq(
            request,
            CROS_SERVER_ENDPOINT +
            url
        ));
    }
    // console.log(response.headers.forEach(function (value, key) {
    //     console.log(key + ': ' + value)
    // }));
    const contentType = response.headers.get('content-type');
    if (contentType && typeof contentType == 'string' && contentType.includes('text/html')) {
        return new Response(await parseHTML(await response.text()), {
            status: response.status,
            statusText: response.statusText,
            headers: new Headers(response.headers),
        })
    }else{
        return response;
    }
    
}

self.addEventListener('fetch',function (event) {
    // console.log(event.request.method + ' ' + event.request.url);
    // console.log(JSON.stringify(event.request))
    event.respondWith(handler(event.request))    
});
