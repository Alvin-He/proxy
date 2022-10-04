
/**
 * 
 * /<http|https>://<URL> base browsing directory
 * 
 * 
 */


const CROS_SERVER_ENDPOINT = new URL(new URL (serviceWorker.scriptURL).origin)
const clientUUID = 'undefined!undefined!undefined!undefined!'; 
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
    redirEndPoint: CROS_SERVER_ENDPOINT.origin + '/', //'sw-signal/anchor-navigate/',
    winLocationNonAssign: '__CORS_location',//'__CORS_location',
    winLocationAssign: 'win.location'
}

const localResource = [ // local resource that the client can access
    '/',
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
            let resultUrl, status, data
            try {
                [resultUrl, data] = await prefetchDocument(originUrl);
                status = 'ok';
            } catch (error) {
                // response = error
                status = 'error'
            }
            event.source.postMessage({
                type : event.data.type,  
                originUrl: originUrl,
                resultUrl: resultUrl,
                data: data,
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
        }
    }
     
})

self.addEventListener('fetch', function (event) {
    event.respondWith(requestHandler(event));
});

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
    return [url, await res.text()]
}

// convert ./<http|https>://<URI>
// to a normal url: <proto>://<URI>
function get_target_URL(url) {
    let original = new URL(url);
    let target = new URL(original.pathname.slice(1));
    return target;
}


/**
 * Current preformance is: 4.5 ms per call when parsing https://discord.com
 * looking into DOMParser for a possible better solution, but this works and it's as fast as it needs to be
 * 
 * @param {String} htmlDocument 
 * @param {String} url 
 * @returns 
 */
async function oldparseHTML(htmlDocument) {
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


async function parseHTML(htmlDocument) {
    let document = new DOMParser().parseFromString(htmlDocument, 'text/html');
    console.log(document)
}
// performance: ~130ms pre call :(
/**
 * 
 * @param {String} code 
 * @returns 
 */
let reg = /(?<=[\:\;\s\(\)\{\}\[\+\=\|\&\>\<\?\!])(?:(window|document|this|globalThis)\.)?(?:location)(?:[\,\;\.\s\)\}\]\+\<\>\|\&\?\=])/g

// we are ignoring computed member access since it's litertly impossible to track
// ignoring short hand if (condition ? true : false) because breaks way too many things 
async function parseJS(code, url) {
    if (code.length < 1) return null;


    let replaceIndex = []; // {type: 1 | 0, index:m.index} 
    for (let match; match = reg.exec(code);) {
        const sindex = match.index;
        const eindex = sindex + match[0].length;

        let i = -1;
        while (/\s/.test(code[eindex + i])) i++ // repeat out whitespace chars 
        while (code[eindex + i] == ')') i++; // repeat out right parens
        while (/\s/.test(code[eindex + i])) i++ // space again 
        if (code[eindex + i] == '=') {
            replaceIndex.push({
                type: 1,
                sIndex: sindex,
                eIndex: eindex
            });
            continue;
        }
        replaceIndex.push({
            type: 0,
            sIndex: sindex,
            eIndex: eindex
        });
    }
    let returnVAL = 'try{__CORS_SCRIPT_LOADED.push(\'' + url + '\')}catch(e){};'
    let previous_eIndex = 0;
    for (let i = 0; i < replaceIndex.length; i++) {
        if (replaceIndex[i].type == 0) {
            returnVAL += code.slice(previous_eIndex, replaceIndex[i].sIndex) + injects.winLocationNonAssign
        } else {
            returnVAL += code.slice(previous_eIndex, replaceIndex[i].sIndex) + injects.winLocationAssign
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
 * @param {Request} event 
 * @param {Request | URL} fetchDes 
 * @param {*} fetchInit 
 * @returns 
 */
// async function fetchRespond(request, clientID, fetchDes, fetchInit = undefined) {
async function fetchRespond(event, fetchDes, fetchInit = undefined) {
    
    const clientID = event.clientId || event.resultingClientId

    const response = await fetch(fetchDes, fetchInit); 
    if (!response.ok || response.status == 0 ) return response;

    // if (request.mode == 'navigate') {
    //     const url = response.url.replace(REGEXP_CROS_SERVER_ENDPOINT, '');
    //     try {
    //         if (frames[clientID]) frames[clientID].CURRENT_URL = new URL(url);
    //         else frames[clientID] = { CURRENT_URL: new URL(url) };
    //     } catch (e) {
    //         console.log('C_URL_ERR')
    //     }

    // }
    const contentType = response.headers.get('content-type');
    if (contentType && typeof contentType == 'string') {
        if (contentType.includes('/javascript')) {


            const client = await self.clients.get(clientID);

            console.log("service worker: postMessage");
            client.postMessage({
                type: 'SCRIPT_LOAD',
                file: event.request.url,
                code: await response.text()
            });

            return new Response('exec(scriptCache[`' + event.request.url + '`]); console.log("executed: " + `'+ event.request.url +'`);', {
                status: response.status,
                statusText: response.statusText,
                headers: new Headers(response.headers),
            });
            // return new Response(await parseJS(await response.text(), event.request.url), {
            //     status: response.status,
            //     statusText: response.statusText,
            //     headers: new Headers(response.headers),
            // });
        } else if (contentType.includes('text/html')) {
            return new Response(await oldparseHTML(await response.text()), {
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
async function requestHandler(event) {
    // console.log(clientID, frames[clientID] ? frames[clientID] : 'frame with id: ' + clientID + ' not found');

    const clientID = event.clientId || event.resultingClientId
    let request = event.request;
    let requestURL = new URL(request.url); 

    for (let i = 0; i < localResource.length; i++) {
        if (requestURL.pathname == localResource[i]) {
            return await fetch(requestURL);
        }
    }

    if (request.destination == 'navigate') {
        let targetURL = new URL(requestURL.pathname.slice(1));
        console.log('navigate request: ' + targetURL.href);
        return await fetchRespond(event, targetURL, await reqInit(request));
    }else{

        // CROS requests
        if (requestURL.origin != CROS_SERVER_ENDPOINT.origin) {
            console.log('CROS REQUEST');
            return await fetchRespond(event, CROS_SERVER_ENDPOINT + requestURL, await reqInit(request));
        }
        if (requestURL.pathname.startsWith('/http')) {
            return await fetchRespond(event, requestURL, await reqInit(request));
        }
        // direct requests to home server
        const clientURL = new URL((await self.clients.get(clientID)).url).pathname.slice(1);
        if (!clientURL) {
            console.warn('client with id: ' + clientID + ' not found');
        }
        const target = new URL(requestURL.pathname, clientURL);
        return await fetchRespond(event, CROS_SERVER_ENDPOINT + target, await reqInit(request));

    }
}
