const injects = {
    ws: '<script src="/ws.js"></script>',
    dom: '<script src="/DOM.js"></script>',
    winLocationNonAssign: '__CORS_location',//'__CORS_location',
    winLocationAssign: 'win.location'
}


async function parseHTML(htmlDocument) {
    // 3s load time old
    if (htmlDocument.length < 1) return null; // if the document is empty, return null
    // htmlDocument = htmlDocument.replace(/(?<=\<head.*\>)\s*(?=\<)/, injects.dom + injects.ws);
    // htmlDocument = htmlDocument.replace(/integrity(?=\=(?="sha(256|384|512)-))/g, '__CROS_integrity')
    // return htmlDocument;
    // TODO: better search algr
    // TODO: find script tags in html and parse them

    let operations = [];

    const reg = {
        header: /(?<=\<head.*\>)\s*(?=\<)/,
        scriptStart: /\<script/,
        // 0.1±0.5 ms/10 match in 200 char - 1300±100 steps  
        scriptAttr: /(?<=\s)([^\s]+?)?(?:(?:\s*?=\s*?['"].*?['"])|(?:\s*?(>).))/g,
        script: /(?<=\<script.*\>)\s*(?=\<)/
    }
    // script inject, regex time: 0.5 ms, esti tot time: 1 ms
    let scriptInjectIndex
    try {
        scriptInjectIndex = /(?<=\<head.*\>)\s*(?=\<)/.exec(htmlDocument).index
    } catch (error) {
        console.log(error)
    }
    operations.push({
        index: scriptInjectIndex,
        operation: 'insert',
        value: injects.dom + injects.ws
    });

    for (let index = 0; (index = htmlDocument.indexOf('<script', index)) != -1;) { // finds the start of a script tag
        reg.scriptAttr.lastIndex = index += 7; // sets the regex to the start of the script tag
        let isExternalJS = false; // weather to parse the contenings of the script tag

        // the second match signals stop, inverting that and passing it to for's condition acts as: `!match[1]`
        // regex best time: 0.1 ms, worst: 0.5 ms, esti avg tot time: 0.5 ms per match
        for (let match; (match = reg.scriptAttr.exec(htmlDocument)) && !match[2] ;) {
            index = match.index + match[0].length; // sets the index to the end of the match
            const attribute = match[1];
            if (attribute == 'src') {
                isExternalJS = true;
            } else if (attribute == 'integrity') {
                operations.push({
                    index: match.index,
                    endIndex: match.index + attribute.length,
                    operation: 'replace',
                    value: '__CROS_integrity'
                });
            }
        }
    }
    console.log(operations);
    // actually operating on the document, this will fail if operations is not ordered from the start of the doc to end
    let previous_endIndex = 0;
    let result = '';
    for (let i = 0; i < operations.length; i++) {
        const operation = operations[i];
        result += htmlDocument.slice(previous_endIndex, operation.index) + operation.value;
        switch (operation.operation) {
            case 'insert':
                previous_endIndex = operation.index;
                break;
            case 'replace':
                previous_endIndex = operation.endIndex - 1;
                break;
        }
    }
    result += htmlDocument.slice(previous_endIndex);
    return result;
}