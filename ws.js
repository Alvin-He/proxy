// WebSocket API overwrite 
const sw = navigator.serviceWorker

let notifyCallback = {}

function LCPP_NOTIFY(url) {
    return new Promise((resolve, reject) => {
        sw.addEventListener('message', (e) => {
            if (e.data.type == 'LCPP_NOTIFY' && e.data.url == url) {
                sw.removeEventListener('message', e);
                resolve(e.data.status);
            }
        });
        sw.controller.postMessage({
            type: 'LCPP_NOTIFY',
            url: url
        });
    });
}

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
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    get binaryType() { return this.properties.binaryType }; // possible modification by client
    set binaryType(type) { 
        // sw.controller.postMessage({
        //     type: 'WEB_SOCKET_DATA',
        //     id: this.SOCKET_IDENTIFIER,
        //     data: {
        //         binaryType: type
        //     }
        // })
        this.properties.binaryType = type
    };

    get bufferedAmount() { return this.properties.bufferedAmount }; // possible modification by sw
    get extensions() { return this.properties.extensions };
    get protocol() { return this.properties.protocol };
    get readyState() { return this.properties.readyState }; // possible modification by sw
    get url() { return this.properties.url };

    set onclose(fn) { this.removeEventListener('close', this.listeners.onclose); this.addEventListener('close', this.listeners.onclose = fn);};
    get onclose() { return this.listeners.onclose };

    set onopen(fn) { this.removeEventListener('open', this.listeners.onopen); this.addEventListener('open', this.listeners.onopen = fn);};
    get onopen() { return this.listeners.onopen };
    
    set onerror(fn) { this.removeEventListener('error', this.listeners.onerror); this.addEventListener('error', this.listeners.onerror = fn)};
    get onerror() { return this.listeners.onerror };
    
    set onmessage(fn) { this.removeEventListener('message', this.listeners.onmessage); this.addEventListener('message', this.listeners.onmessage = fn)};
    get onmessage() { return this.listeners.onmessage };

    constructor(url, protocols) {
        super() // EventTarget initialization 
        
        // proxy defined properties
        this.SOCKET_IDENTIFIER = 0;

        // WebSocket predefined properties
        this.CONNECTING = ws.CONNECTING
        this.OPEN = ws.OPEN
        this.CLOSING = ws.CLOSING
        this.CLOSED = ws.CLOSED

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
            this.properties.readyState = preSets.readyState.CLOSING;
            sw.controller.postMessage({
                type: 'WEB_SOCKET_close',
                id: this.SOCKET_IDENTIFIER,
                code: code ? code : 1000,
                reason: reason ? reason : undefined
            })
        }

        sw.addEventListener('message', async (event) => {
            if (event.data) {
                const data = event.data;
                const id = data.SOCKET_ID;
                if (data.type == 'WEB_SOCKET_INIT') {
                    console.log('status: ' + data.status + '\nSocket Information:');
                    if (data.status == 'ok') {
                        this.SOCKET_IDENTIFIER = id;
                        console.log('Socket :', data.socket);
                        // copy the data from the sw to this object 
                        this.properties.extensions = data.socket.extensions;
                        this.properties.protocol = data.socket.protocol;
                        this.properties.readyState = preSets.readyState.CONNECTING;
                        this.properties.url = data.socket.url;
                    } else {
                        this.properties.readyState = preSets.readyState.CLOSED;
                        console.log(data.error)
                    }

                } else if (data.type == 'WEB_SOCKET_UPDATE') {
                    this.properties.bufferedAmount = data.data; // update the bufferedAmount rapidly

                } else if (data.type == 'WEB_SOCKET_message') {
                    console.log('Socket Message ID: ' + id)
                    console.log(data.event)
                    if (this.properties.binaryType == 'blob') {
                        this.dispatchEvent(new MessageEvent('message', {
                            data: data.event.data,
                            origin: this.properties.url,
                            lastEventId: data.event.lastEventId,
                            source: window.document.defaultView,
                        }));
                    } else {
                        (async () => {
                            this.dispatchEvent(new MessageEvent('message', {
                                data: await data.event.data.arrayBuffer(),
                                origin: this.properties.url,
                                lastEventId: data.event.lastEventId,
                                source: window.document.defaultView,
                            }));
                        })();
                    }
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
const ref_ws = {WebSocket}.WebSocket;
class nws extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    get binaryType() { return this.__CROS_ws_sock.binaryType };
    set binaryType(type) { this.__CROS_ws_sock.binaryType = type };
    get bufferedAmount() { return this.__CROS_ws_sock.bufferedAmount }; // possible modification by sw
    get extensions() { return this.__CROS_ws_sock.extensions };
    get protocol() { return this.__CROS_ws_sock.protocol };
    get readyState() { return this.__CROS_ws_sock.readyState }; // possible modification by sw
    get url() { return this.__CROS_target_url };

    set onclose(fn) { this.removeEventListener('close', this.__CROS_ws_internal_listeners.onclose); this.addEventListener('close', this.__CROS_ws_internal_listeners.onclose = fn); };
    get onclose() { return this.__CROS_ws_internal_listeners.onclose };

    set onopen(fn) { this.removeEventListener('open', this.__CROS_ws_internal_listeners.onopen); this.addEventListener('open', this.__CROS_ws_internal_listeners.onopen = fn); };
    get onopen() { return this.__CROS_ws_internal_listeners.onopen };

    set onerror(fn) { this.removeEventListener('error', this.__CROS_ws_internal_listeners.onerror); this.addEventListener('error', this.__CROS_ws_internal_listeners.onerror = fn) };
    get onerror() { return this.__CROS_ws_internal_listeners.onerror };

    set onmessage(fn) { this.removeEventListener('message', this.__CROS_ws_internal_listeners.onmessage); this.addEventListener('message', this.__CROS_ws_internal_listeners.onmessage = fn) };
    get onmessage() { return this.__CROS_ws_internal_listeners.onmessage };

    constructor (url, protocols) {
        super() // EventTarget initialization
        this.__CROS_target_url = url;
        let tURL = new URL(url);
        tURL.searchParams.append('__CROS_LCPP_WS_ORIGIN')
        this.__CROS_ws_sock = new ref_ws('wss://' + window.location.host + '/ws/' + url, protocols);
        // list of listener variables
        this.__CROS_ws_internal_listeners = {
            onclose: undefined,
            onopen: undefined,
            onerror: undefined,
            onmessage: undefined,
        }
        // websocket event proxy
        this.__CROS_ws_sock.onmessage = (event) => {
            this.dispatchEvent(new MessageEvent('message', {
                data: event.data,
                origin: this.url,
                lastEventId: event.lastEventId,
                source: event.source,
                ports: event.ports,
            }));
        }
        this.__CROS_ws_sock.onopen = () => {
            this.dispatchEvent(new Event('open'));
        }
        this.__CROS_ws_sock.onclose = (event) => {
            this.dispatchEvent(new CloseEvent('close', {
                wasClean: event.wasClean,
                code: event.code,
                reason: event.reason
            }));
        }
        this.__CROS_ws_sock.onerror = () => {
            this.dispatchEvent(new Event('error'));
        }
    }
}

WebSocket = nws;
console.log('WebSocket overwritten') 





// the client pings the sw when there's a change expected in the url

let __CORS_SCRIPT_LOADED = []; // a list of scripts that's loaded'

const __CORS_browsePreset = '/browse/';
let __CORS_base
sw.addEventListener('message', async (event) => {
    if (event.data.type == 'LOCATION_BASE') {
        __CORS_base = new URL(event.data.location);
    }
});
async function update_base() {
    sw.controller.postMessage({
        type: 'LOCATION_BASE'
    });
}
update_base();
const __CORS_user_location = () => { return __CORS_base }
let _location = {
    get search() { return location.search; },
    set search(value) { location.search = value; },

    get hash() { return location.hash; },
    set hash(value) { location.hash = value; },

    get host() { return __CORS_user_location().host; },
    set host(value) {
        __CORS_user_location().host = value;
        location.pathname = __CORS_browsePreset + __CORS_user_location().href;
    },

    get hostname() { return __CORS_user_location().hostname; },
    set hostname(value) {
        __CORS_user_location().hostname = value;
        location.pathname = __CORS_browsePreset + __CORS_user_location().href;
    },

    get origin() { return __CORS_user_location().origin; },
    set origin(value) {
        __CORS_user_location().origin = value;
        location.pathname = __CORS_browsePreset + __CORS_user_location().href;
    },

    get href() { return __CORS_user_location().href; },
    set href(value) {
        __CORS_user_location().href = value;
        location.pathname = __CORS_browsePreset + __CORS_user_location().href;
    },

    get pathname() { return __CORS_user_location().pathname; },
    set pathname(value) {
        __CORS_user_location().pathname = value;
        location.pathname = __CORS_browsePreset + __CORS_user_location().href;
    },

    get port() { return __CORS_user_location().port; },
    set port(value) {
        __CORS_user_location().port = value;
        location.pathname = __CORS_browsePreset + __CORS_user_location().href;
    },

    get protocol() { return __CORS_user_location().protocol; },
    set protocol(value) {
        __CORS_user_location().protocol = value;
        location.pathname = __CORS_browsePreset + __CORS_user_location().href;
    },
}
let win = {
    get location() { console.log('location acccess'); return _location; },
    set location(value) { location.pathname = __CORS_browsePreset + new URL(value).href; },
    __proto__: window,
}
win = window;
const __CORS_location = win.location;
globalThis = win;

