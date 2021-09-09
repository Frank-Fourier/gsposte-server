// noinspection NpmUsedModulesInstalled
const { MongoClient } = require("mongodb");

const DB_URI = "mongodb://localhost:27017";
const DB_NAME = "gsposte_dev";

(async function() {
    const client = new MongoClient(DB_URI, { useUnifiedTopology: true });

    try {
        await client.connect();
        const db = client.db(DB_NAME);
        console.log("Connected to database @ " + DB_URI);

        const senders = db.collection("senders");
        const invoices = db.collection("invoices");

        for await(const invoice of invoices.find({})) {
            const sender = await senders.findOne({ _id: invoice.sender });
            if (!sender) {
                process.stdout.write(`Invoice ${invoice._id} does not have a valid sender! Skipping it...\n`);
                continue;
            }

            process.stdout.write(`Associating invoice ${invoice._id} with sender name '${sender.name}'... `);
            await invoices.updateOne({ _id: invoice._id }, {
                $set: {
                    senderName: sender.name,
                    senderBusinessName: sender.businessName,
                }
            }, { w: 1 });
            process.stdout.write("Done!\n");
        }
    } finally {
        console.log("Closing connection with database");
        await client.close();
    }
})().catch(console.dir);
