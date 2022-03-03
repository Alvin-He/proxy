if ('serviceWorker' in navigator) {
    // window.addEventListener('load', function () {
    navigator.serviceWorker.register('cros-proxy-service-worker.js').then(function (registration) {
        // Registration was successful
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
        return;
    }, function (err) {
        // registration failed :(
        console.log('ServiceWorker registration failed: ', err);
        return err;
    });
    // });
}

const sw = navigator.serviceWorker

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

let currentID = 0
class ws extends EventTarget {
    constructor(url, protocols) {
        super() // EventTarget initialization 

        // proxy defined properties
        this.SOCKET_IDENTIFIER = ++currentID

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
        this.CLOSING = 2,
        this.CLOSED = 3

        sw.addEventListener('message', (event) => {
            if (event.data && event.data.id == this.SOCKET_IDENTIFIER) {
                const data = event.data
                if (data.type == 'WEB_SOCKET_INIT') {
                    console.log('status: ' + data.status + '\nSocket Information:');
                    if (data.status == 'ok') {
                        console.log(data.socket); 
                        // copy the data from the sw to this object 
                        for (property in data.socket) {
                            this[property] = data.socket[property];
                        }
                    }else{
                        console.log(data.error)
                    }
                    

                } else if (data.type == 'WEB_SOCKET_message') {
                    console.log('Socket Message ID: ' + data.id)
                    console.log(data.event)
                    this.dispatchEvent(new MessageEvent('message', {
                        data: data.event.data, 
                        origin: event.data.origin, 
                        lastEventId: data.event.lastEventId, 
                        source: window
                    }))

                } else if (data.type == 'WEB_SOCKET_open') {
                    console.log('Socket Open ID: ' + data.id)
                    this.dispatchEvent(new Event('open'))

                } else if (data.type == 'WEB_SOCKET_error') {
                    console.log('Socket Error ID: ' + data.id)
                    this.dispatchEvent(new Event('error')); 

                } else if (data.type == 'WEB_SOCKET_close') {
                    console.log('Socket Close ID: ' + data.id)
                    console.log(data.event)
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
            id: this.SOCKET_IDENTIFIER,
        })
        
        

        return this
    }
    
    send(data) {
        console.log(data); 
        sw.controller.postMessage({
            type: 'WEB_SOCKET_send', 
            id: this.SOCKET_IDENTIFIER,
            data: data
        })
    }
    close(code, reason) {
        console.log(code, reason); 
        sw.controller.postMessage({
            type: 'WEB_SOCKET_close',
            id: this.SOCKET_IDENTIFIER,
            code: code ? code : 1000, 
            reason: reason ? reason : undefined
        })
    }
}

// LET'S GOOOOOOOO
WebSocket = ws; 

// const postMessage = 
let serviceWorkerFetchs = {} // fetch callbacks url->string : callback->function

// service worker response listener
navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data) {
        if (event.data.type == 'FETCH_DOCUMENT') {
            // loads callback for the according url
            if (serviceWorkerFetchs[event.data.url] 
            && typeof serviceWorkerFetchs[event.data.url] == 'function') {
                serviceWorkerFetchs[event.data.url](event.data.response, event.data.status)
            }
        }
    }
});

function doCORSRequest() {
    let url = document.getElementById('Url').value; 
    //create callback
    serviceWorkerFetchs[url] = (response, status) => {
        console.log("GET" + ' ' + url + ' ' + status);
        // window.document.getElementsByTagName('html')[0].innerHTML = "";
        if (status == 'ok') {
            // updates the current url 
            navigator.serviceWorker.controller.postMessage({
                type: 'UPDATE_CURRENT_URL',
                url : url
            })
            window.location.href = 'https://' + window.location.host + '/'
            // let newWindow = window.open('https://127.0.0.1:3000')
            // newWindow.document.write(response)
            // newWindow.document.scripts.
        }

    }
    // tell the serviceWorker to initiate the request 
    navigator.serviceWorker.controller.postMessage({
        type : 'FETCH_DOCUMENT', 
        url : url
    })
}