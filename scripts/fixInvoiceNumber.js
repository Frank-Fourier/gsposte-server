// noinspection NpmUsedModulesInstalled
const mongodb = require("mongodb");
const { MongoClient } = require("mongodb");
const data = require('./data.json');

const DB_URI = "mongodb://localhost:27017";
const DB_NAME = "gsposte_prod";

(async function() {
    const client = new MongoClient(DB_URI, { useUnifiedTopology: true });

    try {
        await client.connect();
        const db = client.db(DB_NAME);
        console.log("Connected to database @ " + DB_URI);

        const invoices = db.collection("invoices");

        for (const obj of data) {
            await invoices.updateOne({ _id: mongodb.ObjectID(obj.id) }, {
                $set: {
                    number: +obj.new,
                    createdAt: new Date("2022-10-20T09:33:40.051Z"),
                    updatedAt: new Date("2022-10-20T09:33:40.051Z")
            } },{ w: 1 });
            process.stdout.write("Done!\n");
        }

    } finally {
        console.log("Closing connection with database");
        await client.close();
    }
})().catch(console.dir);
