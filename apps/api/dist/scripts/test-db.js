"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const firebird_1 = require("../db/firebird");
const run = async () => {
    try {
        const result = await (0, firebird_1.query)('SELECT CURRENT_TIMESTAMP as now FROM RDB$DATABASE');
        // eslint-disable-next-line no-console
        console.log('Firebird connection successful:', result[0]);
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error('Firebird connection failed', error);
        process.exitCode = 1;
    }
    finally {
        await (0, firebird_1.disposeClient)();
    }
};
void run();
