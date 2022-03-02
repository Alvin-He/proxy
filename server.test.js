// test server, don't load it for production 
'use strict';

const net = require('net')
const http = require('http')
const https = require('https')
const regexp_tld = require('./lib/regexp-top-level-domain');
const fs = require('fs');
const { URL } = require('url');
const { createHash } = require('crypto');
const localResource = [ // local resource that the client can access
    'index.html',
    'client.html', 
    'cros-proxy-service-worker.js'
]

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const ENGINE = process.env.GLITCH_SHARED_INCLUDES_LEGACY_CLS ? 'GLITCH' : process.env.XDG_CONFIG_HOME ? 'REPLIT' : 'NATIVE'
const HOST = process.env.HOST || '127.0.0.1' 
const PORT = process.env.PORT || 3000
let DIR_PATH = new Promise((resolve, reject) => {fs.access('./corsidium.js',(err)=>{if(err){DIR_PATH = 'proxy/';}else{DIR_PATH='./';}resolve();});});
 
const CROS_MAX_AGE = 0

let SERVER_GLOBAL = {
    LCPP: { // hash : [client, target url, server unix time stamp]

    },
}

function localServerResponse(path, clientRes) {
    console.log("Local Resource Request: " + path); 
    fs.readFile(DIR_PATH + path, 'utf8', function(error, data) {
        if (error) {
            console.error(error);
            clientRes.writeHead(500, 'Internal Data Access ERROR');
            clientRes.end();
        } else {
            clientRes.writeHead(200, {'content-type' : 
                /\.html$/.test(path)    ? 'text/html'        : 
                /\.js$/.test(path)      ? 'text/javascript ' : 
                'text/plain'
            })
            clientRes.write(data);
            clientRes.end()
            console.log('STATUS: 200')
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

// url.resolve in WHATWG URL API
function resolve(from, to) {
    const resolvedUrl = new URL(to, new URL(from, 'resolve://'));
    if (resolvedUrl.protocol === 'resolve:') {
        // `from` is a relative URL.
        const { pathname, search, hash } = resolvedUrl;
        return pathname + search + hash;
    }
    return resolvedUrl.toString();
}


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
let totErr = 0
function proxyRequest(targetURL, clientReq, clientRes) {
    // console.log('Proxying: ' + targetURL)
    // clientReq.meta.location += targetURL.href; 
    let options = {
        hostname: targetURL.hostname,
        protocol: targetURL.protocol || 'http:',
        // default port based on protocols(http:80 https:443)
        port: targetURL.port || targetURL.protocol == 'http:' ? 80 : 443,
        path: targetURL.pathname || '/',
        method: clientReq.method,
        headers: clientReq.headers
    }
    if (options.headers.host) {
        options.headers.host = targetURL.hostname; 
        // delete options.headers.host
    }
    if (options.headers.origin) {
        options.headers.origin = targetURL.origin;
        // delete options.headers.origin
    }
    if (options.headers.referer) {
        options.headers.referer = targetURL.href; 
        // delete options.headers.referer
    }

    // console.log(options.headers)
    // http handling
    let proxyReq
    if (options.protocol == 'http:') {
        proxyReq = http.request(options, (proxyRes) => {proxyResponse(proxyReq, proxyRes, clientReq, clientRes)});
    } else { // https handling 
        proxyReq = https.request(options, (proxyRes) => {proxyResponse(proxyReq, proxyRes, clientReq, clientRes)});
    }
    proxyReq.setTimeout(6000, () => {
        console.log('TIME OUT!!!!!/t')
        totErr += 1;
        proxyReq.end(); 
    });
    proxyReq.url = targetURL;
    proxyReq.on('error', (err) => {
        console.log(err)
        clientRes.writeHead(404, 'INTERNAL ERROR')
        clientRes.end(err.toString())
    })

    // copy over all the data, if the method has no request body and it sent a request body,
    // we can have the end server worry about it. Proxies, after all, are just a data copier
    clientReq.on('data', (chunk) => {
        proxyReq.write(chunk); 
    }); 
    //end when the client ends the request
    clientReq.on('end', () => {
        proxyReq.end();
    })
}

/**
 * Response handler for the porxy
 * 
 * @param {http.IncomingMessage} proxyReq request that we initiated 
 * @param {http.ServerResponse} proxyRes response that we got from proxyReq
 * @param {http.IncomingMessage} clientReq Request sent from the client 
 * @param {http.ServerResponse} clientRes Response that's going to be sent to the client
 */
let totRedirs = 0
function proxyResponse(proxyReq, proxyRes, clientReq, clientRes) {
    // console.log(`HEADERS: ${JSON.stringify(proxyRes.headers)}`);
    const statusCode = proxyRes.statusCode;

    if (statusCode >= 300 && statusCode < 400){ //redirect response handling
        const locationHeader = resolve(proxyReq.url.href, proxyRes.headers.location)
        if (locationHeader) {
            console.log('Redirecting ' + proxyReq.url + ' ->TO-> ' + locationHeader)
            totRedirs += 1; 
            proxyReq.meta = clientReq.meta; 
            proxyReq.headers = clientReq.headers; // copy over the initial request headers
            // Remove all listeners (=reset events to initial state)
            clientReq.removeAllListeners();
            // clientReq.addListener('error')
            
            // Remove the error listener so that the ECONNRESET "error" that may occur after aborting a request does not propagate to res. 
            // Not sure if this will happen, but since request.destroy is made with the same functionality as request.abort, it's better sorry than '404'.
            // https://github.com/nodejitsu/node-http-proxy/blob/v1.11.1/lib/http-proxy/passes/web-incoming.js#L134
            proxyReq.removeAllListeners('error');
            proxyReq.once('error', () => {}); 
            proxyReq.destroy(); 
            
            proxyRequest(new URL (locationHeader), proxyReq, clientRes)
            return false
        }
        clientReq.meta += '/' + locationHeader; 
    }
    proxyRes.headers['Content-Security-Policy'] = 'default-src *';
    proxyRes.headers['X-Frame-Options'] = 'SAMEORIGIN';

    if (proxyRes.headers['Content-Security-Policy']) {
        delete proxyRes.headers['Content-Security-Policy'];
    }
    proxyRes.headers = withCORS(proxyRes.headers, clientReq); 
    

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

// Listeners
/**
 * Listens to incoming http requests, (http.server.prototype).on('request', requestListener);
 * @param {http.IncomingMessage} req Request sent from the client 
 * @param {http.ServerResponse} res Response that's going to be sent to the client
 * @returns {Boolean}
 */
function requestListener(req, res) {
    // console.log('->' + ' ' + req.method + ' ' + req.url);
    // res.on('finish', ()=> {console.log('<-' + res.statusCode + ' ' + req.method + ' ' + req.url);});
    req.meta = { // meta data, used by the proxy
        redirectCount: 0,
        location: getCurrentUrlFromCookie(req.headers.cookie),
        // baseURL : ''

    };


    // CROS-Pre-flight request response eg: http method OPTIONS
    var cors_headers = withCORS({}, req);
    if (req.method === 'OPTIONS') {
        // Pre-flight request. Reply successfully:
        res.writeHead(200, cors_headers);
        res.end();
        console.log('Preflight Request Responded: ' + req.url);
        return true;
    } else if (req.method === 'POST' && req.url === '/LCPP') {
        console.log('POST')
        let body = '';
        req.on('data', (data) => {
            body += data.toString();
        })
        req.on('end', () => {
            if (req.headers['content-type'] == 'application/json') {
                let json = JSON.parse(body);
                console.log(json)
                if (json) {
                    const url = json.url ? json.url : undefined;
                    if (url) {
                        const identifier = json.identifier ? json.identifier : undefined;
                        const identifierArray = identifier.split('-');
                        const hash = identifierArray[1];
                        if (identifier && /^LCPP-.*-\d*-.*-CROS$/.test(identifier)) {
                            if (!SERVER_GLOBAL.LCPP[hash]) {
                                const time = Number(new Date); // generate time stamp based on server time, can't always trust the client
                                const uuid = identifierArray[3];

                                SERVER_GLOBAL.LCPP[hash] = [uuid, url, time];

                                res.writeHead(201, {'Location': '/LCPP/' + identifier});
                                res.end();
                                return; 
            }   }   }   }   }// else 
            res.statusCode = 400;
            res.end();
        });
    } else {
        let targetURL

        try {
            // p-document-get overrides cookies and local resource
            if (req.headers['p-document-get']) { 
                targetURL = new URL(req.headers['p-document-get']);

            } else { 
                targetURL = req.url.substring(1);
                // local resource loading, local resource overrides cookies
                for (const path of localResource) {
                    if (path == targetURL) {
                        localServerResponse(path, res);
                        return true;
                    }
                }
                // CURRENT_URL cookie handling
                // add the current url if present and it's not the current request url
                if (req.meta.location && req.meta.location != targetURL) { 
                    targetURL = new URL(
                        (/\/$/.test(req.meta.location) ?
                            req.meta.location : req.meta.location + '/')
                        + targetURL);
                // Direct URL path proxy request handling 
                } else {
                    targetURL = new URL(targetURL);
                }
            }

            // final check before making the request 
            if (isValidHostName(targetURL.hostname)) {
                try {
                    proxyRequest(targetURL, req, res); // send the request
                    return true; 

//                  ERROR HANDLING                      //
                } catch (error) { // when proxy request failed
                    res.writeHead(404, 'Proxy Request Error')
                    res.end('Proxy Request Error:\n' + error)
                    console.log('Request ERROR: ' + error);
                    return false;
                }
            } else { // when host name is invalid 
                res.writeHead(404, 'Invalid Host')
                res.end('Invalid host: ' + targetURL.hostname);
                console.log('Invalid host: ' + targetURL.hostname);
                return false; 
            }
        } catch (error) { // this'll fire when new URL (targetURL) errored; In case we get an invalid URL
            res.writeHead(404, 'Invalid URL');
            res.end('Invalid URL ' + targetURL);
            // console.log('Invalid URL ' + targetURL);
            return false;
        }
    }
}

/**
 * 
 * @param {http.IncomingMessage} req 
 * @param {net.Socket} clientSocket 
 * @param {Buffer} head 
 */
 function upgradeListener(req, clientSocket, head) {
    console.log('upgrade');
    console.log(req.url)
    console.log(req.headers) 
    console.log(head.toString('utf8'))

    // extract the identifier from the request url
    let path = req.url.substring(1).split('/');
    const identifier = path.shift();
    const url = path.join('/'); // the target url

    // LCPP-[host + origin hex hash]-[unix time stamp]-[client UUID]-CROS
    if (/^LCPP-.*-\d*-.*-CROS$/.test(identifier)) {
        const identifierArray = identifier.split('-');
        const hash = identifierArray[1];
        const time = identifierArray[2];
        const uuid = identifierArray[3];
        if (SERVER_GLOBAL.LCPP[hash]) { // hash match 
            const requestInfo = SERVER_GLOBAL.LCPP[hash];
            const target = new URL(requestInfo[2]);
            const client = requestInfo[0];
            // a 1 minute timeout for the client to connect, otherwise the client will be disconnected
            if (client === uuid && Number(new Date()) - Number(time) <60000 ) { // id and time out 
                console.log('LCPP-OK')
                const proxyReq = net.connect(target.port || 80, target.hostname, (socket) => {
                    
                    // TODO: generate a websocket upgrade request since we already used it
                    
                    socket.write(head); 
                    socket.pipe(clientSocket); 
                    clientSocket.pipe(socket);
                });
                proxyReq.on('close', () => {
                    clientSocket.destroy();
                });
                clientSocket.on('close', () => {
                    proxyReq.destroy();
                });
        }   }   
    }else{
        abortHandshake(clientSocket, 400)
    }

    // const key = req.headers['sec-websocket-key'] ? req.headers['sec-websocket-key'] : abortHandshake(clientSocket, 400)

    // const digest = createHash('sha1').update(key + WS_GUID).digest('base64')

    // clientSocket.write(
    // 'HTTP/1.1 101 Switching Protocols\r\n' +
    // 'Upgrade: websocket\r\n' + 
    // 'Connection: Upgrade\r\n' + 
    // 'Sec-WebSocket-Accept: ' + digest + '\r\n' +
    // '\r\n');

    // clientSocket.on('data', (buffer) => {
    //     console.log(buffer.readBigUInt64LE())
    // })
}


// Async calls 
(async ()=> {
    // initiation 
    await DIR_PATH; 
    console.log(DIR_PATH);

    // Create the server
    const proxy = ENGINE == 'NATIVE' ? 
        https.createServer({
            key: fs.readFileSync(DIR_PATH + 'test/key.pem'),
            cert: fs.readFileSync(DIR_PATH + 'test/cert.pem')
        }) 
        : http.createServer() // we use http on on non Natvie engines because it's already https by default
        
    // add listeners 
    proxy.on('request', requestListener);
    proxy.on('upgrade', upgradeListener); 

    // boot the server
    proxy.listen(PORT, HOST, () => {
        console.log('Running on ' + HOST + ':' + PORT + ' Engine: ' + ENGINE);

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

