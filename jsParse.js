



/* 
    Probably need to do parralled parsing operations so we can be time effiecient

    overwriting window.location and document.location
*/
const reg_exprTerm = /;|}|\s/;
const injects = {
    ws: '<script src="/ws.js"></script>',
    redirEndPoint: 'https://127.0.0.1:3000/',
    winLocation: 'win.location',
}


// we are ignoring computed member access since it's litertly impossible to track
async function parseJS(code, url) {
    if (code.length < 1) return null;


    let replaceIndex = []; // {type: 1 | 0, index:m.index} 
    for (let match; match = reg.exec(code);) {
        const sindex = match.index;
        const eindex = sindex + match[0].length;

        let i = 1;
        while (/\s/.test(code[eindex + i])) i++ // repeat out whitespace chars 
        while (code[eindex + i] == ')') i++; // repeat out right parens
        while (/\s/.test(code[eindex + i])) i++ // space again 
        console.log(eindex + i + 1);
        if (code[eindex + i + 1] == '=') {
            replaceIndex.push({
                type: 1,
                sIndex: sindex,
                eIndex: eindex
            });
            continue;
        }
        replaceIndex.push({
            type: 0,
            sIndex: sindex,
            eIndex: eindex
        });
    }
    let returnVAL = 'try{__CORS_SCRIPT_LOADED.push(\'' + url + '\')}catch(e){};'
    let previous_eIndex = 0;
    for (let i = 0; i < replaceIndex.length; i++) {
        if (replaceIndex[i].type == 0) {
            returnVAL += code.slice(previous_eIndex, replaceIndex[i].sIndex) + injects.winLocationNonAssign
        } else {
            returnVAL += code.slice(previous_eIndex, replaceIndex[i].sIndex) + injects.winLocationAssign
        }
        previous_eIndex = replaceIndex[i].eIndex - 1;
    }
    returnVAL += code.slice(previous_eIndex);
    return returnVAL;
}

function parser(code, startPos, endPos) {
    let length = endPos - startPos;
    if (endPos - startPos < 10) return null; // do nothing if we get the last bit of the code (shouldn't happen, but just in case) 
    const buffer = new Array(8);
    const bufferLength = buffer.length - 1;
    for (let i = 0; i < 8; i++) {
        buffer[i] = code[i];
    }// fill the buffer

    // this.location
    // document.location
    // location

    let locs = {
        start: [],
        end: []
    }
    endPos += 7;
    if (endPos > code.length) endPos = code.length;
    for (let index = startPos; index <= endPos; index++) {
        if (buffer.join('')  == 'location' && reg_exprTerm.test(code[index])) { 
            const end = index; 
            let dot = index - 9;
            const char = code[dot]
            if (char == '.') {
                let buf = code.substring(dot - 8, dot);
                if (buf == 'document') {
                    locs.start.push(dot - 8);
                    locs.end.push(end);
                }else if (buf.indexOf('window') > -1) {
                    locs.start.push(dot - 6);
                    locs.end.push(end);
                }else if (buf.indexOf('this') > -1) {
                    locs.start.push(dot - 4);
                    locs.end.push(end);
                }
            } else if (reg_exprTerm.test(char)) {
                locs.start.push(dot + 1);
                locs.end.push(end);
            }// can't really do anything for computed access, tracking variable changes is just too performance heavy 
        }
        buffer.shift(); // remove the previous char
        buffer[bufferLength] = code[index]; // insert the new char
    }
    return locs;
}

/*
if (code[++index] == '.') {
                for (let i = 0; i < 8; i++) {
                    buffer[i] = code[++index];
                }
                if (buffer.join('') == 'location') {
                    
                }
            }
*/

/**
 * 
 * @param {String} code 
 */

async function jsParse(code, parrallThreads = 5) {
    
    let promiseArray = [];
    let lengthPreThread = Math.floor(code.length / parrallThreads);
    if (lengthPreThread < 100) { lengthPreThread = code.length; parrallThreads = 1; }
    for (let i = 0; i < parrallThreads; i++) {
        promiseArray.push(new Promise((resolve, reject) => {resolve(parser(code, i * lengthPreThread, (i + 1) * lengthPreThread))}));
    }

    let response = await Promise.all(promiseArray);

    let processedCode = '';

    let subStrStart = 0;
    for (let i = 0; i < parrallThreads; i++) {
        const start = response[i].start;
        const end = response[i].end;
        if (start.length > 0) {
            for (let j = 0; j < start.length; j++) {
                processedCode += code.slice(subStrStart, start[j]) + 'win.location';
                subStrStart = end[j];
            }
        }
    }
    processedCode += code.slice(subStrStart);

    return processedCode;
}

// really inefficent, probably need to make it mutithreaded ^^^^^
async function parseJS(code) {
    const length = code.length;
    const buffer = new Array(8);
    const bufferLength = buffer.length - 1;
    for (let i = 0; i < 8; i++) {
        buffer[i] = code[i];
    }// fill the buffer
    let result = '';
    let subStrStart = 0;
    for (let index = 8; index <= length; index++) {
        if (buffer.join('') == 'location' && /\.|\s|;|\)|}|\+|=/.test(code[index])) {
            console.log('match')
            const end = index;
            let dot = index - 9;
            const char = code[dot]
            if (char == '.') {
                let buf = code.substring(dot - 8, dot);
                if (buf == 'document') {
                    result += code.slice(subStrStart, dot - 8) + injects.winLocation;
                    subStrStart = end;
                } else if (buf.indexOf('window') > -1) {
                    result += code.slice(subStrStart, dot - 6) + injects.winLocation;
                    subStrStart = end;
                } else if (buf.indexOf('this') > -1) {
                    result += code.slice(subStrStart, dot - 4) + injects.winLocation;
                    subStrStart = end;
                }
            } else if (/;|\s|\(|\{|\}|\+|=/.test(char)) {
                result += code.slice(subStrStart, dot + 1) + injects.winLocation;
                subStrStart = end;
            }// can't really do anything for computed access, tracking variable changes is just too performance heavy 
        }
        buffer.shift(); // remove the previous char
        buffer[bufferLength] = code[index]; // insert the new char
    }
    result += code.slice(subStrStart);
    return result;
}

let totTime = 0;
function test(code, threads = 5) {
    setTimeout(async () => {
        const start = performance.now();
        const res = await parseJS(code);
        const end = performance.now();
        console.log(end - start);
        totTime += end - start;
    })

}
