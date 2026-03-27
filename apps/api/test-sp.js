const { createNativeClient } = require('node-firebird-driver-native');
const fs = require('fs');
require('dotenv').config();

const options = {
    host: process.env.FB_HOST,
    port: parseInt(process.env.FB_PORT || '3050'),
    database: process.env.FB_DATABASE,
    user: process.env.FB_USER,
    password: process.env.FB_PASSWORD,
    client: process.env.FIREBIRD_CLIENT
};

const uri = options.host ? `${options.host}/${options.port}:${options.database}` : options.database;

async function checkTables() {
    let client;
    try {
        client = createNativeClient(options.client);
        const attachment = await client.connect(uri, {
            username: options.user,
            password: options.password
        });
        const transaction = await attachment.startTransaction();

        const sql = `
            SELECT RDB$RELATION_NAME
            FROM RDB$RELATIONS
            WHERE RDB$VIEW_BLR IS NULL 
              AND (RDB$SYSTEM_FLAG IS NULL OR RDB$SYSTEM_FLAG = 0)
        `;
        
        const resultSet = await attachment.executeQuery(transaction, sql);
        const rows = await resultSet.fetchAsObject();
        await resultSet.close();
        
        const tableNames = rows.map(r => r.RDB$RELATION_NAME.trim());
        const ecoTables = tableNames.filter(name => 
            name.toLowerCase().includes('eco') || 
            name.toLowerCase().includes('ind') || 
            name.toLowerCase().includes('utm') || 
            name.toLowerCase().includes('men')
        );
        
        fs.writeFileSync('tables_out.txt', ecoTables.join('\n'));
        console.log('Done.');

        await transaction.commit();
        await attachment.disconnect();
    } catch (err) {
        fs.writeFileSync('tables_out.txt', 'Error: ' + err.message);
    } finally {
        if (client) await client.dispose();
    }
}
checkTables();
