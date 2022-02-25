// WebSocket API overwrite 

/**
 * Notes:
 * 
 * 2 choices: 
 *  1: inhert from WebSocket, change the constructor to point to our own end point,
 *  2: change the entire class, point every thing towards service worker, and let it handle the traffic 
 */

const old_WebSocket = Object.assign({}, WebSocket);

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
    }
    // bufferedAmount: 0 : unsigned long
    // extensions: aWebSocket.extensions : DOMString
    // protocols: aWebSocket.protocol : DOMString
    // url: aWebSocket.url : DOMString
}

class ws {
    constructor(url, protocols) {
        this.sock = old_WebSocket(url, protocols)
        return this
        // this.binaryType = "blob", "arraybuffer"; 
        // this.bufferedAmount = 0; 
        // this.extensions = ''; 
        // this.protocols = ''; 
        // this.readyState = preSets.readyState.CONNECTING; 
        // this.url = ''; 
    }
    send(data) {
        console.log(data); 
        this.sock.send(data); 
    }
    close(code, reason) {
        code = code ? code : 1000; 
        console.log(code, reason); 
        this.sock.close(code, reason); 
    }
}

function socket_send() {

}

function socket_close() {

}
// let sock = new WebSocket('wss://www.example.com/socketserver')
// console.log(sock)



let close = new CloseEvent('close', {
    wasClean: false, 
    code: false, 
    reason: false
}); 

let error = new Event('error'); 
let message = new MessageEvent('messsage', {
    data: '', 
    origin: '', 
    lastEventId: '', 
    source: window, 
})
let open = new Event('open');