const wtf_is_wrong_with_eslint = 'would be really glad if somebody can tell me a better linter'


const injects = {
    ws : '<script src="/ws.js"></script>',
}


/**
 * 
 * @param {String} htmlDocument 
 * @param {String} url 
 * @returns 
 */
async function parseHTML(htmlDocument) {
    if (htmlDocument.length < 1) return null; // if the document is empty, return null
    const buffer = new Array(6);
    const bufferLength = buffer.length - 1;
    for (let i = 0; i < 6; i++) {
        buffer[i] = htmlDocument[i];
    }// fill the buffer

    let currentIndex = 6;
    for (let i = 0; i < htmlDocument.length; i++) {
        if (buffer.join('').indexOf('<head>') > -1) { // check if we found the header we wanted
            // insert web socket script
            htmlDocument = htmlDocument.slice(0, i) + injects.ws + htmlDocument.slice(i);
            currentIndex = i + injects.ws.length; // load the index for next round iteration
            break;
        }
        buffer.shift(); // remove the previous char
        buffer[bufferLength] = htmlDocument[i]; // insert the new char
    }
    for (let i = currentIndex; i < htmlDocument.length; i++) {
        

        if (buffer.join('').indexOf('<base') > -1) { // found base
            // when we found the base, start looking for the href tag
            for (let i = 0; i < 4; i++) { // shift 4 times, so that we don't do unnecessary checks
                buffer.shift(); 
                buffer[bufferLength] = htmlDocument[i]; 
            }
            currentIndex += 4
            for (let i = currentIndex; i < htmlDocument.length; i++) {
                if (buffer.join('').indexOf('href') > -1) { // found href
                    currentIndex += i;
                    // when we found the href, start looking for the equal sign
                    for (let i = currentIndex; i < htmlDocument.length; i++) {
                        if (htmlDocument[i] == '=') {
                            currentIndex += i;
                            // when we found the equal sign, start looking for the quote
                            for (let i = currentIndex; i < htmlDocument.length; i++) {
                                if (htmlDocument[i] == '"') {
                                    currentIndex += i;
                                    // when we found the quote, start checking if we have an absolute url
                                    for (let i = 0; i < 6; i++) {
                                        buffer[i] = htmlDocument[currentIndex + i];
                                    }// reload the buffer as it's now outdated
                                    
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

            // // insert web socket script
            // htmlDocument = htmlDocument.slice(0, i) + injects.ws + htmlDocument.slice(i);
            // currentIndex = i + injects.ws.length; // load the index for next round iteration
            break;
        }
        buffer.shift(); // remove the previous char
        buffer[bufferLength] = htmlDocument[i]; // insert the new char
    }



    return htmlDocument
}