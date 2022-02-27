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

function connectionListener(clientSocket) {
    
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

    if (req.headers['sec-websocket-protocol']) {
        let protocols = req.headers['sec-websocket-protocol'].split(','); 
        // get the identification 
        let id = protocols.shift()
        req.headers['sec-websocket-protocol'] = protocols.join();
        // LCPP-[host + origin hex hash]-[unix time stamp]-[client UUID]-CROS
        const matches = id.match(/^LCPP-.*-\d*-.*-CROS$/)
        if (/^LCPP-.*-\d*-.*-CROS$/.test(id)) { 

        }else{
            abortHandshake(clientSocket, 400)
        }
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
    // proxy.on('connection', connectListener)
    // boot the server
    proxy.listen(PORT, HOST, () => {
        console.log('Running on ' + HOST + ':' + PORT + ' Engine: ' + ENGINE);
    });
})(); 