// The birthplace of Corsidium, if I can ever finish it

/* TODO: 
    Set up the proxy, 
    support basic redirect & removeal of CORS headers, 
    cookies???,
    web socket connections?! 

    Things that gotta be supported:
    Gmail, Discord, Reddit, IG, Twitch??

    if possible, get it near the speed of Palladium: https://github.com/LudicrousDevelopment/Palladium.git
*/
'use strict';

const net = require('net')
const http = require('http')
const https = require('https')
const { URL } = require('url')
const regexp_tld = require('./lib/regexp-top-level-domain');
const fs = require('fs');
const path = require('path');
const localResource = [ // local resource that the client can access
    'index.html',
    'cros-proxy-service-worker.js'
]

const HOST = process.env.HOST || '127.0.0.1' 
const PORT = process.env.PORT || 3000
let DIR_PATH = new Promise((resolve, reject) => {fs.access('./corsidium.js',(err)=>{if(err){DIR_PATH = 'proxy/';}else{DIR_PATH='./';}resolve();});});
 
const CROS_MAX_AGE = 0

function localServerResponse(path, clientRes) {
    console.log("Local Resource Request: " + path); 
    fs.readFile(DIR_PATH + path, 'utf8', function(error, data) {
        if (error) {
            console.error(error);
            clientRes.writeHead(500, 'Internal Data Access ERROR');
            clientRes.end();
        } else {
            clientRes.writeHead(200, {'content-type' : /\.html$/.test(path) ? 'text/html' : 'text/plain'})
            clientRes.write(data);
            clientRes.end()
        }
    });
}

function isValidHostName(hostname) {
    return !!(
        hostname && // check if we have an empty hostname
        (regexp_tld.test(hostname) || // check for url extension
        net.isIP(hostname)) // if previous failed, check for ip addrress
    );
}

function getCurrentUrlFromCookie (cookieString) {
    if (cookieString) {
        for (const cookie of cookieString.split(';')){
            const parts = cookie.match(/(.*)?=(.*)?/)
            if (parts && parts[1].trim() == "CURRENT_URL") {
                console.log('Current Url: ' + parts[2]);
                return parts[2].trim()
            }
        };
    }
};

/**
 * cors-anywhere 0.4.4 COMMIT 70aaa22 /lib/cors-anywhere.js L47-L71  
 * Adds CORS headers to the response headers.
 *
 * @param headers {object} Response headers
 * @param request {ServerRequest}
 */
function withCORS(headers, request) {
    headers['access-control-allow-origin'] = '*';
    var corsMaxAge = CROS_MAX_AGE;
    if (request.method === 'OPTIONS' && corsMaxAge) {
        headers['access-control-max-age'] = corsMaxAge;
    }
    // console.log('Headers: ') 
    // console.log(request)
    if (request.headers['access-control-request-method']){
        headers['access-control-allow-methods'] = request.headers['access-control-request-method'];
        delete request.headers['access-control-request-method'];
    }
    if (request.headers['access-control-request-headers']) {
        headers['access-control-allow-headers'] = request.headers['access-control-request-headers'];
        delete request.headers['access-control-request-headers'];
    }

    headers['access-control-expose-headers'] = Object.keys(headers).join(',');

    return headers;
}

/**
 * Sends a proxy request
 * 
 * @param {URL} targetURL URL to proxy
 * @param {http.IncomingMessage} clientReq Request sent from the client 
 * @param {http.ServerResponse} clientRes Response that's going to be sent to the client
 */
function proxyRequest(targetURL, clientReq, clientRes) {

    console.log('Proxying: ' + targetURL)
    // clientReq.meta.location += targetURL.href; 
    let options = {
        hostname: targetURL.hostname,
        protocol: targetURL.protocol || 'http:',
        // default port based on protocols(http:80 https:443)
        port: targetURL.port || targetURL.protocol == 'http:' ? 80 : 443,
        path: targetURL.pathname || '/',
        method: 'GET',
        headers: new Object
    }
    for (let header in clientReq.headers) {
        if (clientReq.headers.header) {
            if (header == "host") {
                options.headers['host'] = targetURL.hostname;
            } else if (header == "referer") {
                continue
            } else {
                options.headers[header] = clientReq.headers.header;
            }
        }   
    }

    // http handling
    let proxyReq
    if (options.protocol == 'http:') {
        proxyReq = http.request(options, (res) => {proxyResponse(proxyReq, res, clientReq, clientRes)});
    } else { // https handling 
        proxyReq = https.request(options, (res => {proxyResponse(proxyReq, res, clientReq, clientRes)}));
    }
    proxyReq.end();
}

