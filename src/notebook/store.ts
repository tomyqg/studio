import { isRenderer } from "shared/util";
import { db } from "shared/db";
import {
    createStore,
    types,
    createStoreObjectsCollection,
    IFilterSpecification
} from "shared/store";

import { extensions } from "shared/extensions/extensions";

import { store as instrumentsStore } from "instrument/instrument-object";

////////////////////////////////////////////////////////////////////////////////

export interface INotebook {
    id: string;
    name: string;
}

export const notebooksStore = createStore({
    storeName: "notebook/notebooks",
    versionTables: ["notebook/notebooks/version"],
    versions: [
        // version 1
        `CREATE TABLE "notebook/notebooks/version"(version INT NOT NULL);
        INSERT INTO "notebook/notebooks/version"(version) VALUES (1);
        CREATE TABLE "notebook/notebooks"(
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL UNIQUE,
            deleted BOOLEAN,
            name TEXT NOT NULL
        );`
    ],
    properties: {
        id: types.id,
        name: types.string,
        deleted: types.boolean
    }
});

const notebookCollection = createStoreObjectsCollection<INotebook>();

if (isRenderer()) {
    notebooksStore.watch(notebookCollection);
}

export const notebooks = notebookCollection.objects;

export function addNotebook(notebook: Partial<INotebook>) {
    return notebooksStore.createObject(notebook);
}

export function updateNotebook(notebook: Partial<INotebook>) {
    notebooksStore.updateObject(notebook);
}

export function deleteNotebook(notebook: Partial<INotebook>) {
    notebooksStore.deleteObject(notebook);
}

const deletedNotebookCollection = createStoreObjectsCollection<INotebook>(true);
notebooksStore.watch(deletedNotebookCollection, {
    deletedOption: "only"
});
export const deletedNotebooks = deletedNotebookCollection.objects;

////////////////////////////////////////////////////////////////////////////////

export interface INotebookItemSource {
    id: string;
    instrumentName: string;
    instrumentExtensionId: string;
}

export const notebookItemSourcesStore = createStore({
    storeName: "notebook/sources",
    versionTables: ["notebook/sources/version"],
    versions: [
        // version 1
        `CREATE TABLE "notebook/sources/version"(version INT NOT NULL);
        INSERT INTO "notebook/sources/version"(version) VALUES (1);
        CREATE TABLE "notebook/sources"(
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL UNIQUE,
            instrumentName TEXT NOT NULL,
            instrumentExtensionId TEXT NOT NULL
        );`
    ],
    properties: {
        id: types.id,
        instrumentName: types.string,
        instrumentExtensionId: types.string
    }
});

export function insertSource(instrumentName: string, instrumentExtensionId: string) {
    try {
        let result = db
            .prepare(
                `SELECT * FROM
                    "${notebookItemSourcesStore.storeName}"
                WHERE instrumentName = ? AND instrumentExtensionId = ?`
            )
            .get([instrumentName, instrumentExtensionId]);

        const existingSourceId = result && result.id;

        if (existingSourceId) {
            return existingSourceId;
        }

        const info = db
            .prepare(
                `INSERT INTO "notebook/sources" (instrumentName, instrumentExtensionId) VALUES(?, ?)`
            )
            .run([instrumentName, instrumentExtensionId]);

        return info.lastInsertROWID.toString();
    } catch (err) {
        console.error(err);
    }
    return null;
}

export function insertSourceFromInstrumentId(instrumentId: string) {
    try {
        let result = db
            .prepare(`SELECT * FROM "${instrumentsStore.storeName}" WHERE id = ?`)
            .get([instrumentId]);

        if (result && result.id) {
            return insertSource(
                getInstrumentDescription(result.instrumentExtensionId, result.label, result.idn),
                result.instrumentExtensionId
            );
        }
    } catch (err) {
        console.error(err);
    }
    return null;
}

export function getSource(sourceId: string): INotebookItemSource | null {
    try {
        let source = db
            .prepare(`SELECT * FROM "${notebookItemSourcesStore.storeName}" WHERE id = ? `)
            .get([sourceId]);

        return source;
    } catch (err) {
        console.error(err);
    }
    return null;
}

export function getInstrumentDescription(
    instrumentExtensionId: string,
    label: string,
    idn: string
) {
    if (label) {
        return label;
    }

    if (idn) {
        return idn;
    }

    const extension = extensions.get(instrumentExtensionId);
    if (extension) {
        return extension.name;
    }

    return "";
}

////////////////////////////////////////////////////////////////////////////////

export interface INotebookItem {
    id: string;
    date: Date;
    oid: string;
    sid: string;
    type: string;
    message: string;
    data: any;
    deleted: boolean;
}

export interface INotebookItemsFilterSpecification extends IFilterSpecification {
    oid?: string;
    oids?: string[];
}

export const itemsStore = createStore({
    storeName: "notebook/items",
    versionTables: ["notebook/items/version"],
    versions: [
        // version 1
        `CREATE TABLE "notebook/items/version"(version INT NOT NULL);
        INSERT INTO "notebook/items/version"(version) VALUES (1);
        CREATE TABLE "notebook/items"(
            id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL UNIQUE,
            date INTEGER NOT NULL,
            sid INTEGER,
            oid INTEGER NOT NULL,
            type TEXT NOT NULL,
            message TEXT NOT NULL,
            data TEXT,
            deleted BOOLEAN
        );`
    ],
    properties: {
        id: types.id,
        date: types.date,
        sid: types.foreign, // in this table this is source ID, not session ID like in activityLog
        oid: types.foreign,
        type: types.string,
        message: types.string,
        data: types.lazy(types.any),
        deleted: types.boolean
    },

    filterMessage(
        message: {
            op: "create" | "create-delated" | "read" | "update" | "delete";
            object: INotebookItem[] | INotebookItem;
        },
        filterSpecification: INotebookItemsFilterSpecification
    ) {
        if (Array.isArray(message.object)) {
            return true;
        }

        if (
            filterSpecification &&
            filterSpecification.oid &&
            message.object.oid !== filterSpecification.oid
        ) {
            return false;
        }

        if (
            filterSpecification &&
            filterSpecification.oids &&
            (filterSpecification.oids.length > 0 &&
                filterSpecification.oids.indexOf(message.object.oid) === -1)
        ) {
            return false;
        }

        return true;
    },

    prepareWhereClause(filterSpecification: INotebookItemsFilterSpecification) {
        if (!filterSpecification || !(filterSpecification.oid || filterSpecification.oids)) {
            return undefined;
        }

        let whereClause: string = "";
        let params: any[] = [];

        if (filterSpecification.oid !== undefined) {
            whereClause += "oid=?";
            params.push(parseInt(filterSpecification.oid));
        }

        if (filterSpecification.oids !== undefined) {
            whereClause +=
                "oid IN (" +
                Array(filterSpecification.oids.length)
                    .fill("?")
                    .join(",") +
                ")";
            params.push(...filterSpecification.oids.map(oid => parseInt(oid)));
        }

        return {
            whereClause,
            params
        };
    },

    orderBy: "date"
});
