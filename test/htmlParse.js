const wtf_is_wrong_with_eslint = 'would be really glad if somebody can tell me a better linter'


const injects = {
    ws : '<script src="/ws.js"></script>',
    redirEndPoint: 'https://127.0.0.1:3000/',
}


/**
 * Current preformance is: 4.5 ms per call when parsing https://discord.com
 * looking into DOMParser for a possible better solution, but this works and it's as fast as it needs to be
 * 
 * @param {String} htmlDocument 
 * @param {String} url 
 * @returns 
 */
async function parseHTML(htmlDocument) {
    if (htmlDocument.length < 1) return null; // if the document is empty, return null
    let length = htmlDocument.length;
    const buffer = new Array(6);
    const bufferLength = buffer.length - 1;
    for (let i = 0; i < 6; i++) {
        buffer[i] = htmlDocument[i];
    }// fill the buffer

    let currentIndex = 6;
    for (let i = 0; i < length; i++) {
        if (buffer.join('').indexOf('<head') > -1) { // check if we found the header we wanted
            // insert web socket script
            htmlDocument = htmlDocument.slice(0, i) + injects.ws + htmlDocument.slice(i);
            currentIndex = i + injects.ws.length; // load the index for next round iteration
            length += injects.ws.length; // update the length of the document
            break;
        }
        buffer.shift(); // remove the previous char
        buffer[bufferLength] = htmlDocument[i]; // insert the new char
    } // websocket script inject 
    for (let i = currentIndex; i < length; i++) {
        if (buffer.join('').indexOf('<base') > -1) { // found base
            // when we found the base, start looking for the href tag
            for (const e = i + 4; i <= e; i++) { // shift 4 times, so that we don't do unnecessary checks
                buffer.shift(); 
                buffer[bufferLength] = htmlDocument[i]; 
            }
            for (; i < length; i++) {
                if (buffer.join('').indexOf('href') > -1) { // found href
                    // currentIndex = i;
                    // when we found the href, start looking for the equal sign
                    for (; i < length; i++) {
                        if (htmlDocument[i] == '=') {
                            // currentIndex += i;
                            // when we found the equal sign, start looking for the quote
                            for (; i < length; i++) {
                                if (htmlDocument[i] == '"') {
                                    i++;
                                    // when we found the quote, start checking if we have an absolute url
                                    for (let I = 0; I < 6; I++) {
                                        buffer[I] = htmlDocument[i + I];
                                    }// reload the buffer as it's now outdated
                                    const val = buffer.join('');
                                    if (val == 'https:' || val == 'http:/') { // found absolute url
                                        // redirect the url
                                        htmlDocument = htmlDocument.slice(0, i) + injects.redirEndPoint + htmlDocument.slice(i);
                                        i += 6 + injects.redirEndPoint.length;
                                        length += injects.redirEndPoint.length;
                                    } else if (val[0] + val[1] == '//') { // relative protocol url handling 
                                        const injectionURL = injects.redirEndPoint + 'https:'; // add the protocol (service workers are always over https, so it's https)
                                        htmlDocument = htmlDocument.slice(0, i) + injectionURL + htmlDocument.slice(i);
                                        i += injectionURL.length + 6;
                                        length += injectionURL.length;
                                    }// if it's an relative url, we don't need to do anything
                                    currentIndex = i;
                                    break;
                                }
                            }
                            break;
                        }
                    }
                    break;
                }
                buffer.shift(); // remove the previous char
                buffer[bufferLength] = htmlDocument[i]; // insert the new char
            }
            break;
        }
        buffer.shift(); // remove the previous char
        buffer[bufferLength] = htmlDocument[i]; // insert the new char
    } // base tag modification 
    for (let i = currentIndex; i < length; i++) {
        if (buffer.join('') == '/head>') { // found the end of the header
            currentIndex = i;
            break;
        }
        buffer.shift(); // remove the previous char
        buffer[bufferLength] = htmlDocument[i]; // insert the new char
    } // move the pointer to the end of index
    for (let i = currentIndex; i < length; i++) {
        if (buffer[4] + buffer[5] == '<a') { // found the start of the anchor tag
            // when we found the base, start looking for the href tag
            for (const e = i + 4; i <= e; i++) { // shift 4 times, so that we don't do unnecessary checks
                buffer.shift();
                buffer[bufferLength] = htmlDocument[i];
            }
            for (; i < length; i++) {
                if (buffer.join('').indexOf('href') > -1) { // found href
                    // currentIndex = i;
                    // when we found the href, start looking for the equal sign
                    for (; i < length; i++) {
                        if (htmlDocument[i] == '=') {
                            // currentIndex += i;
                            // when we found the equal sign, start looking for the quote
                            for (; i < length; i++) {
                                if (htmlDocument[i] == '"') {
                                    i++;
                                    // when we found the quote, start checking if we have an absolute url
                                    for (let I = 0; I < 6; I++) {
                                        buffer[I] = htmlDocument[i + I];
                                    }// reload the buffer as it's now outdated
                                    const val = buffer.join('');
                                    if (val == 'https:' || val == 'http:/') { // found absolute url
                                        // redirect the url
                                        htmlDocument = htmlDocument.slice(0, i) + injects.redirEndPoint + htmlDocument.slice(i);
                                        i += 6 + injects.redirEndPoint.length;
                                        length += injects.redirEndPoint.length;
                                    } else if (val[0] + val[1] == '//') { // relative protocol url handling 
                                        const injectionURL = injects.redirEndPoint + 'https:'; // add the protocol (service workers are always over https, so it's https)
                                        htmlDocument = htmlDocument.slice(0, i) + injectionURL + htmlDocument.slice(i);
                                        i += injectionURL.length + 6;
                                        length += injectionURL.length;
                                    }// if it's an relative url, we don't need to do anything
                                    currentIndex = i;
                                    break;
                                }
                            }
                            break;
                        }
                    }
                    break;
                }
                buffer.shift(); // remove the previous char
                buffer[bufferLength] = htmlDocument[i]; // insert the new char
            }
        }
        buffer.shift(); // remove the previous char
        buffer[bufferLength] = htmlDocument[i]; // insert the new char
    } // search for anchor tag (parsing the entire body)

    return htmlDocument
}

let totTime = 0;
function test(html) {
    setTimeout(async () => {
        const start = performance.now();
        const res = await parseHTML(html)
        const end = performance.now();
        console.log(end - start);
        totTime += end - start;
    })

}