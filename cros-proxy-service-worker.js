const CROS_SERVER_ENDPOINT = "http://127.0.0.1:3000/";
let current_url = "";

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
            current_url = event.data.url;
        };   
    }
     
})

async function parseHTML(htmlDocument, url) {
    const regUrl = new RegExp(RegExp.escape(url), 'guim')
    // remove any url pointing towards the proxied document's origional domain
    // and point them towards our proxy server. It's done on the client so we don't overload the server.
    return htmlDocument.replace(regUrl, CROS_SERVER_ENDPOINT)
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

// request handler
async function handler(request) {

    let response = await fetch(newReq(request));

    if (Number(response.status) >= 400) {
        response = await fetch(newReq(
            request,
            CROS_SERVER_ENDPOINT +
            request.url.replace(/^(https?:\/\/)?((127\.0\.0\.1)|(localhost)):(8080|5500)/, current_url)
        ));
    }
    return response;
}

// self.addEventListener('fetch',function (event) {
//     // console.log(event); 
//     if (event.request.url.match(/^(https?:\/\/)?((127\.0\.0\.1)|(localhost)):8080/)) {
//         console.log("DSR " + event.request.url);
//         event.respondWith(handler(event.request));
//     } else if (event.request.url.match(/^(https?:\/\/)?((127\.0\.0\.1)|(localhost)):5500/)) {
//         console.log("CSR-NCROS " + event.request.url);

        

//         event.respondWith(handler(event.request))
//     }else{
//         console.log("Not prefixed with CROS");
//         // event.url = CROS_SERVER_ENDPOINT + event.url;
//         // console.log(event.url);

        
//         event.respondWith(handler(event.request));
        
//     }
    
    
    
// });
