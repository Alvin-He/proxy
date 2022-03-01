const CROS_SERVER_ENDPOINT = 'wss://127.0.0.1:5000/' //'https://cros-proxy-testing.glitch.me/'
const clientUUID = 'undefined!undefined!undefined!undefined!'; 
const currentURL = 'https://discord.com';

// class ws extends WebSocket {
//     constructor(url, protocols) {
//         super(url, protocols); 
//         this.
//     }
// }

self.addEventListener('install', function (event) {
    console.log('Service worker installed.');
    self.skipWaiting();
});

// generates an identifier in the form of LCPP-[host + origin hex hash]-[unix time stamp]-[client UUID]-CROS
async function generateIdentifier(host, origin) {
    // conbine host and origin into a single byte array, so we can hash them 
    const data = new TextEncoder().encode(host + origin); 
    // the hash in SHA-1 (you could use SHA-256, but it's just a UUID, so no need to make it too secure)
    const hash = await crypto.subtle.digest('SHA-1', data) 
    const hashArray = Array.from(new Uint8Array(hash)); // converts into Uint8Array 
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); // converts to hex 

    return 'LCPP-' + hashHex + '-' + Number(new Date) + '-' + clientUUID + '-CROS'
}

// ya, we're definely gonna switch to socket io afterwards .......
async function notifyServer(identifier, target) {
    const req = new Request('https://127.0.0.1:5000/LCPP', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            identifier: identifier,
            origin: currentURL,
            target: target
        })
    })

    let res = await fetch(req)
    if (res.status == 201) { // if the server accepted the request
        return true;
    }else{ // if the server rejected the request, signal error to the client
        throw 'internal service worker error'
    }

}


let webSockets = {};

self.addEventListener('message', async (event) => {
    if (event.data) {
        const client = event.source; 
        const id = event.data.id; 
        if (event.data.type == 'WEB_SOCKET_INIT') {
            console.log('WEB_SOCKET_INIT')
            try {
                if (webSockets[id] != undefined) { throw 'Web socket with id: ' + id + 'already exist.'}
                // generate the identifier
                let {host, origin, href} = new URL(event.data.url);
                const identifier = await generateIdentifier(host, origin);
                // set the target url pointing to our endpoint and send the websocket
                const targetUrl = CROS_SERVER_ENDPOINT + identifier + '/' + href;
                const socket = webSockets[id] = new WebSocket(targetUrl, event.data.protocols); 

                // listeners
                socket.onopen = () => {
                    client.postMessage({
                        type: 'WEB_SOCKET_open',
                        id: id
                    })
                }

                socket.onmessage = (event) => {
                    client.postMessage({
                        type: 'WEB_SOCKET_message',
                        id: id,
                        event: {
                            data: event.data, 
                            origin: event.origin, // API rewrite required
                            lastEventId: event.lastEventId,
                            source: undefined, //event.source // API rewrite required
                            ports: event.ports 
                        }
                    })
                }
                
                socket.onclose = (event) => {
                    client.postMessage({
                        type: 'WEB_SOCKET_close',
                        id: id,
                        event: {
                            code: event.code,
                            reason: event.reason,
                            wasClean: event.wasClean
                        }
                    })
                }

                socket.onerror = () => {
                    client.postMessage({
                        type: 'WEB_SOCKET_error',
                        id: id
                    })
                }

                client.postMessage({
                    type: 'WEB_SOCKET_INIT',
                    status: 'ok',
                    socket: {
                        binaryType: socket.binaryType,
                        bufferedAmount: socket.bufferedAmount,
                        extensions: socket.extensions,
                        protocol: socket.protocol,
                        readyState: socket.readyState,
                        url: event.data.url
                    }
                });
            } catch (error) {
                console.log(error);
                client.postMessage({
                    type: 'WEB_SOCKET_INIT',
                    status: 'failed',
                    error: error.toString()
                });
            }

        }else if (event.data.type == 'WEB_SOCKET_send') {
            webSockets[event.data.id].send(event.data.data);
            
        }else if (event.data.type == 'WEB_SOCKET_close') {
            webSockets[event.data.id].close(event.data.code, event.data.reason);
        }
    }
})