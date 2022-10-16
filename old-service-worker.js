



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
            
        }else if (event.data.type == 'REPORT_ORIGIN'){
            try {
                frames[client.id] = frames[client.id] || {};
                frames[client.id].CURRENT_URL = new URL(event.data.origin);
                if (frames[client.id].callback) {
                    frames[client.id].callback(event.data.origin);
                    delete frames[client.id].callback;
                }
            } catch (error) {
                console.error(error);
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

async function requestClientOrigin (clientID) {
    const client = await self.clients.get(clientID);
    if (client) {
        frames[clientID] = frames[clientID] || {};
        return await new Promise((resolve, reject) => {
            frames[clientID].callback = resolve;
            client.postMessage({
                type: 'REQUEST_ORIGIN'
            });
        })
    }else {
        return null;
    }
} 

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
    // 3s load time old
    if (htmlDocument.length < 1) return null; // if the document is empty, return null
    // htmlDocument = htmlDocument.replace(/(?<=\<head.*\>)\s*(?=\<)/, injects.dom + injects.ws);
    // htmlDocument = htmlDocument.replace(/integrity(?=\=(?="sha(256|384|512)-))/g, '__CROS_integrity')
    // return htmlDocument;
    // TODO: better search algr
    // TODO: find script tags in html and parse them

    let operations = [];

    const reg = {
        header: /(?<=\<head.*\>)\s*(?=\<)/,
        scriptStart: /\<script/,
        // Unexpected behavior on ` 'xxx'>xxx<script> ` doesn't match the first `>`. case specific, small hit rate, performance trade off not worth it
        // <0.1 ms/10 match in 200 char - 1300±100 steps  
        scriptAttr: /(?<=\s)([^\s]+?)?(?:(?:\s*?=\s*?(?:'|").*?(?:'|\"))|(?:\s*?(>)))/g,
        script: /(?<=\<script.*\>)\s*(?=\<)/
    }
    // script inject, regex time: 0.5 ms, esti tot time: 1 ms
    let scriptInjectIndex
    try {
        scriptInjectIndex = /(?<=\<head.*\>)\s*(?=\<)/.exec(htmlDocument).index
        operations.push({
            index: scriptInjectIndex,
            operation: 'insert',
            value: injects.dom + injects.ws
        });
    } catch (error) {
        console.log(error)
    }

    for (let index = 0; (index = htmlDocument.indexOf('<script', index)) != -1;) { // finds the start of a script tag
        reg.scriptAttr.lastIndex = index += 7; // sets the regex to the start of the script tag
        let isExternalJS = false; // weather to parse the contenings of the script tag

        // the second match signals stop, inverting that and passing it to for's condition acts as: `!match[1]`
        for (let match; (match = reg.scriptAttr.exec(htmlDocument)) && !match[2];) {
            index = match.index + match[0].length; // sets the index to the end of the match
            const attribute = match[1];
            if (attribute == 'src') {
                isExternalJS = true;
            } else if (attribute == 'integrity') {
                operations.push({
                    index: match.index,
                    endIndex: match.index + attribute.length,
                    operation: 'replace',
                    value: '__CROS_integrity'
                });
            }
        }
    }
    console.log(operations);
    // actually operating on the document, this will fail if operations is not ordered from the start of the doc to end
    let previous_endIndex = 0;
    let result = '';
    for (let i = 0; i < operations.length; i++) {
        const operation = operations[i];
        result += htmlDocument.slice(previous_endIndex, operation.index) + operation.value;
        switch (operation.operation) {
            case 'insert':
                previous_endIndex = operation.index;
                break;
            case 'replace':
                previous_endIndex = operation.endIndex - 1;
                break;
        }
    }
    result += htmlDocument.slice(previous_endIndex);
    return result;
}

// performance: ~130ms pre call :(
/**
 * 
 * @param {String} code 
 * @returns 
 */
let reg = /(?<=[\:\;\s\(\{\}\+\=])(window|document|this|globalThis)?(?:\.?location)(?:[\,\;\.\s\)\}\+\=])/g
async function parseJS(code, url) {
    if (code.length < 1) return null;
    // code = 'try{__CORS_SCRIPT_LOADED.push(\'' + url + '\')}catch(e){};' + code.replace(/(?<=[;\s\(\{\}\+\=\:])((window|document|this)\.)?location(?=[;\.\s\)\}\+\=])/g, injects.winLocationAssign);
    let replaceIndex = []; // {type: 1 | 0, index:m.index} 
    for (let match; match = reg.exec(code);) {
        const index = match.index;
        if (!match[1]) {
            let i = 1;
            while (/\s/.test(code[index - i])) i++ // repeat until we find a non-whitespace character
            while (code[index - i] == '(') i++; // repeat until we're out of left brakets
            if (code[index - i] == '{') { // if we hit a brace, then they are using {name:{location}}
                while (/\s/.test(code[index - i])) i++ // non whitespace again
                if (code[index - (i + 1)] == ':') {
                    replaceIndex.push({
                        type: 1, // 1 means that we'll have to replace it with location:win.location
                        sIndex: match.index,
                        eIndex: match.index + match[0].length
                    });
                    continue
                }
            }
        }
        replaceIndex.push({
            type: 0, // 0 means normal op
            sIndex: match.index,
            eIndex: match.index + match[0].length
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
    if (!response.ok || response.status == 0 ) return response;

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
 * @param {FetchEvent} event 
 * @returns 
 */
async function requestHandler(event, clientID) {
    // console.log(clientID, frames[clientID] ? frames[clientID] : 'frame with id: ' + clientID + ' not found');


    const request = event.request;

    let requestURL = new URL(request.url); 
    let CURRENT_URL = frames[clientID] ? frames[clientID].CURRENT_URL : null;
    for (let i = 0; i < localResource.length; i++) {
        if (requestURL.pathname == localResource[i]) {
            if (i == 0) {
                let res = await fetch(requestURL);
                return new Response('let __CROS_origin=`' + CURRENT_URL.origin + '`;' + await res.text())
            }
            return await fetch(requestURL);
        }
    }
    if (requestURL.pathname.startsWith('/sw-signal/')) {
        return signalHandler(request, requestURL.pathname, clientID);
    }else if (REGEXP_REDIR.test(request.url)) {
        return await fetchRespond(request, clientID , request)
    } else if (CURRENT_URL) {
        if (CURRENT_URL.origin == CROS_SERVER_ENDPOINT.origin) return await fetch(requestURL);
        const url = request.url.replace(REGEXP_CROS_SERVER_ENDPOINT, CURRENT_URL.origin + '/')

        return url.match(/https?:\/\//g).length > 2
            ? await fetchRespond(request, clientID, request.url, await reqInit(request))
            : await fetchRespond(request, clientID, CROS_SERVER_ENDPOINT + url, await reqInit(request));
    } 
    // if no CURRENT_URL
    console.warn('N_CURRENT_URL req:' + requestURL.href);
    if (request.mode != 'navigate' && await requestClientOrigin(clientID)){
        console.log('rh again')
        return await requestHandler(event, clientID); 
    } 
    else {
        console.log('dir fetch')
        return await fetch(requestURL);
    }

}