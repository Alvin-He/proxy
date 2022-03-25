const CROS_SERVER_ENDPOINT = serviceWorker.scriptURL.substring(0, serviceWorker.scriptURL.length - 'service-worker.js'.length); //'https://cros-proxy-testing.glitch.me/'
let CURRENT_URL = "";
const clientUUID = 'undefined!undefined!undefined!undefined!'; 

let currentID = 0;
// Information about websockets, NOTE: this contains every single websocket that the service worker controls
let webSockets = {
    0: null, // 0 is the default websocket(null);
};

// requests are handled specific to a frame(html page) so we can have muti tab support and iframes
let frames = {
    client: {
        CURRENT_URL: '', // the current url(origin/domain) of the client
        cookies: {}, // to be used in the future
        localStorage: {}, // to be used in the future
        sessionStorage: {}, // to be used in the future

    }
}

const injects = {
    ws: '<script src="/ws.js"></script>',
    redirEndPoint: CROS_SERVER_ENDPOINT + 'sw-signal/top-level-navigate/', //'sw-signal/anchor-navigate/',
    iframeRedir: CROS_SERVER_ENDPOINT  + 'sw-signal/top-level-navigate/'
}

const localResource = [ // local resource that the client can access
    'ws.js',
    'index.js',
    'client.html',
    'service-worker.js'
]

// Escaping a string into a regexp, https://stackoverflow.com/a/494122
RegExp.escape = function (str) {
    return str.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
};

const REGEXP_CROS_SERVER_ENDPOINT = new RegExp(RegExp.escape(CROS_SERVER_ENDPOINT));
// Utilities END

// Listeners
self.addEventListener('install', function (event) {
    console.log('Service worker installed.');
    self.skipWaiting();
});

