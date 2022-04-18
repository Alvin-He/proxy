
const injects = {
    winLocationNonAssign: '___location',//'__CORS_location',
    winLocationAssign: 'win.location'
}

let reg = /(?<=[\:\;\s\(\{\}\+\=])(window|document|this)?(?:\.?location)(?:[\,\;\.\s\)\}\+\=])/g

async function parseJS(code, url) {
    if (code.length < 1) return null;
    // code = 'try{__CORS_SCRIPT_LOADED.push(\'' + url + '\')}catch(e){};' + code.replace(/(?<=[;\s\(\{\}\+\=\:])((window|document|this)\.)?location(?=[;\.\s\)\}\+\=])/g, injects.winLocationAssign);
    let replaceIndex = []; // {type: 1 | 0, index:m.index} 
    for (let m; m = reg.exec(code);) {
        const index = m.index;
        if (!m[1]) {
            let i = 1;
            while (/\s/.test(code[index - i])) i++ // repeat until we find a non-whitespace character
            while (code[index - i] == '(') i++; // repeat until we're out of left brakets
            if (code[index - i] == '{') { // if we hit a brace, then they are using {name:{location}}
                while (/\s/.test(code[index - i])) i++ // non whitespace again
                if (code[index - (i + 1)] == ':') {
                    replaceIndex.push({
                        type: 1, // 1 means that we'll have to replace it with location:win.location
                        sIndex: m.index,
                        eIndex: m.index + m[0].length
                    });
                    continue
                }
            }
        }
        replaceIndex.push({
            type: 0, // 0 means normal op
            sIndex: m.index,
            eIndex: m.index + m[0].length
        });
    }
    let returnVAL = 'try{__CORS_SCRIPT_LOADED.push(\'' + url + '\')}catch(e){};'
    let previous_eIndex = 0;
    for (let i = 0; i < replaceIndex.length; i++) {
        if (replaceIndex[i].type == 0) {
            returnVAL += code.slice(previous_eIndex, replaceIndex[i].sIndex) + injects.winLocationAssign
        }else{
            returnVAL += code.slice(previous_eIndex, replaceIndex[i].sIndex) + injects.winLocationNonAssign
        }
        previous_eIndex = replaceIndex[i].eIndex - 1;
    }
    returnVAL += code.slice(previous_eIndex);
    return returnVAL;
}