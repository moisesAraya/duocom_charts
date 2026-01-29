const { query } = require('./src/db/firebird');
(async () => {
  try {
    const result = await query('SELECT RDB$PROCEDURE_NAME FROM RDB$PROCEDURES ORDER BY RDB$PROCEDURE_NAME');
    console.log('All procedures in the database:');
    result.forEach(row => console.log('- ' + row['RDB$PROCEDURE_NAME']));
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    require('./src/db/firebird').disposeClient();
  }
})();