// WebSocket API overwrite 
const sw = navigator.serviceWorker


/**
 * Notes:
 * 
 * 2 choices: 
 *  1: inhert from WebSocket, change the constructor to point to our own end point,
 *  2: change the entire class, point every thing towards service worker, and let it handle the traffic 
 */


let old_WebSocket = new Object
Object.assign(old_WebSocket, WebSocket);

const preSets = {
    binaryType: {
        blob: 'blob', 
        arraybuffer: 'arraybuffer'
    },
    readyState: {
        CONNECTING: 0, 
        OPEN: 1, 
        CLOSING: 2, 
        CLOSED: 3
    },
    bufferedAmount: 0,  // : unsigned long
    extensions: '',     // aWebSocket.extensions : DOMString
    protocols: '',      // aWebSocket.protocol : DOMString
    url: '',            // aWebSocket.url : DOMString
}

class ws extends EventTarget {
    constructor(url, protocols) {
        super() // EventTarget initialization 

        // proxy defined properties
        this.SOCKET_IDENTIFIER = 0;

        // WebSocket properties
        this.binaryType = preSets.binaryType.blob
        this.bufferedAmount = preSets.bufferedAmount
        this.extensions = preSets.extensions
        this.protocol = preSets.protocols
        this.readyState = preSets.readyState.CONNECTING
        this.url = preSets.url
        this.onclose; this.onopen; this.onerror; this.onmessage

        this.CONNECTING = 0
        this.OPEN = 1
        this.CLOSING = 2
        this.CLOSED = 3


        this.send = function (data) {
            console.log('client send: ', data);
            sw.controller.postMessage({
                type: 'WEB_SOCKET_send',
                id: this.SOCKET_IDENTIFIER,
                data: data
            })
        }
        this.close = function (code, reason) {
            console.log('client close: ', code, reason);
            this.readyState = preSets.readyState.CLOSING;
            sw.controller.postMessage({
                type: 'WEB_SOCKET_close',
                id: this.SOCKET_IDENTIFIER,
                code: code ? code : 1000,
                reason: reason ? reason : undefined
            })
        }

        sw.addEventListener('message', (event) => {
            if (event.data) {
                const data = event.data;
                const id = data.SOCKET_ID;
                if (data.type == 'WEB_SOCKET_INIT') {
                    console.log('status: ' + data.status + '\nSocket Information:');
                    if (data.status == 'ok') {
                        this.SOCKET_IDENTIFIER = id;
                        console.log('Socket :',data.socket); 
                        // copy the data from the sw to this object 
                        this.binaryType = data.socket.binaryType;
                        this.bufferedAmount = data.socket.bufferedAmount;
                        this.extensions = data.socket.extensions;
                        this.protocol = data.socket.protocol;
                        this.readyState = data.socket.readyState;
                        this.url = data.socket.url;
                    }else{
                        console.log(data.error)
                    }
                    

                } else if (data.type == 'WEB_SOCKET_message') {
                    console.log('Socket Message ID: ' + id)
                    console.log(data.event)
                    this.dispatchEvent(new MessageEvent('message', {
                        data: data.event.data, 
                        origin: this.url,
                        lastEventId: data.event.lastEventId, 
                        source: window.document.defaultView
                    })); 
                    if (this.onmessage) { this.onmessage(data.event.data) }

                } else if (data.type == 'WEB_SOCKET_open') {
                    console.log('Socket Open ID: ' + id)
                    this.readyState = preSets.readyState.OPEN;
                    this.dispatchEvent(new Event('open'));
                    if (this.onopen) { this.onopen() };

                } else if (data.type == 'WEB_SOCKET_error') {
                    console.log('Socket Error ID: ' + id)
                    this.readyState = preSets.readyState.CLOSING;
                    this.dispatchEvent(new Event('error')); 
                    if (this.onerror) { this.onerror() };

                } else if (data.type == 'WEB_SOCKET_close') {
                    console.log('Socket Close ID: ' + id)
                    console.log(data.event)
                    this.readyState = preSets.readyState.CLOSED;
                    this.dispatchEvent(new CloseEvent('close', {
                        wasClean: data.event.wasClean, 
                        code: data.event.code, 
                        reason: data.event.reason
                    })); 
                    // if(this.onerror) { this.onerror() }

                }
            }
        });

        // Send Service Worker SYN
        sw.controller.postMessage({
            type: 'WEB_SOCKET_INIT',
            url: url,
            protocols: protocols ? protocols : undefined,
            // id: this.SOCKET_IDENTIFIER,
        })
        
        

        return this
    }
}

WebSocket = ws;
console.log('WebSocket overwritten')


