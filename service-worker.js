/**
 * Domain: https://127.0.0.1:3000/
 * Local proxy resource access path: /local/<path>
 * Browsing path: /browse/<external path to a web page>
 * Serivce worker Signaling path: /sw-signal/<type>/<data>
 * 
 * The Browsing path is the path that the user navigates to.
 * It should show the same url as the address bar if the user's browsing the url directly from the browser (no proxy)
 * All redirects should refelect on the url
 */
const CROS_SERVER_ENDPOINT = new URL(new URL (serviceWorker.scriptURL).origin)
const clientUUID = 'undefined!undefined!undefined!undefined!'; 
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let currentID = 0;
// Information about websockets, NOTE: this contains every single websocket that the service worker controls
let webSockets = {
    0: null, // 0 is the default websocket(null);
};

let log = [];
let print = (...args) => {
    args.forEach(arg => {
        log.push(arg);
    });
}
log.toString = () => {
    log.forEach(arg => {
        console.log(arg);
    });
}

// requests are handled specific to a frame(html page) so we can have muti tab support and iframes
let frames = {
    client: {
        CURRENT_URL: '', // the current url(origin/domain) of the client
        cookies: {}, // to be used in the future
        localStorage: {}, // to be used in the future
        sessionStorage: {}, // to be used in the future

    }
}

const reg_exprTerm = /;|}|\s/;

const injects = {
    ws: '<script src="/ws.js"></script>',
    dom: '<script src="/DOM.js"></script>',
    redirEndPoint: CROS_SERVER_ENDPOINT.origin + '/sw-signal/navigate/', //'sw-signal/anchor-navigate/',
    winLocationNonAssign: '__CORS_location',//'__CORS_location',
    winLocationAssign: 'win.location'
}

const localResource = [ // local resource that the client can access
    '/ws.js',
    '/DOM.js',
    '/index.js',
    '/client.html',
    '/service-worker.js'
]

// Escaping a string into a regexp, https://stackoverflow.com/a/494122
RegExp.escape = function (str) {
    return str.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
};

const REGEXP_CROS_SERVER_ENDPOINT = new RegExp(RegExp.escape(CROS_SERVER_ENDPOINT.origin + '/'));
const REGEXP_REDIR = new RegExp(RegExp.escape(CROS_SERVER_ENDPOINT.href) + 'https?:\/\/');
// Utilities END

// Listeners
self.addEventListener('install', function (event) {
    console.log('Service worker installed.');
    self.skipWaiting();
});

