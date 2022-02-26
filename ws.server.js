'use strict';

const net = require('net')
const http = require('http')
const https = require('https')
const regexp_tld = require('./lib/regexp-top-level-domain');
const fs = require('fs');
const { URL } = require('url');
const { Stream } = require('stream');
const localResource = [ // local resource that the client can access
    'index.html',
    'client.html',
    'cros-proxy-service-worker.js'
]

const ENGINE = process.env.GLITCH_SHARED_INCLUDES_LEGACY_CLS ? 'GLITCH' : process.env.XDG_CONFIG_HOME ? 'REPLIT' : 'NATIVE'
const HOST = process.env.HOST || '127.0.0.1'
const PORT = process.env.PORT || 5000
let DIR_PATH = new Promise((resolve, reject) => { fs.access('./corsidium.js', (err) => { if (err) { DIR_PATH = 'proxy/'; } else { DIR_PATH = './'; } resolve(); }); });



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

function connectionListener(clientSocket) {

}
/**
 * 
 * @param {http.IncomingMessage} req 
 * @param {net.Socket} clientSocket 
 * @param {Stream.} head 
 */
function upgradeListener(req, clientSocket, head) {
    console.log(req); 
    clientSocket
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
    proxy.on('connect', connectListener);
    proxy.on('upgrade', upgradeListener); 
    proxy.on('connection', connectListener)
    // boot the server
    proxy.listen(PORT, HOST, () => {
        console.log('Running on ' + HOST + ':' + PORT + ' Engine: ' + ENGINE);
    });
})(); 