class obj extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    get binaryType() { return this.properties.binaryType }; // possible modification by sw
    set binaryType(type) { this.properties.binaryType = type };

    get bufferedAmount() { return this.properties.bufferedAmount }; // possible modification by sw
    get extensions() { return this.properties.extensions };
    get protocol() { return this.properties.protocol };
    get readyState() { return this.properties.readyState }; // possible modification by sw
    get url() { return this.properties.url };

    set onclose(fn) { this.addEventListener('close', this.listeners.onclose = fn)};
    get onclose() { return this.listeners.onclose };
    set onopen(fn) { this.addEventListener('open', this.listeners.onclose = fn)};
    get onopen() { return this.listeners.onopen };
    set onerror(fn) { this.addEventListener('error', this.listeners.onclose = fn)};
    get onerror() { return this.listeners.onerror };
    set onmessage(fn) { this.addEventListener('message', this.listeners.onclose = fn)};
    get onmessage() { return this.listeners.onmessage };

    constructor(url, protocols) {
        super() // EventTarget initialization 
        
        // proxy defined properties
        this.SOCKET_IDENTIFIER = 0;

        // WebSocket predefined properties
        this.CONNECTING = obj.CONNECTING
        this.OPEN = obj.OPEN
        this.CLOSING = obj.CLOSING
        this.CLOSED = obj.CLOSED

        // WebSocket properties
        this.properties = {
            binaryType: preSets.binaryType.blob,
            bufferedAmount : preSets.bufferedAmount,
            extensions : preSets.extensions,
            protocol : preSets.protocols,
            readyState : preSets.readyState.CONNECTING,
            url : preSets.url,
        }
        this.listeners = {
            onclose: () => {},
            onopen: () => {},
            onerror: () => {},
            onmessage: () => {},
        }

        this.send = function (data) {
            console.log('client send: ', data);
            sw.controller.postMessage({
                type: 'WEB_SOCKET_send',
                id: this.SOCKET_IDENTIFIER,
                data: data
            })
        }
        this.close = function (code, reason) {
            console.log('client close: ', code, reason);
            this.readyState = preSets.readyState.CLOSING;
            sw.controller.postMessage({
                type: 'WEB_SOCKET_close',
                id: this.SOCKET_IDENTIFIER,
                code: code ? code : 1000,
                reason: reason ? reason : undefined
            })
        }

        sw.addEventListener('message', (event) => {
            if (event.data) {
                const data = event.data;
                const id = data.SOCKET_ID;
                if (data.type == 'WEB_SOCKET_INIT') {
                    console.log('status: ' + data.status + '\nSocket Information:');
                    if (data.status == 'ok') {
                        this.SOCKET_IDENTIFIER = id;
                        console.log('Socket :', data.socket);
                        // copy the data from the sw to this object 
                        this.properties.binaryType = data.socket.binaryType;
                        this.properties.bufferedAmount = data.socket.bufferedAmount;
                        this.properties.extensions = data.socket.extensions;
                        this.properties.protocol = data.socket.protocol;
                        this.properties.readyState = data.socket.readyState;
                        this.properties.url = data.socket.url;
                    } else {
                        console.log(data.error)
                    }


                } else if (data.type == 'WEB_SOCKET_message') {
                    console.log('Socket Message ID: ' + id)
                    console.log(data.event)
                    this.dispatchEvent(new MessageEvent('message', {
                        data: data.event.data,
                        origin: this.properties.url,
                        lastEventId: data.event.lastEventId,
                        source: window.document.defaultView
                    }));

                } else if (data.type == 'WEB_SOCKET_open') {
                    console.log('Socket Open ID: ' + id)
                    this.properties.readyState = preSets.readyState.OPEN;
                    this.dispatchEvent(new Event('open'));

                } else if (data.type == 'WEB_SOCKET_error') {
                    console.log('Socket Error ID: ' + id)
                    this.properties.readyState = preSets.readyState.CLOSING;
                    this.dispatchEvent(new Event('error'));

                } else if (data.type == 'WEB_SOCKET_close') {
                    console.log('Socket Close ID: ' + id)
                    console.log(data.event)
                    this.properties.readyState = preSets.readyState.CLOSED;
                    this.dispatchEvent(new CloseEvent('close', {
                        wasClean: data.event.wasClean,
                        code: data.event.code,
                        reason: data.event.reason
                    }));

                }
            }
        });

        // Send Service Worker SYN
        sw.controller.postMessage({
            type: 'WEB_SOCKET_INIT',
            url: url,
            protocols: protocols ? protocols : undefined,
            // id: this.SOCKET_IDENTIFIER,
        })

    }
}