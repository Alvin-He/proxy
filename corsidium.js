// The birthplace of Corsidium, if I can ever finish it
// v0.0.2
/* TODO: 
    DONE Set up the proxy, 
    DONE support basic redirect & removeal of CORS headers, 
    DONE web socket connections?!, 

    DONE new tab redirects, (there're definely a few bugs, but idk where they are)
    cookies,
    local storage, // don't know if we can do muti local storage, we're gonna hit the quota instantly  
    NOMOD session storage, // doesn't look like we need to do anything with this, the browser handle it pretty well 
    session dataBase(IndexedDB)??,
    web SQL??,
    cache storage???

    as of v0.0.2, the load speed of https://discord.com/app is about 5 seconds 

    Things that gotta be supported:
    Gmail, Discord, Reddit, IG, Twitch??

    if possible, get it near the speed of Palladium: https://github.com/LudicrousDevelopment/Palladium.git
*/

'use strict';

const net = require('net');
const tls = require('tls');
const http = require('http');
const https = require('https');
const regexp_tld = require('./lib/regexp-top-level-domain');
const fs = require('fs');
const { URL } = require('url');
const { createHash } = require('crypto');
const localResource = [ // local resource that the client can access
    'ws.js',
    'DOM.js',
    'index.js',
    'client.html', 
    'service-worker.js'
]

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const HTTPS_PASSTHROUGH = !!(process.env.GLITCH_SHARED_INCLUDES_LEGACY_CLS || process.env.XDG_CONFIG_HOME || process.env.ISHEROKU || false)
const HOST = process.env.HOST || '127.0.0.1' 
const PORT = process.env.PORT || 3000
const DOMAIN = process.env.DOMAIN || 'https://127.0.0.1:3000/'
const DIR_PATH = './' //process.env.DIR_PATH ? process.env.DIR_PATH : (ENGINE == 'NATIVE' ? './' : './');
const SSL_KEY_LOG_FILE = process.env.SSLKEYLOGFILE ? fs.createWriteStream(process.env.SSLKEYLOGFILE, { flags: 'a' }) : null;
if (SSL_KEY_LOG_FILE) { process.on('exit', () => SSL_KEY_LOG_FILE.end()); } // close the log file

const CROS_MAX_AGE = 0

let SERVER_GLOBAL = {//  0   ,     1     ,      2    ,            3 
    LCPP: { // hash : [client, origin url, target url, server unix time stamp]

    },
}

function localServerResponse(path, clientRes) {
    // console.log("Local Resource Request: " + path); 
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
            // console.log('STATUS: 200')
        }
    });
}

