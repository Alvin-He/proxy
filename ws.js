// let __CROS_origin = SCOPE:serviceworker:CURRENT_URL.origin
// WebSocket API overwrite 
const sw = navigator.serviceWorker
const CROS_SERVER_ENDPOINT = new URL(window.location.origin);

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
        tURL.searchParams.append('__CROS_LCPP_WS_ORIGIN', new URL(window.location.pathname.slice(1)).origin);
        this.__CROS_ws_sock = new ref_ws('wss://' + CROS_SERVER_ENDPOINT.host + '/ws/' + tURL.href, protocols);
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



// const __CROS_origin = new URL(location.pathname.slice(1));

// window.location override, should be in another file, but too lazy to do that right now

let __CORS_SCRIPT_LOADED = []; // a list of scripts that's loaded'

class __CORS_location_base extends URL { // base location class
    constructor() {
        // super(__CROS_origin + window.location.pathname + window.location.search + window.location.hash);
        super(window.location.pathname.slice(1) + window.location.search + window.location.hash);
        return this;
    }
    assign(url) {
        console.log('assign', url);
        // window.location.assign(window.origin + '/sw-signal/navigate/' + url);
        window.location.assign(CROS_SERVER_ENDPOINT.origin + new URL(url, this.origin));
    }
    reload() {
        // window.location.reload(window.origin + '/sw-signal/navigate/' + this.href);
        window.location.reload();
    }
    replace(url) {
        console.log('replace', url);
        // window.location.replace(window.origin + '/sw-signal/navigate/' + url);
        window.location.replace(CROS_SERVER_ENDPOINT.origin + new URL(url, this.origin));
    }
}

Location = __CORS_location_base;
const __CORS_location = new __CORS_location_base();
// // const __CORS_location = location;
// // let win = window;
// let win = {
//     get location() { return __CORS_location; },
//     set location(value) { __CORS_location.assign(value) },
// }

window.history.go = function (delta) {
    console.log('history.go', delta);
}

/**
 *  so besicially what's happening here is that we override a bunch of stuff that we want to change 
 *  and execute the code in a controlled scope with eval
 *  the exec function is contantly being redefined in a lower scope (nesting shouldn't really be a problem since 
 *  no body would actually load like 1000 scripts)
 */


//execEnvGet = function (name) {return eval(name)};eval(code + evalCode);

//execEnvGet = function (name) { try { return eval(name) } catch (e) { return undefined }}; execEnvSet = function (name, value) { return eval(name + " = " + "value;") };
let exec;
let evalCode = `

exec = (code) => {execEnvGet = function (name) { try { return eval(name) } catch (e) { return undefined }}; execEnvSet = function (name, value) { return eval(name + " = " + "value;") };if(location != loc){loc.assign(location);}}`;

// let base = new URL(window.location.pathname.slice(1) + window.location.search + window.location.hash);
let base = new URL('https://test.com')
let loc = new __CORS_location_base();

class envResolve {
    constructor(key) {
        this.k = key
    }
}

let execEnvGet = (name) => {return undefined}
let execEnvSet = (name, value) => {return undefined}
const handler = {
    get(self, key) {
        switch (key) {
            case 'location':
                return loc;
                break;
            default:
                let returnVal = self[key];
                if (returnVal instanceof envResolve || !returnVal) {
                    returnVal = execEnvGet(key);
                    self[key] = new envResolve(key)
                }
                if (typeof returnVal == 'function') {
                    returnVal = returnVal.bind(self)
                    // try {
                    //     returnVal()
                    // } catch (error) {
                    //     if (error.message.indexOf('Illegal invocation' != -1)) {
                    //         returnVal = returnVal.bind(self)
                    //     }
                    // }
                }
                return returnVal
                break;
        }
    },
    set(self, key, value) {
        switch (key) {
            case 'location':
                return loc.assign(value);
                break;
            default:
                if (self[key] instanceof envResolve) return execEnvSet(key, value);
                return self[key] = value;
                break;
        }
    }
};

// check location after script executation
// check location in event listeners

let timers = {};
let current_exec_file = '';

(() => {
    let _doc = new Proxy(document, handler);
    window.document = _doc;
    let _win = new Proxy(window, handler);
    (function (window, globalThis, document, location) {
        timers.location = setInterval(() => {
            if (location != loc) {
                console.log('location changed', location, loc);
                loc.assign(location);
            }
        }, 100)
        exec = (code) => {
            execEnvGet = function (name) { try { return eval(name) } catch (e) { return undefined }}
            execEnvSet = function (name, value) {return eval(name + ' = ' + 'value;')}
            eval(code + evalCode);
            if (location != loc) {
                loc.assign(location);
            }
        }
    }).call(_win, _win, _win, _doc, loc);
})()

const scriptCache = {}
// service worker callbacks
sw.onmessage = (event) => {
    let data = event.data;
    if (data.type == 'SCRIPT_LOAD') {
        scriptCache[data.file] = data.code

        // current_exec_file = data.file;
        // exec(data.code);
    }
}