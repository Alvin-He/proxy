
const CROS_SERVER_ENDPOINT = "http://127.0.0.1:8080/";
let master_url = "";

self.addEventListener('install', function (event) {
    console.log('Service worker installed.');
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("message", function (event){
    if (event.data && event.data.type == "UPDATE_MASTER_URL") {
        master_url = event.data.data;
    };    
})

// loads the old request data to a new one
function newReq(request,url) {
    return new Request(url ? url : request.url, {
        method: request.method, // probably the most important thing, don't want to have GET sent when we POST
        // headers: request.headers,
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
            request.url.replace(/^(https?:\/\/)?((127\.0\.0\.1)|(localhost)):(8080|5500)/, master_url)
        ));
    }
    return response;
}

self.addEventListener('fetch',function (event) {
    // console.log(event); 
    if (event.request.url.match(/^(https?:\/\/)?((127\.0\.0\.1)|(localhost)):8080/)) {
        console.log("DSR " + event.request.url);
        event.respondWith(handler(event.request));
    } else if (event.request.url.match(/^(https?:\/\/)?((127\.0\.0\.1)|(localhost)):5500/)) {
        console.log("CSR-NCROS " + event.request.url);

        

        event.respondWith(handler(event.request))
    }else{
        console.log("Not prefixed with CROS");
        // event.url = CROS_SERVER_ENDPOINT + event.url;
        // console.log(event.url);

        
        event.respondWith(handler(event.request));
        
    }
    
    
    
});
