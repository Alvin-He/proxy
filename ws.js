// WebSocket API overwrite 

function socket_send() {

}

function socket_close() {

}

let close = new CloseEvent('close', {
    wasClean: false, 
    code: false, 
    reason: false
}); 

let error = new Event('error'); 
let message = new Event('message'); 
let open = new Event('open');