// WebSocket API overwrite 
const sw = navigator.serviceWorker

const ref_ws = {WebSocket}.WebSocket;
class ws extends EventTarget {
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
        tURL.searchParams.append('__CROS_LCPP_WS_ORIGIN', __CROS_origin)
        this.__CROS_ws_sock = new ref_ws('wss://' + window.location.host + '/ws/' + tURL.href, protocols);
        // list of listener variables
        this.__CROS_ws_internal_listeners = {
            onclose: null,
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

        // interface functions
        this.send = function (data) {
            return this.__CROS_ws_sock.send(data);
        }
        this.close = function (code, reason) {
            return this.__CROS_ws_sock.close(code, reason);
        }
    }
}

WebSocket = ws;
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

