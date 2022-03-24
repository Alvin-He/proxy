// JavaScript HTML DOM overwrite
const sw = navigator.serviceWorker

// basicially &document in C++
const o_document = {ref: document}.ref;
const o_getElementById = {ref: o_document.getElementById}.ref;

document.getElementById = function(id) {
    console.log('ov called')
    return o_getElementById.bind(this)(id);
}

/*
Document.querySelectorAll()
Document.querySelector()
Document.getElementsByTagName()
Document.getElementsByClassName()
Document.getElementsByName()
Document.getElementsByTagNameNS()
Document.createElement()
Document.createElementNS()
*/