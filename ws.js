// let __CROS_origin = SCOPE:serviceworker:CURRENT_URL.origin
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





// window.location override, should be in another file, but too lazy to do that right now

let __CORS_SCRIPT_LOADED = []; // a list of scripts that's loaded'

class __CORS_location_base extends URL { // base location class
    constructor() {
        super(__CROS_origin + window.location.pathname + window.location.search + window.location.hash);
        return this;
    }
    assign(url) {
        window.location.assign(window.origin + '/sw-signal/navigate/' + url);
    }
    reload() {
        window.location.reload(window.origin + '/sw-signal/navigate/' + this.href);
    }
    replace(url) {
        window.location.replace(window.origin + '/sw-signal/navigate/' + url);
    }
}

const __CORS_location = new __CORS_location_base();
let win = {
    get location() { return __CORS_location; },
    set location(value) { __CORS_location.assign(value) },
}


// service worker callbacks
sw.onmessage = (event) => {
    let data = event.data;
    if (data.type == 'REPORT_ORIGIN') {
        sw.controller.postMessage({
            type: 'REPORT_ORIGIN',
            origin: __CROS_origin
        });
    }
}