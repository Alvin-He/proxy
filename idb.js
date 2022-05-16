// idb related stuff, prob not gonna use it much lmao.
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




function idb_promise(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = (event) => {
            req.onsuccess = undefined;
            resolve();
        };
        req.onerror = () => {
            req.onerror = undefined;
            throw 'IndexDB Access Error'
            reject();
        }
    });
}

let dat_frames = indexedDB.open('dat', 1);
dat_frames.onupgradeneeded = async (event) => {
    let db = event.target.result;
    let store = db.createObjectStore('frames');
};
await idb_promise(dat_frames)
let dat_connection = dat_frames.result;
let dat_transaction = dat_connection.transaction('frames', 'readwrite');
let trans_objStore = dat_transaction.objectStore('frames');

function get(url) {
    let targetData = trans_objStore.get(url);
    await idb_promise(targetData);

}
let frames_obj = trans_objStore.get('frames');
await idb_promise(frames_obj);
frames_obj = frames_obj.result;

trans_objStore