function proxyResponse(proxyReq, proxyRes, clientReq, clientRes) {
    console.log(`STATUS: ${proxyRes.statusCode}`);
    // console.log(`HEADERS: ${JSON.stringify(proxyRes.headers)}`);

    const statusCode = proxyRes.statusCode;

    if (statusCode > 300 && statusCode < 308){ // 301, 302, 303 redirect response handling
        const locationHeader = proxyRes.headers.location
        if (locationHeader) {

            proxyReq.meta = clientReq.meta; 
            proxyReq.headers = clientReq.headers; // copy over the initial request headers

            // Remove all listeners (=reset events to initial state)
            clientReq.removeAllListeners();

            // Remove the error listener so that the ECONNRESET "error" that may occur after aborting a request does not propagate to res. 
            // Not sure if this will happen, but since request.destroy is made with the same functionality as request.abort, it's better sorry than 'dead'.
            // https://github.com/nodejitsu/node-http-proxy/blob/v1.11.1/lib/http-proxy/passes/web-incoming.js#L134
            proxyReq.removeAllListeners('error');
            proxyReq.once('error', () => {}); 
            proxyReq.destroy(); 

            proxyRequest(new URL (locationHeader), proxyReq, clientRes)
        }
        // clientReq.meta += '/' + locationHeader; 
    } else{

        proxyRes.headers = withCORS(proxyRes.headers, clientReq); 
        proxyRes.headers['Content-Security-Policy'] = 'default-src *';
        proxyRes.headers['X-Frame-Options'] = 'SAMEORIGIN';

        if (proxyRes.headers['Content-Security-Policy']) {
            delete proxyRes.headers['Content-Security-Policy'];
        }
        
        clientRes.writeHead(statusCode, proxyRes.headers);
        proxyRes.on('data', (chunk) => {
            clientRes.write(chunk)
            // console.log(`BODY: ${chunk}`);
        });
        proxyRes.on('end', () => {
            // console.log('No more data in response.');
            clientRes.end()
        });
    }
}

// Listeners 
function requestListener(req, res) {
    req.meta = { // meta data, used by the proxy
        redirectCount: 0,
        location: getCurrentUrlFromCookie(req.headers.cookie),
        // baseURL : (
        //     (   (req.connection.encrypted || /^\s*https/.test(req.headers['x-forwarded-proto'])) ? 
        //     'https' : 'http') + '//' + req.headers.host
        // ), 

    };


    // CROS-Pre-flight request response eg: http method OPTIONS
    var cors_headers = withCORS({}, req);
    if (req.method === 'OPTIONS') {
        // Pre-flight request. Reply successfully:
        res.writeHead(200, cors_headers);
        res.end();
        return;
    } else if (req.method === 'GET') { //&& /^\/https?:/.test(req.url)
        let targetURL = req.url.substring(1);
        console.log(targetURL);
        for (path of localResource) {
            if (path == targetURL) {
                localServerResponse(path, res);
                return true; 
            }
        }
        try {
            if (req.meta.location) { // add the current url if present 
                targetURL = new URL(
                    (/\/$/.test(req.meta.location) ?
                        req.meta.location : req.meta.location + '/')
                    + targetURL);
            } else {
                targetURL = new URL(targetURL);
            }


            if (isValidHostName(targetURL.hostname)) {
                try {
                    proxyRequest(targetURL, req, res);
                    return true; 
                } catch (error) {
                    res.writeHead(404, 'Proxy Request Error')
                    res.end('Proxy Request Error:\n' + error)
                    console.log('Request ERROR: ' + error);
                    return false;
                }
            } else {
                res.writeHead(404, 'Invalid Host')
                res.end('Invalid host: ' + targetURL.hostname);
                console.log('Invalid host: ' + targetURL.hostname);
                return false; 
            }
        } catch (error) { // this'll fire when targetURL = new URL (targetURL) errored; In case we get an invalid URL
            res.writeHead(404, 'Invalid URL');
            res.end('Invalid URL ' + targetURL);
            console.log('Invalid URL ' + targetURL);
            return false;
        }
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('okay');
        return false;
    }
}

function connectListener(req, clientSocket, head) {
    // Connect to an origin server
    const { port, hostname } = new URL(`http://${req.url}`);
    const serverSocket = net.connect(port || 80, hostname, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n' +
            'Proxy-agent: Node.js-Proxy\r\n' +
            '\r\n');
        console.log(head);
        serverSocket.write(head);
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
    });
}

// Async calls 
(async ()=> {
    // initiation 
    await DIR_PATH; 
    console.log(DIR_PATH);

    // Create an HTTP tunneling proxy
    const proxy = https.createServer({
        key: fs.readFileSync(DIR_PATH + 'test/key.pem'),
        cert: fs.readFileSync(DIR_PATH + 'test/cert.pem')
    });

    // add listeners 
    proxy.on('request', requestListener);
    proxy.on('connect', connectListener);

    // boot the server
    proxy.listen(PORT, HOST, () => {
        console.log('Running on ' + HOST + ':' + PORT);

        /* TEST: 
        function test(url, noDATA) {
            const http = require('http');
            const req = http.request(url ? 'http://127.0.0.1:3000/' + url : 'http://127.0.0.1:3000', (res) => {
                console.log(`STATUS: ${res.statusCode}`); 
                console.log(`HEADERS: `, res.headers)
                if (!noDATA) {
                    res.on('data', (chunk) => {
                        console.log(`DATA: ${chunk}`)
                    })
                } 
                res.on('end', () => {
                    console.log("<!RESPONSE END!>")
                })
            })
            req.setHeader('Cookie', 'CURRENT_URL='+url)
            req.end(); 
        }
        ^--TEST*/

    });
})(); 