self.addEventListener("message", async function (event){
    if (event.data){
        const client = event.source;
        if (event.data.type == 'FETCH_DOCUMENT'){
            // console.log(event.data.url)
            const originUrl = event.data.url
            let resultUrl, status
            try {
                resultUrl = await prefetchDocument(originUrl);
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
            
        }else if (event.data.type == 'NEW_NAVIGATION'){
            frames[client.id] = {
                CURRENT_URL: new URL(event.data.url),
            }
        }else if (event.data.type == 'LOCATION_BASE'){
            client.postMessage({
                type: 'LOCATION_BASE',
                location: frames[client.id] ? frames[client.id].CURRENT_URL.href : CROS_SERVER_ENDPOINT.href
            })
        }else if (event.data.type == 'LCPP_NOTIFY'){
            const {host, origin, href} = new URL(event.data.url);
            const identifier = await generateIdentifier(host, origin);
            if (await notifyServer(identifier, frames[client.id].CURRENT_URL ,event.data.url)) {
                client.postMessage({
                    type: 'LCPP_NOTIFY',
                    status: 'ok',
                    url: event.data.url
                })
            }else{
                client.postMessage({
                    type: 'LCPP_NOTIFY',
                    status: 'failed',
                    url: event.data.url
                })
            }
        };
    }
     
})

self.addEventListener('fetch', function (event) {
    event.respondWith(requestHandler(event, event.clientId || event.resultingClientId));
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
    const req = new Request(CROS_SERVER_ENDPOINT.origin + '/LCPP', {
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
    const res = await fetch(CROS_SERVER_ENDPOINT.origin + '/' + target.href);
    let url = res.url.replace(REGEXP_CROS_SERVER_ENDPOINT, '');
    if (res.redirected) {
        console.log('prefetch redirected')
        if (url.substring(0, 8).indexOf('://') == -1) {
            // TODO: handle redirects with relatvie urls
            url = target.origin + target.pathname + url              
        }
    }
    return url
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
    htmlDocument = htmlDocument.replace(/(?<=\<head.*\>)\s*(?=\<)/, injects.dom + injects.ws);
    htmlDocument = htmlDocument.replace(/integrity(?=\=(?="sha(256|384|512)-))/g, '__CROS_integrity')
    return htmlDocument;
    // TODO: better search algr
    // TODO: find script tags in html and parse them

    const reg = {
        h1 = /\<head/, // head start 
        h2 = /\>/, // head end
    }
    let hStartIndex = htmlDocument.indexOf('<head') + 5;
    let isEsc = false; 
    while (hStartIndex++) {

        switch (htmlDocument[hStartIndex]) {
            case '/': 

            case '>': 

            case '=':
                while (/\s/.test(htmlDocument[++hStartIndex]));// repeat out whitespace


        }

        if (htmlDocument[hStartIndex] == '/') {
            while (hStartIndex++) {
                if (htmlDocument[hStartIndex] == '>') {
                    
                    
                    break
                }
            }            
            break
        }
    }
}

// performance: ~130ms pre call :(
/**
 * 
 * @param {String} code 
 * @returns 
 */
let reg = /(?<=[\:\;\s\(\{\}\+\=])(window|document|this)?(?:\.?location)(?:[\,\;\.\s\)\}\+\=])/g
async function parseJS(code, url) {
    if (code.length < 1) return null;
    // code = 'try{__CORS_SCRIPT_LOADED.push(\'' + url + '\')}catch(e){};' + code.replace(/(?<=[;\s\(\{\}\+\=\:])((window|document|this)\.)?location(?=[;\.\s\)\}\+\=])/g, injects.winLocationAssign);
    let replaceIndex = []; // {type: 1 | 0, index:m.index} 
    for (let m; m = reg.exec(code);) {
        const index = m.index;
        if (!m[1]) {
            let i = 1;
            while (/\s/.test(code[index - i])) i++ // repeat until we find a non-whitespace character
            while (code[index - i] == '(') i++; // repeat until we're out of left brakets
            if (code[index - i] == '{') { // if we hit a brace, then they are using {name:{location}}
                while (/\s/.test(code[index - i])) i++ // non whitespace again
                if (code[index - (i + 1)] == ':') {
                    replaceIndex.push({
                        type: 1, // 1 means that we'll have to replace it with location:win.location
                        sIndex: m.index,
                        eIndex: m.index + m[0].length
                    });
                    continue
                }
            }
        }
        replaceIndex.push({
            type: 0, // 0 means normal op
            sIndex: m.index,
            eIndex: m.index + m[0].length
        });
    }
    let returnVAL = 'try{__CORS_SCRIPT_LOADED.push(\'' + url + '\')}catch(e){};'
    let previous_eIndex = 0;
    for (let i = 0; i < replaceIndex.length; i++) {
        if (replaceIndex[i].type == 0) {
            returnVAL += code.slice(previous_eIndex, replaceIndex[i].sIndex) + injects.winLocationAssign
        } else {
            returnVAL += code.slice(previous_eIndex, replaceIndex[i].sIndex) + injects.winLocationNonAssign
        }
        previous_eIndex = replaceIndex[i].eIndex - 1;
    }
    returnVAL += code.slice(previous_eIndex);
    return returnVAL;
}

// loads the old request data to a new one
async function reqInit(request) {
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
    const signalType = reqUrl.split('/')[2];
    if (signalType == 'navigate') { 
        let url = reqUrl.substring(20);
        try {
            if (frames[clientID]) frames[clientID].CURRENT_URL = new URL(url);
            else frames[clientID] = { CURRENT_URL: url = new URL(url) };
        } catch (e) {
            console.log('C_URL_ERR')
        }
        return new Response(null, { 'status': 302, 'statusText': 'SW-TLN Ready', 'headers': { 'location': CROS_SERVER_ENDPOINT.origin + '/' + url.pathname.substring(1)} });
        // return fetchRespond(request, CROS_SERVER_ENDPOINT + url, await newReqInit(request));
    }else {
        return new Response(null, {'status': 400, 'statusText': 'Bad Request'});
    }
} 


// response constructor
/**
 * 
 * @param {Request} request 
 * @param {Request | URL} fetchDes 
 * @param {*} fetchInit 
 * @returns 
 */
async function fetchRespond(request, clientID, fetchDes, fetchInit = undefined) {
    
    const response = await fetch(fetchDes, fetchInit); 
    if (response.status == 0) return response;

    if (request.mode == 'navigate') {
        const url = response.url.replace(REGEXP_CROS_SERVER_ENDPOINT, '');
        try {
            if (frames[clientID]) frames[clientID].CURRENT_URL = new URL(url);
            else frames[clientID] = { CURRENT_URL: new URL(url) };
        } catch (e) {
            console.log('C_URL_ERR')
        }

    }
    const contentType = response.headers.get('content-type');
    if (contentType && typeof contentType == 'string') {
        if (contentType.includes('/javascript')) {
            return new Response(await parseJS(await response.text(), request.url), {
                status: response.status,
                statusText: response.statusText,
                headers: new Headers(response.headers),
            });
        } else if (contentType.includes('text/html')) {
            return new Response(await parseHTML(await response.text()), {
                status: response.status,
                statusText: response.statusText,
                headers: new Headers(response.headers),
            });
        }
    }
    return response;
}

// request handler
/**
 * 
 * @param {Request} request 
 * @returns 
 */
async function requestHandler(event, clientID) {
    // console.log(clientID, frames[clientID] ? frames[clientID] : 'frame with id: ' + clientID + ' not found');


    const request = event.request;

    let requestURL = new URL(request.url); 
    let CURRENT_URL = frames[clientID] ? frames[clientID].CURRENT_URL : null;
    if (requestURL.pathname.startsWith('/sw-signal/')) {
        return signalHandler(request, requestURL.pathname, clientID);
    } else if (!CURRENT_URL) {
        console.warn('N_CURRENT_URL req:' + requestURL.href);
        return await fetch(requestURL);
    } else if (REGEXP_REDIR.test(request.url)) {
        return await fetchRespond(request, clientID , request)
    } 
    for (let i = 0; i < localResource.length; i++) {
        if (requestURL.pathname == localResource[i]) {
            if (i == 0) {
                let res = await fetch(requestURL); 
                return new Response('let __CROS_origin=`' + CURRENT_URL.href + '`;' + await res.text())
            }
            return await fetch(requestURL);
        }
    }
    const url = request.url.replace(REGEXP_CROS_SERVER_ENDPOINT, CURRENT_URL.origin + '/')

    return url.match(/https?:\/\//g).length > 2
        ? await fetchRespond(request, clientID, request.url, await reqInit(request))
        : await fetchRespond(request, clientID, CROS_SERVER_ENDPOINT + url, await reqInit(request));
}
