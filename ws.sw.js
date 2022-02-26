
const xxx = 'xx'; 

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

let webSockets = {}


self.addEventListener('message', (event) => {
    if (event.data) {
        const client = event.source; 
        const id = event.data.id; 
        if (event.data.type == 'WEB_SOCKET_INIT') {
            console.log('WEB_SOCKET_INIT')
            let socket
            try {
                if (webSockets[id] != undefined) { throw 'Web socket with id: ' + id + 'already exist.'}
                socket = socket[id] = new WebSocket(event.data.url, event.data.protocols); 
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
                        url: socket.url
                    }
                });
            } catch (error) {
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