function isValidHostName(hostname) {
    return true;
    return !!(
        hostname && // check if we have an empty hostname
        (regexp_tld.test(hostname) || // check for url extension
        net.isIP(hostname)) // if previous failed, check for ip addrress
    );
}

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
function proxyRequest(targetURL, clientReq, clientRes) {
    // console.log('Proxying: ' + targetURL)
    // clientReq.meta.location += targetURL.href; 
    let options = {
        hostname: targetURL.hostname,
        protocol: targetURL.protocol || 'http:',
        // default port based on protocols(http:80 https:443)
        port: targetURL.port || targetURL.protocol == 'http:' ? 80 : 443,
        path: (targetURL.pathname || '/') + (targetURL.search || ''),
        method: clientReq.method,
        headers: {}
    }
    const oldHeaders = clientReq.rawHeaders
    let newHeaders = options.headers; 
    oldHeaders.forEach((value, index) => {
        if (index % 2 == 0) {
            if (/host/i.test(value)) {
                newHeaders[value] = targetURL.hostname;
            } else if (/origin/i.test(value)) {
                newHeaders[value] = targetURL.origin; // might need to have the client report it manually
            } else if (/referer/i.test(value)) {
                newHeaders[value] = targetURL.href;
            }else{
                newHeaders[value] = oldHeaders[index + 1]
            }
        }
    });

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
        console.log(chunk.toString())
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
function proxyResponse(proxyReq, proxyRes, clientReq, clientRes) {
    // console.log(`HEADERS: ${JSON.stringify(proxyRes.headers)}`);
    const statusCode = proxyRes.statusCode;

    if (statusCode > 300 && statusCode < 400){ //redirect response handling, skipping 300 since it requires user agent(browser)
        let locationHeader = proxyRes.headers.location //resolve(proxyReq.url.href, proxyRes.headers.location)
        if (locationHeader && /^https?:\/\//.test(locationHeader)) {
            locationHeader = DOMAIN + locationHeader;
            console.log('Redirecting to: ' + locationHeader)
            console.log(proxyReq.url.href)
            proxyRes.headers.location = locationHeader;
        }
    } else {
        proxyRes.headers['x-frame-options'] = 'SAMEORIGIN';
        if (proxyRes.headers['content-security-policy']){
            delete proxyRes.headers['content-security-policy'];
        }
        proxyRes.headers = withCORS(proxyRes.headers, clientReq); 
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
        console.log('LCPP Registration')
        let body = '';
        req.on('data', (data) => {
            body += data.toString();
        })
        req.on('end', () => {
            if (req.headers['content-type'] == 'application/json') {
                let json = JSON.parse(body);
                console.log(json)
                if (json) {
                    const target = json.target ? json.target : undefined;
                    const origin = json.origin ? json.origin : undefined;
                    if (origin && target) {
                        const identifier = json.identifier ? json.identifier : undefined;
                        if (identifier && /^LCPP-.*-\d*-.*-CROS$/.test(identifier)) {
                            const identifierArray = identifier.split('-');
                            const hash = identifierArray[1];
                            if (!SERVER_GLOBAL.LCPP[hash]) {
                                const time = Number(new Date); // generate time stamp based on server time, can't always trust the client
                                const uuid = identifierArray[3];

                                SERVER_GLOBAL.LCPP[hash.toString()] = [uuid, origin, target, time];

                                res.writeHead(201, {'Location': '/LCPP/' + identifier});
                                res.end();
                                console.log('LCPP Registration Successful: ' + identifier);
                                return true; 
            }   }   }   }   }// else 
            res.statusCode = 400;
            res.end();
        });
    } else {
        let targetURL

        try {
            targetURL = req.url.substring(1);
            console.log('target: ' + targetURL);
            targetURL = new URL(targetURL);

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
        } catch (error) { // this'll fire when new URL (targetURL) errored; In case we get an invalid URL or local 
            // local resource loading
            if (targetURL == '') {
                localServerResponse('client.html', res);
                return true;
            }
            console.log(targetURL.substring(6))
            for (const path of localResource) {
                if (path == targetURL) {
                    localServerResponse(targetURL, res);
                    return true;
                }
            }
            res.writeHead(404, 'Invalid URL');
            res.end('Invalid URL ' + targetURL);
            console.log('Invalid URL ' + targetURL);
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
    // console.log('upgrade');
    console.log(req.url)
    // extract the identifier from the request url
    if (req.url.substring(0, 4) == '/ws/') {
        try {
            const target = new URL(req.url.substring(4));
            const origin = new URl(target.searchParams.get('__CROS_LCPP_WS_ORIGIN'));  
            target.searchParams.delete('__CROS_LCPP_WS_ORIGIN')
            const port = target.port || target.protocol == 'wss:' ? 443 : 80;
            
            const proxySocket = tls.connect({
                isServer: false,
                host: target.hostname,
                port: port,
                // rejectUnauthorized: false,
                servername: target.hostname,
            }, () => {
                //generate a websocket upgrade request since we already used it
                proxySocket.write('GET ' + target.href + ' HTTP/1.1\r\n'); // let the server know we are upgrading
                req.rawHeaders.forEach((value, index) => {
                    if (index % 2 == 0) {
                        if (/host/i.test(value)) {
                            proxySocket.write(value + ': ' + target.hostname + '\r\n');
                        } else if (/origin/i.test(value)) {
                            proxySocket.write(value + ': ' + origin + '\r\n');
                        } else if (/cookie/i.test(value)) {
                            ; // do nothing 
                        } else {
                            proxySocket.write(value + ': ' + req.rawHeaders[index + 1] + '\r\n');
                        }
                    }
                });
                proxySocket.write('\r\n'); // end of headers
                console.log('request sent');

                // socket.write(head); // write the request body from the client 
                proxySocket.pipe(clientSocket);
                clientSocket.pipe(proxySocket);
            });
            proxySocket.on('data', (data) => { console.log('Target Incoming: ', data.toString()) });
            clientSocket.on('data', (data) => { console.log('client Incoming: ', data.toString()) });
            if (SSL_KEY_LOG_FILE) { proxySocket.on('keylog', (line) => SSL_KEY_LOG_FILE.write(line)); }

            proxySocket.on('error', (error) => { console.log('Proxy Socket Error: ' + error) });
            clientSocket.on('error', (error) => { console.log('Client Socket Error: ' + error) });
            proxySocket.on('close', () => { clientSocket.destroy(); });
            clientSocket.on('close', () => { proxySocket.destroy(); });
            return true;
        } catch (error) {
            console.log(error)
        }
    }
    console.log('upgrade failed');
    clientSocket.destroy();
    return false;
}

// Async calls 
(async ()=> {
    // initiation 
    await DIR_PATH; 
    console.log(DIR_PATH);

    // Create the server
    const proxy = HTTPS_PASSTHROUGH ? 
        http.createServer():// we use http on on non Natvie engines because it's already https by default
        https.createServer({
            key: fs.readFileSync( DIR_PATH + 'etc/key.pem' ),
            cert: fs.readFileSync(DIR_PATH + 'etc/cert.pem'),
        }); 
        
    // add listeners 
    proxy.on('request', requestListener);
    proxy.on('upgrade', upgradeListener); 

    // boot the server
    proxy.listen(PORT, HOST, () => {
        console.log('Running on ' + HOST + ':' + PORT + ' Https Passthrough: ' + HTTPS_PASSTHROUGH);

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

