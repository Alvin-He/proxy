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

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

const ENGINE = process.env.GLITCH_SHARED_INCLUDES_LEGACY_CLS ? 'GLITCH' : process.env.XDG_CONFIG_HOME ? 'REPLIT' : 'NATIVE'
const HOST = process.env.HOST || '127.0.0.1'
const PORT = process.env.PORT || 5000
let DIR_PATH = new Promise((resolve, reject) => { fs.access('./corsidium.js', (err) => { if (err) { DIR_PATH = 'proxy/'; } else { DIR_PATH = './'; } resolve(); }); });

let SERVER_GLOBAL = {
    LCPP: { // hash : [client, target url, server unix time stamp]

    },
}

function abortHandshake(socket, code, message, headers) {
    if (socket.writable) {
        message = message || http.STATUS_CODES[code];
        headers = {
            Connection: 'close',
            'Content-Type': 'text/html',
            'Content-Length': Buffer.byteLength(message),
            ...headers
        };

        socket.write(
            `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r\n` +
            Object.keys(headers)
                .map((h) => `${h}: ${headers[h]}`)
                .join('\r\n') +
            '\r\n\r\n' +
            message
        );
    }

    socket.removeListener('error', socketOnError);
    socket.destroy();
}

function connectListener(req, clientSocket, head) {
    // Connect to an origin server
    console.log('Connect!')
    // const { port, hostname } = new URL(`http://${req.url}`);
    // const serverSocket = net.connect(port || 80, hostname, () => {
    //     clientSocket.write('HTTP/1.1 200 Connection Established\r\n' +
    //         'Proxy-agent: Node.js-Proxy\r\n' +
    //         '\r\n');
    //     console.log(head);
    //     serverSocket.write(head);
    //     serverSocket.pipe(clientSocket);
    //     clientSocket.pipe(serverSocket);
    // });
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
            const target = requestInfo[2];
            const client = requestInfo[0];
            // a 1 minute timeout for the client to connect, otherwise the client will be disconnected
            if (client === uuid && Number(new Date()) - Number(time) <60000 ) { // id and time out 
                console.log('LCPP-OK')
            }
    }else{
        abortHandshake(clientSocket, 400)
    }

    const key = req.headers['sec-websocket-key'] ? req.headers['sec-websocket-key'] : abortHandshake(clientSocket, 400)

    const digest = createHash('sha1').update(key + WS_GUID).digest('base64')

    clientSocket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' + 
    'Connection: Upgrade\r\n' + 
    'Sec-WebSocket-Accept: ' + digest + '\r\n' +
    '\r\n');

    clientSocket.on('data', (buffer) => {
        console.log(buffer.readBigUInt64LE())
    })
}

/**
 * Listens to incoming http requests, (http.server.prototype).on('request', requestListener);
 * @param {http.IncomingMessage} req Request sent from the client 
 * @param {http.ServerResponse} res Response that's going to be sent to the client
 * @returns {Boolean}
 */
function requestListener(req, res) {
    // console.log('->' + ' ' + req.method + ' ' + req.url);
    // res.on('finish', ()=> {console.log('<-' + res.statusCode + ' ' + req.method + ' ' + req.url);});


    if (req.method === 'POST' && req.url === '/LCPP') {
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
    }
}

(async () => {
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
    // proxy.on('connect', connectListener);
    proxy.on('upgrade', upgradeListener); 
    proxy.on('request', requestListener);
    // proxy.on('connection', connectListener)
    // boot the server
    proxy.listen(PORT, HOST, () => {
        console.log('Running on ' + HOST + ':' + PORT + ' Engine: ' + ENGINE);
    });
})(); 