const CROS_SERVER_ENDPOINT = serviceWorker.scriptURL.substring(0, serviceWorker.scriptURL.length - 10); //'https://cros-proxy-testing.glitch.me/'
let CURRENT_URL = "";
const clientUUID = 'undefined!undefined!undefined!undefined!'; 

let currentID = 0;
let webSockets = {
    0: null, // 0 is the default websocket(null);
};


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
        if (event.data.type == 'WEB_SOCKET_INIT') {
            console.log('WEB_SOCKET_INIT')
            const client = event.source;
            const id = currentID++; 
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
                    socket.addEventListener('open', () => {
                        client.postMessage({
                            type: 'WEB_SOCKET_open',
                            SOCKET_ID: id
                        })
                    });

                    socket.addEventListener('message', (event) => {
                        client.postMessage({
                            type: 'WEB_SOCKET_message',
                            SOCKET_ID: id,
                            event: {
                                data: event.data,
                                origin: undefined, // API rewrite required
                                lastEventId: event.lastEventId,
                                source: undefined, //event.source // API rewrite required
                                ports: event.ports
                            }
                        })
                    });

                    socket.addEventListener('close', (event) => {
                        client.postMessage({
                            type: 'WEB_SOCKET_close',
                            SOCKET_ID: id,
                            event: {
                                code: event.code,
                                reason: event.reason,
                                wasClean: event.wasClean
                            }
                        })
                    }); 

                    socket.addEventListener('error', () => {
                        client.postMessage({
                            type: 'WEB_SOCKET_error',
                            SOCKET_ID: id
                        })
                    });

                    client.postMessage({
                        type: 'WEB_SOCKET_INIT',
                        status: 'ok',
                        SOCKET_ID: id,
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
                // response = await parseHTML(await fetchDocument(url), url);
                await prefetchDocument(url);
                status = 'ok';
            } catch (error) {
                // response = error
                status = 'error'
            }
            event.source.postMessage({
                type : event.data.type,  
                url : url,
                status : status,
                // response : response
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

    let res = await fetch(req);
    if (res.status == 201) { // if the server accepted the request
        return true;
    }else{ // if the server rejected the request, signal error to the client
        throw 'internal service worker error'
    }

}

// prefetch the document
async function prefetchDocument(url) {
    const res = await fetch(CROS_SERVER_ENDPOINT + url);

    console.log(res)
    if (res.redirected) {
        console.log('redirected')
        CURRENT_URL = res.url.replace(REGEXP_CROS_SERVER_ENDPOINT, '');
    }else {
        console.log('not redirected'); 
        CURRENT_URL = res.url.replace(REGEXP_CROS_SERVER_ENDPOINT, '');
    }
    if (!/\/$/.test(CURRENT_URL)) {
        CURRENT_URL = CURRENT_URL + '/';
    }
}

/**
 * 
 * @param {String} htmlDocument 
 * @param {String} url 
 * @returns 
 */
async function parseHTML(htmlDocument) {
    if (htmlDocument.length < 1) return null; // if the document is empty, return null
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
async function newReq(request) { // ,url
    const body = await request.blob();
     
    return {
        method: request.method,
        headers: request.headers,
        body: body.length > 0 ? body : undefined, 
        mode: request.mode == 'navigate' ? 'cors' : request.mode, 
        credentials: request.credentials,
        cache: '', 
        redirect: request.redirect,

    }

    // return new Request(url ? url : request.url, {
    //     method: request.method, // probably the most important thing, don't want to have GET sent when we POST
    //     body: body.length > 0 ? body : null,
    //     // mode: request.mode == 'navigate' ?  : request.mode,
    //     headers: request.headers,
    //     mode: request.mode == 'navigate' ? 'cors' : request.mode,
    //     credentials: request.credentials,
    //     redirect: request.redirect
    // });


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
        if (!CURRENT_URL || /^https:\/\/127.0.0.1:3000\/https?:\/\//.test(request.url)) {
            return await fetch(request)
        }
    }; // tried to use else here but it somehow messed up the return values and caused 'undefined' behaviour
    console.log(request.url);
    const url = request.url.replace(REGEXP_CROS_SERVER_ENDPOINT, CURRENT_URL)
    
    let response
    if (url.match(/https?:\/\//g).length > 2) {
        // response = await fetch(await newReq(
        //     request,
        //     request.url
        // ));
        response = await fetch(request.url, await newReq(request));
    }else {
        response = await fetch(CROS_SERVER_ENDPOINT + url, await newReq(request));
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