self.addEventListener("message", async function (event){
    if (event.data){
        const client = event.source;
        if (event.data.type == 'WEB_SOCKET_INIT') {
            console.log('WEB_SOCKET_INIT')
            const id = currentID++; 
            try {
                if (webSockets[id] != undefined) { throw 'Web socket with id: ' + id + 'already exist.'}
                // generate the identifier
                let {host, origin, href} = new URL(event.data.url);
                const identifier = await generateIdentifier(host, origin);
                // set the target url pointing to our endpoint and send the websocket
                const targetUrl = (CROS_SERVER_ENDPOINT + 'LCPP/' + identifier).replace(/https?:\/\//, 'wss://');
                if (await notifyServer(identifier, frames[client.id].CURRENT_URL ,event.data.url)) {
                    let socket = webSockets[id] = new WebSocket(targetUrl, event.data.protocols);
                    socket.isLoopActive = false; 
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
                            // binaryType: socket.binaryType,
                            // bufferedAmount: socket.bufferedAmount,
                            extensions: socket.extensions,
                            protocol: socket.protocol,
                            // readyState: socket.readyState,
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
            const socket = webSockets[event.data.id]
            socket.send(event.data.data);
            // rapidly update the client about the websocket's buffer amount until we hit 0
            if (!socket.isLoopActive) { // one instance of loop at any given time
                const loop = setInterval(() => {
                    socket.isLoopActive = true;
                    if (socket.bufferedAmount > 0 && socket.readyState == 1) {
                        client.postMessage({
                            type: 'WEB_SOCKET_UPDATE',
                            data: socket.bufferedAmount,
                        });
                    } else {
                        clearInterval(loop);
                        client.postMessage({
                            type: 'WEB_SOCKET_UPDATE',
                            data: 0,
                        });
                        socket.isLoopActive = false;
                    }
                }, 100);
            }
        }else if (event.data.type == 'WEB_SOCKET_close') {
            webSockets[event.data.id].close(event.data.code, event.data.reason);
        }else if (event.data.type == 'FETCH_DOCUMENT'){
            // console.log(event.data.url)
            const originUrl = event.data.url
            let resultUrl, status
            try {
                // fetch and parse 
                // response = await parseHTML(await fetchDocument(url), url);
                resultUrl = await prefetchDocument(originUrl);
                // frames[client.id] = {
                //     CURRENT_URL: url,
                // }
                status = 'ok';
            } catch (error) {
                // response = error
                status = 'error'
            }
            event.source.postMessage({
                type : event.data.type,  
                originUrl: originUrl,
                resultUrl: resultUrl,
                status : status,
                // response : response
            })
            
        }else if (event.data.type == 'UPDATE_CURRENT_URL') {
            if (/\/$/.test(event.data.url)) {
                CURRENT_URL = event.data.url;
            }else{
                CURRENT_URL = event.data.url + '/';
            }
        };
    }
     
})

self.addEventListener('fetch', function (event) {
    // console.log(event.request.method + ' ' + event.request.url);
    // console.log(JSON.stringify(event.request))
    // if (event.resultingClientId && event.clientId == '') {
    //     frames[event.resultingClientId] = {
    //         CURRENT_URL: CURRENT_URL,
    //     }
    // }
    event.respondWith(requestHandler(event.request, event.clientId || event.resultingClientId));
});

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
async function notifyServer(identifier, origin, target) {
    const req = new Request(CROS_SERVER_ENDPOINT + 'LCPP', {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            identifier: identifier,
            origin: origin,
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
async function prefetchDocument(target) {
    target = new URL(target);
    const res = await fetch(CROS_SERVER_ENDPOINT + target.href);
    let url = res.url.replace(REGEXP_CROS_SERVER_ENDPOINT, '');
    if (res.redirected) {
        console.log('redirected')
        if (url.substring(0, 8).indexOf('://') == -1) {
            console.log('relatvie url')
            // TODO: handle redirects with relatvie urls
            url = target.origin + target.pathname + url              
        }
    }
    return url
    // CURRENT_URL = new URL(url)

    // try {
    //     CURRENT_URL = new URL(url).origin + '/';
    // }catch(e) {
    //     console.log('C_URL_ERR', url)
    // }
}

/**
 * Current preformance is: 4.5 ms per call when parsing https://discord.com
 * looking into DOMParser for a possible better solution, but this works and it's as fast as it needs to be
 * 
 * @param {String} htmlDocument 
 * @param {String} url 
 * @returns 
 */
async function parseHTML(htmlDocument) {
    if (htmlDocument.length < 1) return null; // if the document is empty, return null
    let length = htmlDocument.length;
    const buffer = new Array(6);
    const bufferLength = buffer.length - 1;
    for (let i = 0; i < 6; i++) {
        buffer[i] = htmlDocument[i];
    }// fill the buffer

    let currentIndex = 6;
    // HEAD parsing 
    for (let i = 0; i < length; i++) {
        if (buffer.join('').indexOf('<head>') > -1) { // check if we found the header we wanted
            // insert web socket script
            htmlDocument = htmlDocument.slice(0, i) + injects.ws + htmlDocument.slice(i);
            currentIndex = i + injects.ws.length; // load the index for next round iteration
            length += injects.ws.length; // update the length of the document
            break;
        }
        buffer.shift(); // remove the previous char
        buffer[bufferLength] = htmlDocument[i]; // insert the new char
    } // websocket script inject 
    for (let i = currentIndex; i < length; i++) {
        if (buffer.join('').indexOf('<base') > -1) { // found base
            // when we found the base, start looking for the href tag
            for (const e = i + 4; i <= e; i++) { // shift 4 times, so that we don't do unnecessary checks
                buffer.shift();
                buffer[bufferLength] = htmlDocument[i];
            }
            for (; i < length; i++) {
                if (buffer.join('').indexOf('href') > -1) { // found href
                    // currentIndex = i;
                    // when we found the href, start looking for the equal sign
                    for (; i < length; i++) {
                        if (htmlDocument[i] == '=') {
                            // currentIndex += i;
                            // when we found the equal sign, start looking for the quote
                            for (; i < length; i++) {
                                if (htmlDocument[i] == '"') {
                                    i++;
                                    // when we found the quote, start checking if we have an absolute url
                                    for (let I = 0; I < 6; I++) {
                                        buffer[I] = htmlDocument[i + I];
                                    }// reload the buffer as it's now outdated
                                    const val = buffer.join('');
                                    if (val == 'https:' || val == 'http:/') { // found absolute url
                                        // redirect the url
                                        htmlDocument = htmlDocument.slice(0, i) + injects.redirEndPoint + htmlDocument.slice(i);
                                        i += 6 + injects.redirEndPoint.length;
                                        length += injects.redirEndPoint.length;
                                    } else if (val[0] + val[1] == '//') { // relative protocol url handling 
                                        const injectionURL = injects.redirEndPoint + 'https:'; // add the protocol (service workers are always over https, so it's https)
                                        htmlDocument = htmlDocument.slice(0, i) + injectionURL + htmlDocument.slice(i);
                                        i += injectionURL.length + 6;
                                        length += injectionURL.length;
                                    }// if it's an relative url, we don't need to do anything
                                    currentIndex = i;
                                    break;
                                }
                            }
                            break;
                        }
                    }
                    break;
                }
                buffer.shift(); // remove the previous char
                buffer[bufferLength] = htmlDocument[i]; // insert the new char
            }
            break;
        }
        buffer.shift(); // remove the previous char
        buffer[bufferLength] = htmlDocument[i]; // insert the new char
    } // base tag modification 
    for (let i = currentIndex; i < length; i++) {
        if (buffer.join('') == '/head>') { // found the end of the header
            currentIndex = i;
            break;
        }
        buffer.shift(); // remove the previous char
        buffer[bufferLength] = htmlDocument[i]; // insert the new char
    } // move the pointer to the end of index

    // BODY parsing
    for (let i = currentIndex; i < length; i++) {
        if (buffer[4] + buffer[5] == '<a') { // found the start of the anchor tag
            // when we found the base, start looking for the href tag
            for (const e = i + 4; i <= e; i++) { // shift 4 times, so that we don't do unnecessary checks
                buffer.shift();
                buffer[bufferLength] = htmlDocument[i];
            }
            for (; i < length; i++) {
                if (buffer.join('').indexOf('href') > -1) { // found href
                    // currentIndex = i;
                    // when we found the href, start looking for the equal sign
                    for (; i < length; i++) {
                        if (htmlDocument[i] == '=') {
                            // currentIndex += i;
                            // when we found the equal sign, start looking for the quote
                            for (; i < length; i++) {
                                if (htmlDocument[i] == '"') {
                                    i++;
                                    // when we found the quote, start checking if we have an absolute url
                                    for (let I = 0; I < 6; I++) {
                                        buffer[I] = htmlDocument[i + I];
                                    }// reload the buffer as it's now outdated
                                    const val = buffer.join('');
                                    if (val == 'https:' || val == 'http:/') { // found absolute url
                                        // redirect the url
                                        htmlDocument = htmlDocument.slice(0, i) + injects.redirEndPoint + htmlDocument.slice(i);
                                        i += 6 + injects.redirEndPoint.length;
                                        length += injects.redirEndPoint.length;
                                    } else if (val[0] + val[1] == '//') { // relative url handling 
                                        const injectionURL = injects.redirEndPoint + 'https:'; // add the protocol (service workers are always over https, so it's https)
                                        htmlDocument = htmlDocument.slice(0, i) + injectionURL + htmlDocument.slice(i);
                                        i += injectionURL.length + 6;
                                        length += injectionURL.length;
                                    }// if it's an relative url, we don't need to do anything
                                    currentIndex = i;
                                    break;
                                }
                            }
                            break;
                        }
                    }
                    break;
                } else if (buffer.join().indexOf('</a>') > -1) break; // EOT check
                buffer.shift(); // remove the previous char
                buffer[bufferLength] = htmlDocument[i]; // insert the new char
            }
        } else if (buffer.join('') == '<ifram') { // found the start of the iframe tag (not really, but it's close enough)
            // buffer reload
            i += 2; // skip the missing 'e' and space char

            for (const e = i + 3; i <= e; i++) { // shift 3 times, so that we don't do unnecessary checks
                buffer.shift();
                buffer[bufferLength] = htmlDocument[i];
            }
            for (; i < length; i++) {
                // check this, coppolit made it and I'm sure it put some bugs in there
                if (buffer.join('').indexOf('src') > -1) { // found src
                    // currentIndex = i;
                    // when we found the src, start looking for the equal sign
                    for (; i < length; i++) {
                        if (htmlDocument[i] == '=') {
                            // currentIndex += i;
                            // when we found the equal sign, start looking for the quote
                            for (; i < length; i++) {
                                if (htmlDocument[i] == '"') {
                                    i++;
                                    // when we found the quote, start checking if we have an absolute url
                                    for (let I = 0; I < 6; I++) {
                                        buffer[I] = htmlDocument[i + I];
                                    }// reload the buffer as it's now outdated
                                    const val = buffer.join('');
                                    if (val == 'https:' || val == 'http:/') { // found absolute url
                                        // redirect the url
                                        htmlDocument = htmlDocument.slice(0, i) + injects.redirEndPoint + htmlDocument.slice(i);
                                        i += 6 + injects.redirEndPoint.length;
                                        length += injects.redirEndPoint.length;
                                    } else if (val[0] + val[1] == '//') { // relative url handling 
                                        const injectionURL = injects.redirEndPoint + 'https:'; // add the protocol (service workers are always over https, so it's https)
                                        htmlDocument = htmlDocument.slice(0, i) + injectionURL + htmlDocument.slice(i);
                                        i += injectionURL.length + 6;
                                        length += injectionURL.length;
                                    }// if it's an relative url, we don't need to do anything
                                    currentIndex = i;
                                    break;
                                }
                            }
                            break;
                        }
                    }
                    break;
                } else if (buffer.join('') == '</ifra') break; // EOT (end of tag) check
                buffer.shift(); // remove the previous char
                buffer[bufferLength] = htmlDocument[i]; // insert the new char
            }
        }
        buffer.shift(); // remove the previous char
        buffer[bufferLength] = htmlDocument[i]; // insert the new char
    } // search for anchor tag (parsing the entire body)

    return htmlDocument
}

// loads the old request data to a new one
async function newReqInit(request) {
    const body = await request.blob();
     
    return {
        method: request.method,
        headers: request.headers,
        body: body.size > 0 ? body : null, 
        mode: request.mode == 'navigate' ? 'cors' : request.mode, 
        credentials: request.credentials,
        redirect: request.redirect,

    }
}

// sw signal handler
async function signalHandler(request, reqUrl, clientID) {
    //TODO
    const signalType = reqUrl.split('/')[1];
    if (signalType == 'top-level-navigate') {
        let url = reqUrl.substring(29);
        try {
            frames[clientID] = {
                CURRENT_URL: url = new URL(url),
            }
        } catch (e) {
            console.log('C_URL_ERR')
        }
        return new Response(null, { 'status': 302, 'statusText': 'SW-TLN Ready', 'headers': { 'location': CROS_SERVER_ENDPOINT + url.pathname.substring(1)} });
        // return fetchRespond(request, CROS_SERVER_ENDPOINT + url, await newReqInit(request));
    }else if(signalType == 'anchor-navigate') {
        const url = reqUrl.substring(26);
        try {
            frames[clientID] = {
                CURRENT_URL: new URL(url),
            }
        } catch (e) {
            console.log('C_URL_ERR')
        }
        return await fetchRespond(request, CROS_SERVER_ENDPOINT + url); 
    }else {
        return new Response(null, {'status': 400, 'statusText': 'Bad Request'});
    }
} 


// response constructor
async function fetchRespond(request, fetchDes, fetchInit = undefined) {
    const response = await fetch(fetchDes, fetchInit); 

    // if (request.mode == 'navigate' && request.destination == 'document') {
    //     let pureURL = response.url.replace(REGEXP_CROS_SERVER_ENDPOINT, '')
    //     try {
    //         CURRENT_URL = new URL(pureURL)
    //         // let url = new URL(pureURL);
    //         // CURRENT_URL = url.origin + '/';
    //     } catch (e) {
    //         console.log('C_URL_ERR')
    //     }
    // }
    if (response.status == 0) return response;
    const contentType = response.headers.get('content-type');
    if (contentType && typeof contentType == 'string' && contentType.includes('text/html')) {
        return new Response(await parseHTML(await response.text()), {
            status: response.status,
            statusText: response.statusText,
            headers: new Headers(response.headers),
        });
    }
    return response;
}

// request handler
/**
 * 
 * @param {Request} request 
 * @returns 
 */
async function requestHandler(request, clientID) {
    console.log(clientID, frames[clientID] ? frames[clientID] : 'frame with id: ' + clientID + ' not found');
    // console.log(request.url)
    // if the server's endpoint is detected in the url
    let CURRENT_URL = frames[clientID] ? frames[clientID].CURRENT_URL : undefined;
    if (REGEXP_CROS_SERVER_ENDPOINT.test(request.url)){
        let reqUrl = request.url.replace(REGEXP_CROS_SERVER_ENDPOINT, '')
        // if we are loading a signal url
        if (reqUrl.startsWith('sw-signal')) {
            return await signalHandler(request, reqUrl, clientID);
        } 
        // if we are asking for a local resource 
        for (const path of localResource) {
            if (path == reqUrl) {
                return await fetch(request);
            }
        }
        // we might be handling a redirect passed from the server, so just pass it to the browser to handle it
        if (!CURRENT_URL || /^https:\/\/127.0.0.1:3000\/https?:\/\//.test(request.url)) {
            return await fetchRespond(request, request)
        }
    }; // tried to use else here but it somehow messed up the return values and caused 'undefined' behaviour
    // console.log(request.url);
    const url = request.url.replace(REGEXP_CROS_SERVER_ENDPOINT, CURRENT_URL.origin + '/')
    
    return url.match(/https?:\/\//g).length > 2 
    ? await fetchRespond(request, request.url, await newReqInit(request)) 
    : await fetchRespond(request, CROS_SERVER_ENDPOINT + url, await newReqInit(request));
    
}
