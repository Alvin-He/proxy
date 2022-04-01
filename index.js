if ('serviceWorker' in navigator) {
    // window.addEventListener('load', function () {
    navigator.serviceWorker.register('/service-worker.js').then(function (registration) {
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

// const postMessage = 
let serviceWorkerFetchs = {} // fetch callbacks url->string : callback->function

// service worker response listener
navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data) {
        if (event.data.type == 'FETCH_DOCUMENT') {
            // loads callback for the according url
            if (serviceWorkerFetchs[event.data.originUrl] 
                && typeof serviceWorkerFetchs[event.data.originUrl] == 'function') {
                // serviceWorkerFetchs[event.data.url](event.data.response, event.data.status)
                serviceWorkerFetchs[event.data.originUrl](event.data.status, event.data.resultUrl)
            }
        }
    }
});

function doCORSRequest() {
    let url = document.getElementById('Url').value; 
    //create callback          response, 
    serviceWorkerFetchs[url] = (status, resultUrl) => {
        console.log("GET" + ' ' + url + ' ' + status + ' result ' + resultUrl);
        // window.document.getElementsByTagName('html')[0].innerHTML = "";
        if (status == 'ok') {
            // updates the current url 
            // navigator.serviceWorker.controller.postMessage({
            //     type: 'UPDATE_CURRENT_URL',
            //     url : url
            // })
            window.location.href = 'https://' + window.location.host + '/sw-signal/navigate/' + resultUrl;
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