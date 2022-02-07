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

const net = require('net')
const http = require('http')
const https = require('https')
const { URL } = require('url')
const regexp_tld = require('./lib/regexp-top-level-domain');

const HOST = process.env.HOST ?? '127.0.0.1' 
const PORT = process.env.PORT ?? 9000
const CROS_MAX_AGE = 0

function isValidHostName(hostname) {
    return !!(
        hostname && // check if we have an empty hostname
        (regexp_tld.test(hostname) || // check for url extension
        net.isIP(hostname)) // if previous failed, check for ip addrress
    );
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
    if (request.headers['access-control-request-method']) {
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
 * @param {http.IncomingMessage} req Request sent from the client 
 * @param {http.ServerResponse} res Response that's going to be sent to the client
 */
function proxyRequest(targetURL, req, res) {
    let options = {
        hostname: targetURL.hostname,
        port: targetURL.port || 80,
        path: targetURL.pathname || '/',
        mathod: 'GET',
        headers: new Object
    }
    for (let header in req.headers) {
        if (req.headers.header) {
            if (header == "host") {
                options.headers['host'] = targetURL.hostname;
            } else if (header == "referer") {
                continue
            } else {
                options.headers[header] = req.headers.header;
            }
        }
    }

    const newReq = http.request(options, (newRes) => {
        console.log(`STATUS: ${newRes.statusCode}`);
        console.log(`HEADERS: ${JSON.stringify(newRes.headers)}`);
        res.writeHead(newRes.statusCode, newRes.headers);
        newRes.setEncoding('utf8');
        newRes.on('data', (chunk) => {
            res.write(chunk)
            console.log(`BODY: ${chunk}`);
        });
        newRes.on('end', () => {
            console.log('No more data in response.');
            res.end()
        });
    });
    newReq.end();
}

// Create an HTTP tunneling proxy
const proxy = http.createServer((req, res) => {
    console.log(req.url)

    // CROS-Pre-flight request response eg: http method OPTIONS
    var cors_headers = withCORS({}, req);
    if (req.method === 'OPTIONS') {
        // Pre-flight request. Reply successfully:
        res.writeHead(200, cors_headers);
        res.end();
        return;
    }else if (req.method === 'GET' && /^\/https?:/.test(req.url)) {
        let targetURL = req.url.substring(1);
        
        if (targetURL && targetURL != '/') {
            targetURL = new URL(targetURL)
            console.log(targetURL)
            if (isValidHostName(targetURL.hostname)) {
                proxyRequest(targetURL, req, res);
                // i mean, we could use socket to fetch the response, but i really don't know how to add the CROS headers
                // const { port, hostname } = new URL(targetURL).;
                // console.log(port + hostname)
                // const serverSocket = net.connect(port || 80, hostname, () => {
                //     serverSocket.pipe(res);
                // })
            }else{
                res.writeHead(404, 'Invalid Host')
                res.end('Invalid host: ' + targetURL.hostname);
            }

        }
    }else{
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('okay');
    }
});




proxy.on('connect', (req, clientSocket, head) => {
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
});

// Now that proxy is running
proxy.listen(PORT, HOST, () => {

    // // Make a request to a tunneling proxy
    // const options = {
    //     port: PORT,
    //     host: HOST,
    //     method: 'CONNECT',
    //     path: 'www.google.com:80'
    // };

    // const req = http.request(options);
    // req.end();

    // req.on('connect', (res, socket, head) => {
    //     console.log('got connected!');

    //     // Make a request over an HTTP tunnel
    //     socket.write('GET / HTTP/1.1\r\n' +
    //         'Host: www.google.com:80\r\n' +
    //         'Connection: close\r\n' +
    //         '\r\n');
    //     socket.on('data', (chunk) => {
    //         // console.log(chunk.toString());
    //     });
    //     socket.on('end', () => {
    //         proxy.close();
    //     });
    // });
});
