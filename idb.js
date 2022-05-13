
function openDataBase (name, version = 1) {
    return new Promise((resolve, reject) => {
        const idbOpenReq = self.indexedDB.open(name, version);
        idbOpenReq.onsuccess(event => {
            resolve(idbOpenReq.result);
        }); 
        idbOpenReq.onerror = idbOpenReq.onblocked = () => {
            reject('Errored while retriveing database')
        }
    });
}


class IDB {
    /**
     * 
     * @param {IDBDatabase} database 
     */
    constructor (database) {
        this.database = database
        this.currentTransactions = {}
    }
    open(key, mode = 'readwrite') {
        return this.currentTransactions[key] = this.database.transaction(key, mode);
        this.database.transaction(key, mode).objectStore()
    }

    read(key, name) {
        return this.currentTransactions[key].objectStore(name)
    }

    write(key, name, value) {

    }
}