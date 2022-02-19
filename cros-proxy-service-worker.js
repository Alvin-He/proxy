const CROS_SERVER_ENDPOINT = "https://127.0.0.1:3000/"; //'https://cros-proxy-testing.glitch.me'
let CURRENT_URL = "";

// Escaping a string into a regexp, https://stackoverflow.com/a/494122
RegExp.escape = function (str) {
    return str.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
};

self.addEventListener('install', function (event) {
    console.log('Service worker installed.');
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("message", async function (event){
    if (event.data){
        if (event.data.type == 'FETCH_DOCUMENT'){
            console.log(event.data.url)
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
            CURRENT_URL = event.data.url;
        };   
    }
     
})

/**
 * 
 * @param {String} htmlDocument 
 * @param {String} url 
 * @returns 
 */
async function parseHTML(htmlDocument, url) {
    let regUrl = RegExp.escape(url).split(/https?:\/\//)[1] // generates the escaped domain name
        regUrl = new RegExp(regUrl, 'guim') // generates the actual regExp
    
    // // add async to script tags so we don't get blocked for using document.write
    // for (scriptTag of htmlDocument.matchAll(/<script.*?/g)) {
    //     console.log(htmlDocument.slice(0, scriptTag.index + 7) + ' async ' + htmlDocument.slice(scriptTag.index + 7))
    // }

    // remove any url pointing towards the proxied document's origional domain
    // and point them towards our proxy server. It's done on the client so we don't overload the server.
    htmlDocument = htmlDocument.replace(
        regUrl, 
        // the domain name of our endpoint
        CROS_SERVER_ENDPOINT.substring(0, CROS_SERVER_ENDPOINT.length - 1).split(/https?:\/\//)[1])

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
    return new Request(url ? url : request.url, {
        method: request.method, // probably the most important thing, don't want to have GET sent when we POST
        // headers: {},
        body: request.body ? request.body : null,
        // mode: request.mode == 'navigate' ?  : request.mode,
        // credentials: request.credentials,
        cache: request.cache,
        redirect: request.redirect,
        referrer: CROS_SERVER_ENDPOINT
    });
}

const localResource = [ // local resource that the client can access
    'index.html',
    'client.html',
    'cros-proxy-service-worker.js'
]
// request handler
async function handler(request) {

    let reqUrl = request.url.replace(/^(https?:\/\/)?((127\.0\.0\.1)|(localhost)):3000\//, '')
    for (const path of localResource) {
        if (path == reqUrl) {
            return await fetch(request)
        }
    }

    const url = request.url.replace(/^(https?:\/\/)?((127\.0\.0\.1)|(localhost)):3000/, CURRENT_URL)
    console.log(url)
    return await fetch(newReq(
        request,
        CROS_SERVER_ENDPOINT +
        url
    ));
}

self.addEventListener('fetch',function (event) {
    console.log(event.request.method + ' ' + event.request.url)
    event.respondWith(handler(event.request))
    // // console.log(event); 
    // if (event.request.url.match(/^(https?:\/\/)?((127\.0\.0\.1)|(localhost)):8080/)) {
    //     console.log("DSR " + event.request.url);
    //     event.respondWith(handler(event.request));
    // } else if (event.request.url.match(/^(https?:\/\/)?((127\.0\.0\.1)|(localhost)):5500/)) {
    //     console.log("CSR-NCROS " + event.request.url);

        

    //     event.respondWith(handler(event.request))
    // }else{
    //     console.log("Not prefixed with CROS");
    //     // event.url = CROS_SERVER_ENDPOINT + event.url;
    //     // console.log(event.url);

        
    //     event.respondWith(handler(event.request));
        
    // }
    
    
    
});
