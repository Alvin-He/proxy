// WebSocket API overwrite 

// const old_WebSocket = WebSocket;

class ws {
    constructor(url, protocols) {
        this.binaryType = "blob", "arraybuffer"; 
        this.bufferedAmount; 
        this.extensions; 
        this.protocols; 
        this.readyState; 
        this.url; 
    }
    send(data) {
        console.log(data)
    }
    close(code, reason) {
        code = code ? code : 1000; 
        console.log(code, reason)
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
let message = new Event('message'); 
let open = new Event('open');